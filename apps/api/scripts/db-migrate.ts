/**
 * Applies supabase/migrations/*.sql in order to the database at DATABASE_ADMIN_URL.
 * Each migration runs in its own transaction and is recorded in
 * supabase_migrations.schema_migrations (the same table the Supabase CLI uses),
 * so `supabase db push` / `supabase migration list` stay compatible.
 *
 *   pnpm --filter @nestovin/api db:migrate            # apply pending
 *   pnpm --filter @nestovin/api db:migrate -- --dry   # list pending only
 *
 * Hosted (non-local) targets require ALLOW_REMOTE_DEV_DB=true for now; staging
 * and production migrations will run from CI with an approval step.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { sslOptions } from '../src/db/database';

const dry = process.argv.includes('--dry');
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('Set DATABASE_ADMIN_URL in apps/api/.env');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  console.error(`Refusing to run with NODE_ENV=${process.env.NODE_ENV}; use the CI deployment pipeline.`);
  process.exit(1);
}
const host = new URL(adminUrl).hostname;
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!isLocal && process.env.ALLOW_REMOTE_DEV_DB !== 'true') {
  console.error(`"${host}" is not local. For your Supabase DEV project set ALLOW_REMOTE_DEV_DB=true.`);
  process.exit(1);
}

const dir = resolve(import.meta.dirname, '../../../supabase/migrations');
const files = readdirSync(dir)
  .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
  .sort();

const client = new pg.Client({ connectionString: adminUrl, ssl: sslOptions(adminUrl, process.env.DATABASE_SSL_CA_PATH) });
await client.connect();
try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);
  const { rows } = await client.query<{ version: string }>('select version from supabase_migrations.schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const pending = files.filter((f) => !applied.has(f.slice(0, 14)));

  if (pending.length === 0) {
    console.warn('✓ Database is up to date');
  }
  for (const file of pending) {
    const version = file.slice(0, 14);
    const name = file.slice(15, -4);
    if (dry) {
      console.warn(`• pending: ${file}`);
      continue;
    }
    const sql = readFileSync(resolve(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [
        version,
        name,
        [sql],
      ]);
      await client.query('commit');
      console.warn(`✓ applied ${file}`);
    } catch (err) {
      await client.query('rollback');
      console.error(`✗ ${file} failed; nothing from this migration was applied.`);
      throw err;
    }
  }
} finally {
  await client.end();
}
