/**
 * DEVELOPMENT ONLY. Gives the NOLOGIN runtime roles (app_api, app_worker) a
 * login password so the API can connect as the restricted `app_api` role.
 *
 * Targets:
 *  - local Supabase (127.0.0.1 / localhost): always allowed
 *  - a hosted Supabase DEV project: only with ALLOW_REMOTE_DEV_DB=true
 * Never runs with NODE_ENV=production or staging. Production role passwords are
 * set through the hosting secret process, not this script.
 */
import pg from 'pg';
import { sslOptions } from '../src/db/database';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const password = process.env.APP_API_LOCAL_PASSWORD;

if (!adminUrl || !password) {
  console.error('Set DATABASE_ADMIN_URL and APP_API_LOCAL_PASSWORD in apps/api/.env');
  process.exit(1);
}
if (password.length < 16) {
  console.error('APP_API_LOCAL_PASSWORD must be at least 16 characters');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  console.error(`Refusing to run with NODE_ENV=${process.env.NODE_ENV}`);
  process.exit(1);
}

const host = new URL(adminUrl).hostname;
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host);
if (!isLocal && process.env.ALLOW_REMOTE_DEV_DB !== 'true') {
  console.error(
    `"${host}" is not local. If this is your Supabase DEV project, set ALLOW_REMOTE_DEV_DB=true in apps/api/.env and run again.`,
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: adminUrl, ssl: sslOptions(adminUrl, process.env.DATABASE_SSL_CA_PATH) });
await client.connect();
try {
  const { rows } = await client.query(`select count(*)::int as n from pg_roles where rolname in ('app_api', 'app_worker')`);
  if (rows[0].n !== 2) {
    console.error('Runtime roles not found. Apply the migrations first (supabase/migrations).');
    process.exit(1);
  }
  for (const role of ['app_api', 'app_worker']) {
    await client.query(`alter role ${role} with login password ${client.escapeLiteral(password)}`);
    console.warn(`✓ ${role} can log in (${isLocal ? 'local' : 'hosted dev'} database)`);
  }
} finally {
  await client.end();
}
