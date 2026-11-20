import { createClient } from '@supabase/supabase-js';

/**
 * The ONLY place the Supabase service-role key is used (ADR-001): creating
 * invited admin users and blocking disabled accounts from refreshing sessions.
 * Business data never goes through this client.
 */
export interface AuthAdminAdapter {
  /** Creates the auth user and sends the invite email. Returns the new auth user id. */
  inviteUser(email: string, redirectTo: string): Promise<{ userId: string }>;
  /**
   * DEVELOPMENT BOOTSTRAP ONLY: creates a confirmed user with a password and no
   * email. Never called by the running API.
   */
  createUserWithPassword?(email: string, password: string): Promise<{ userId: string }>;
  /** Best-effort cleanup if the admin profile could not be created after inviting. */
  deleteUser(userId: string): Promise<void>;
  /** Blocks (or unblocks) token refresh for the user. Access is also denied per request via profile status. */
  setBanned(userId: string, banned: boolean): Promise<void>;
}

export function createSupabaseAuthAdmin(opts: { supabaseUrl: string; serviceRoleKey: string }): AuthAdminAdapter {
  const client = createClient(opts.supabaseUrl, opts.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async inviteUser(email, redirectTo) {
      const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error || !data.user) {
        throw new Error(`Invite failed: ${error?.message ?? 'no user returned'}`);
      }
      return { userId: data.user.id };
    },
    async createUserWithPassword(email, password) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error(`Create user failed: ${error?.message ?? 'no user returned'}`);
      return { userId: data.user.id };
    },
    async deleteUser(userId) {
      await client.auth.admin.deleteUser(userId);
    },
    async setBanned(userId, banned) {
      const { error } = await client.auth.admin.updateUserById(userId, {
        ban_duration: banned ? '876000h' : 'none',
      });
      if (error) throw new Error(`Could not update account lock: ${error.message}`);
    },
  };
}
