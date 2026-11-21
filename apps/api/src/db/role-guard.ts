import { sql } from 'kysely';
import type { Database } from './database';

/**
 * Review M-10: the API must connect as the restricted runtime role. If an operator
 * pastes a privileged connection string (for example Supabase's `postgres`, which
 * bypasses RLS), every row-level policy is silently off. Refuse to start instead.
 */
export async function assertRestrictedRole(db: Database): Promise<string> {
  const { rows } = await sql<{ role: string; bypass: boolean; superuser: boolean }>`
    select current_user as role, r.rolbypassrls as bypass, r.rolsuper as superuser
      from pg_roles r where r.rolname = current_user
  `.execute(db);
  const r = rows[0];
  if (!r) throw new Error('Could not read the database role the API connects as');
  if (r.bypass || r.superuser) {
    throw new Error(
      `DATABASE_URL connects as "${r.role}", which bypasses row-level security. The API must connect as the restricted app_api role.`,
    );
  }
  return r.role;
}
