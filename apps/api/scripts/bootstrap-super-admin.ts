/**
 * Creates the FIRST Super Admin (root). Refuses to run if an active Super Admin
 * already exists; further admins are created by the Super Admin in the portal.
 *
 * Production / real person (sends an invite email):
 *   pnpm --filter @nestovin/api bootstrap:super-admin -- --email owner@company.com --name "Full Name"
 *
 * Development only (no email is sent; a strong password is generated and written
 * to apps/api/.dev-superadmin.txt, which is git-ignored):
 *   pnpm --filter @nestovin/api bootstrap:super-admin -- --dev --email superadmin@nestovin.example --name "Dev Super Admin"
 *
 * Either way, the person must enrol TOTP MFA on first sign-in before any admin
 * API call succeeds.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { createSupabaseAuthAdmin } from '../src/integrations/auth-admin';
import { sslOptions } from '../src/db/database';

const { values } = parseArgs({
  // pnpm forwards the "--" separator; parseArgs would treat everything after it as positional.
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { email: { type: 'string' }, name: { type: 'string' }, dev: { type: 'boolean', default: false } },
});
const input = z
  .object({ email: z.email().toLowerCase(), name: z.string().trim().min(2).max(120) })
  .safeParse({ email: values.email, name: values.name });
if (!input.success) {
  console.error('Usage: bootstrap:super-admin -- [--dev] --email <email> --name "<full name>"');
  process.exit(1);
}

const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_ADMIN_URL: z.url(),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    ADMIN_PORTAL_URL: z.url().default('http://localhost:3000/admin'),
  })
  .parse(process.env);

if (values.dev && (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging')) {
  console.error('--dev is not allowed in staging/production. Invite a real person instead.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: env.DATABASE_ADMIN_URL,
  ssl: sslOptions(env.DATABASE_ADMIN_URL, process.env.DATABASE_SSL_CA_PATH),
});
await client.connect();
try {
  const { rows } = await client.query(`select count(*)::int as n from app.admin_profiles where is_super_admin and status <> 'DISABLED'`);
  if (rows[0].n > 0) {
    console.error('A Super Admin already exists. Create further admins from the Admin Portal.');
    process.exit(1);
  }

  const authAdmin = createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  let userId: string;
  let password: string | undefined;
  if (values.dev) {
    // 24 random bytes -> 32 url-safe chars, plus guaranteed upper/lower/digit for the portal's rules.
    password = `Nv${randomBytes(24).toString('base64url')}9a`;
    ({ userId } = await authAdmin.createUserWithPassword!(input.data.email, password));
  } else {
    ({ userId } = await authAdmin.inviteUser(input.data.email, `${env.ADMIN_PORTAL_URL}/accept-invite`));
  }

  await client.query('begin');
  await client.query(
    `insert into app.admin_profiles (id, email, full_name, title, is_super_admin, status, scope_type)
     values ($1, $2, $3, $4, true, 'INVITED', 'GLOBAL')`,
    [userId, input.data.email, input.data.name, values.dev ? 'Temporary development account' : null],
  );
  await client.query(
    `insert into app.audit_events (actor_kind, action, target_type, target_id, reason)
     values ('system', 'admin.bootstrapped', 'admin', $1, $2)`,
    [userId, values.dev ? 'Temporary development Super Admin (no email)' : 'First Super Admin created by bootstrap script'],
  );
  await client.query('commit');

  if (password) {
    writeFileSync(
      resolve(import.meta.dirname, '../.dev-superadmin.txt'),
      [
        '# Temporary DEVELOPMENT Super Admin. Git-ignored. Delete this file after saving the password in a password manager.',
        `# Sign in at ${env.ADMIN_PORTAL_URL}/login, then enrol an authenticator app (TOTP).`,
        `email=${input.data.email}`,
        `password=${password}`,
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    console.warn(`✓ Created ${input.data.email} (no email sent). Credentials written to apps/api/.dev-superadmin.txt`);
  } else {
    console.warn(`✓ Invite sent to ${input.data.email}. They must set a password and enrol MFA on first sign-in.`);
  }
} catch (err) {
  await client.query('rollback').catch(() => undefined);
  throw err;
} finally {
  await client.end();
}
