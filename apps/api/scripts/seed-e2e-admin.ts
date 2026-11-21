/**
 * DEVELOPMENT ONLY. Creates the Playwright E2E Super Admin on the dev project
 * and enrols TOTP MFA for it, so tests can reach aal2 like a real admin:
 *   1. a confirmed auth user with a generated password (no email is sent)
 *   2. an admin profile with is_super_admin = true (status INVITED until the
 *      first aal2 sign-in, exactly like a real admin)
 *   3. a verified TOTP factor (enrolled through Supabase's MFA API)
 *
 * Writes E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and E2E_ADMIN_TOTP_SECRET to
 * <repo>/e2e/.env.e2e (git-ignored). Nothing secret is printed.
 * Refuses to run in staging/production, or if that admin already exists.
 *
 *   corepack pnpm --filter @nestovin/api seed:e2e-admin
 */
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { sslOptions } from '../src/db/database';
import { createSupabaseAuthAdmin } from '../src/integrations/auth-admin';

const EMAIL = 'e2e-superadmin@nestovin.example';
const env = z
  .object({
    NODE_ENV: z.string().default('development'),
    DATABASE_ADMIN_URL: z.string().min(10),
    DATABASE_SSL_CA_PATH: z.string().optional(),
    SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  })
  .parse(process.env);
if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
  console.error('seed:e2e-admin is for development databases only.');
  process.exit(1);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a base32 secret. */
function totp(secretB32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretB32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, '0');
}

const db = new pg.Client({ connectionString: env.DATABASE_ADMIN_URL, ssl: sslOptions(env.DATABASE_ADMIN_URL, env.DATABASE_SSL_CA_PATH) });
await db.connect();
let createdUserId: string | null = null;
const authAdmin = createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
try {
  if ((await db.query(`select 1 from app.admin_profiles where email = $1`, [EMAIL])).rowCount) {
    console.error(`${EMAIL} already exists. Delete it (and its auth user) first if you need new credentials.`);
    process.exit(1);
  }
  const password = `Nv${randomBytes(24).toString('base64url')}9a`;
  const { userId } = await authAdmin.createUserWithPassword!(EMAIL, password);
  createdUserId = userId;
  await db.query('begin');
  await db.query(
    `insert into app.admin_profiles (id, email, full_name, title, is_super_admin, status, scope_type) values ($1, $2, 'E2E Super Admin', 'Automated test account (dev only)', true, 'INVITED', 'GLOBAL')`,
    [userId, EMAIL],
  );
  await db.query(`insert into app.audit_events (actor_kind, action, target_type, target_id, reason) values ('system', 'admin.bootstrapped', 'admin', $1, 'E2E test Super Admin (dev only)')`, [userId]);
  await db.query('commit');

  // Enrol TOTP as the user (same path the admin portal uses).
  const sb = createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await sb.auth.signInWithPassword({ email: EMAIL, password });
  if (signIn.error) throw new Error(`sign-in failed: ${signIn.error.message}`);
  const enrol = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Playwright' });
  if (enrol.error) throw new Error(`MFA enrol failed: ${enrol.error.message}`);
  const secret = enrol.data.totp.secret;
  const verify = await sb.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: totp(secret) });
  if (verify.error) throw new Error(`MFA verify failed: ${verify.error.message}`);
  await sb.auth.signOut();

  const dir = resolve(import.meta.dirname, '../../../e2e');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, '.env.e2e'),
    [
      '# Playwright E2E Super Admin on the DEV project. Git-ignored. Never use outside development.',
      `E2E_ADMIN_EMAIL=${EMAIL}`,
      `E2E_ADMIN_PASSWORD=${password}`,
      `E2E_ADMIN_TOTP_SECRET=${secret}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  console.warn(`✓ Created ${EMAIL} with TOTP enrolled. Credentials written to e2e/.env.e2e`);
} catch (err) {
  await db.query('rollback').catch(() => undefined);
  if (createdUserId) {
    await db.query(`delete from app.admin_profiles where id = $1`, [createdUserId]).catch(() => undefined);
    await authAdmin.deleteUser(createdUserId).catch(() => undefined);
  }
  throw err;
} finally {
  await db.end();
}
