import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { createDatabase, sslOptions, type Database } from '../../src/db/database';

// Load apps/api/.env for local runs (CI provides real env vars).
const envFile = resolve(import.meta.dirname, '../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const ADMIN_URL = process.env.DATABASE_ADMIN_URL;
export const APP_URL = process.env.DATABASE_URL;
const CA = process.env.DATABASE_SSL_CA_PATH;

/** Integration tests run only when a local Supabase database is configured and reachable. */
export async function databaseAvailable(): Promise<boolean> {
  if (!ADMIN_URL || !APP_URL) return false;
  const client = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 5000, ssl: sslOptions(ADMIN_URL, CA) });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export function adminPool(): pg.Pool {
  return new pg.Pool({ connectionString: ADMIN_URL, max: 2, ssl: sslOptions(ADMIN_URL!, CA) });
}

export function appPool(max = 4): pg.Pool {
  return new pg.Pool({ connectionString: APP_URL, max, ssl: sslOptions(APP_URL!, CA) });
}

export function appDatabase(): Database {
  return createDatabase(APP_URL!, CA);
}

export const uniq = () => Math.random().toString(36).slice(2, 8).toUpperCase();
