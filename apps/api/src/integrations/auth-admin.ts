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
  /** Worker login (ADR-012): confirmed user with an internal email and an HR-issued temporary password. */
  createStaffUser(email: string, password: string): Promise<{ userId: string }>;
  /** Sets a new (temporary) password for a worker. */
  setPassword(userId: string, password: string): Promise<void>;
  /** Best-effort cleanup if the admin profile could not be created after inviting. */
  deleteUser(userId: string): Promise<void>;
  /** Blocks (or unblocks) token refresh for the user. Access is also denied per request via profile status. */
  setBanned(userId: string, banned: boolean): Promise<void>;
  /**
   * DEV-ONLY demo login (DEMO_LOGIN_ENABLED, never in production): makes sure the auth
   * user has this confirmed internal email alias, then issues a magic-link token and
   * returns only its hash (never the action link). 'NO_USER' when the auth user is missing.
   */
  demoSignInTokenHash?(userId: string, aliasEmail: string): Promise<{ tokenHash: string } | 'NO_USER'>;
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
    async createStaffUser(email, password) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { actor: 'employee' } });
      if (error || !data.user) throw new Error(`Create worker login failed: ${error?.message ?? 'no user returned'}`);
      return { userId: data.user.id };
    },
    async setPassword(userId, password) {
      const { error } = await client.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error(`Could not set password: ${error.message}`);
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
    async demoSignInTokenHash(userId, aliasEmail) {
      const found = await client.auth.admin.getUserById(userId);
      if (found.error || !found.data.user) return 'NO_USER';
      const user = found.data.user;
      if (user.email?.toLowerCase() !== aliasEmail.toLowerCase() || !user.email_confirmed_at) {
        const { error } = await client.auth.admin.updateUserById(userId, { email: aliasEmail, email_confirm: true });
        if (error) throw new Error(`Could not prepare the demo account: ${error.message}`);
      }
      const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email: aliasEmail });
      const tokenHash = data?.properties?.hashed_token;
      if (error || !tokenHash) throw new Error(`Could not issue the demo sign-in: ${error?.message ?? 'no token returned'}`);
      return { tokenHash };
    },
  };
}
