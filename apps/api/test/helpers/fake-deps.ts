import type { GrantKey } from '@nestovin/contracts';
import { loadEnv } from '../../src/config/env';
import { createLogger } from '../../src/lib/logger';
import type { AppDeps } from '../../src/http/context';
import type { AdminActor } from '../../src/auth/permissions';
import type { LoadedAdmin } from '../../src/auth/admin-actor-loader';
import type { Database } from '../../src/db/database';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://app_api:x@127.0.0.1:5432/postgres',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-real',
  IP_HASH_SALT: 'test-salt-0123456789',
  ADMIN_REQUIRE_MFA: 'true',
};

export function actor(overrides: Partial<Omit<AdminActor, 'grants'>> & { grants?: GrantKey[] } = {}): AdminActor {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    fullName: 'Test Admin',
    isSuperAdmin: false,
    scope: { type: 'GLOBAL' },
    ...overrides,
    grants: new Set(overrides.grants ?? []),
  };
}

/**
 * Deps with fake auth. Tokens are plain strings:
 *   "token:<aal>:<userId>"  -> verified with that aal and subject
 *   anything else           -> verification fails
 * `admins` maps userId -> loaded admin (missing = no admin profile).
 */
export function fakeDeps(admins: Record<string, LoadedAdmin>, envOverrides: Record<string, string> = {}): AppDeps {
  const env = loadEnv({ ...TEST_ENV, ...envOverrides } as NodeJS.ProcessEnv);
  return {
    env,
    logger: createLogger('silent', false),
    // Unit tests only exercise paths that are rejected before any database access.
    db: new Proxy({} as Database, {
      get() {
        throw new Error('Database must not be reached in this unit test');
      },
    }),
    tokenVerifier: {
      async verify(token) {
        const [prefix, aal, userId] = token.split(':');
        if (prefix !== 'token' || !aal || !userId) throw new Error('bad token');
        return { userId, aal, email: undefined, phone: undefined, sessionId: undefined };
      },
    },
    adminLoader: {
      async load(userId) {
        return admins[userId] ?? null;
      },
    },
    authAdmin: {
      async inviteUser() {
        throw new Error('not used');
      },
      async deleteUser() {},
      async setBanned() {},
    },
    storage: {
      async createSignedUpload() {
        throw new Error('not used');
      },
      async stat() {
        return null;
      },
      async createSignedDownload() {
        return 'https://example.test/signed';
      },
    },
    payments: null,
  };
}
