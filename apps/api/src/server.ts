import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { createDatabase } from './db/database';
import { createSupabaseTokenVerifier } from './auth/token-verifier';
import { createAdminActorLoader } from './auth/admin-actor-loader';
import { createSupabaseAuthAdmin } from './integrations/auth-admin';
import { createSupabaseStorage } from './integrations/storage';
import { createApp } from './app';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const db = createDatabase(env.DATABASE_URL, env.DATABASE_SSL_CA_PATH);

const app = createApp({
  env,
  db,
  logger,
  tokenVerifier: createSupabaseTokenVerifier({ supabaseUrl: env.SUPABASE_URL, jwtSecret: env.SUPABASE_JWT_SECRET }),
  adminLoader: createAdminActorLoader(db),
  authAdmin: createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
  storage: createSupabaseStorage({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Nestovin API listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
