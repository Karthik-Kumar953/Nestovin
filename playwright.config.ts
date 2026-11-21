import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/*
 * Nestovin Admin portal E2E suite.
 *
 * Credentials are read from env vars only (E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD,
 * E2E_ADMIN_TOTP_SECRET), optionally loaded from the git-ignored e2e/.env.e2e.
 * Without them the authenticated specs skip; the sign-in/redirect specs still run.
 */
const envFile = join(import.meta.dirname, 'e2e', '.env.e2e');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// One id per `playwright test` invocation, shared by every worker (workers inherit env).
process.env.E2E_RUN_ID ??= randomBytes(3).toString('hex').toUpperCase();

// Dedicated ports: other sessions run their own API on :4000/:4100 and web on :3000/:3100,
// and reusing someone else's server (or racing it for the port) breaks sign-in.
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3200';
const API_PORT = process.env.E2E_API_PORT ?? '4200';
const WEB_URL = process.env.E2E_WEB_URL ?? `http://localhost:${WEB_PORT}`;
const API_URL = process.env.E2E_API_URL ?? `http://localhost:${API_PORT}`;
const ADMIN_STORAGE_STATE = 'e2e/.auth/admin.json';

// The Resident Expo web build is opt-in: it needs react-native-web in apps/resident and its own dev server.
const RESIDENT_WEB = process.env.E2E_RESIDENT_WEB === '1' || process.argv.some((a) => a.includes('resident-web'));
const RESIDENT_WEB_PORT = process.env.E2E_RESIDENT_WEB_PORT ?? '8092'; // never the developer's :8081
const RESIDENT_WEB_URL = process.env.E2E_RESIDENT_WEB_URL ?? `http://localhost:${RESIDENT_WEB_PORT}`;

// Resident app in its DEV-ONLY demo mode (EXPO_PUBLIC_DEMO=1): fixtures, no API, no sign-in.
// E2E_RESIDENT_APP_DIR points at the Resident app to serve (e.g. another worktree's apps/resident
// until its branch is merged); port 8091 so it never collides with a developer's :8081.
const RESIDENT_DEMO = process.env.E2E_RESIDENT_DEMO === '1' || process.argv.some((a) => a.includes('resident-demo'));
const RESIDENT_DEMO_PORT = process.env.E2E_RESIDENT_DEMO_PORT ?? '8091';
const RESIDENT_DEMO_URL = `http://localhost:${RESIDENT_DEMO_PORT}`;
const RESIDENT_APP_DIR = resolve(process.env.E2E_RESIDENT_APP_DIR ?? join(import.meta.dirname, 'apps', 'resident'));

// Only start the API and the admin web app when an admin project can run.
const ONLY_RESIDENT =
  process.argv.some((a) => /resident-(web|demo)/.test(a)) && !process.argv.some((a) => /project[= ]?(admin|setup)\b/.test(a));

export default defineConfig({
  testDir: 'apps/web/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Flows create shared data (cities, clusters, payroll months); keep it predictable.
  workers: process.env.CI ? 1 : 2,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // First hit of a route compiles it in `next dev`; be patient.
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testDir: 'apps/web/e2e',
      testMatch: /.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE, acceptDownloads: true },
    },
    ...(RESIDENT_WEB
      ? [
          {
            name: 'resident-web',
            testDir: 'apps/resident/e2e',
            testMatch: /.*\.spec\.ts$/,
            testIgnore: /[\\/]demo[\\/]/,
            fullyParallel: false, // signed-in specs share one Supabase test phone (60 s OTP resend limit)
            use: { ...devices['Pixel 7'], baseURL: RESIDENT_WEB_URL },
          },
        ]
      : []),
    ...(RESIDENT_DEMO
      ? [
          {
            name: 'resident-demo',
            testDir: 'apps/resident/e2e/demo',
            testMatch: /.*\.spec\.ts$/,
            use: { ...devices['Pixel 7'], baseURL: RESIDENT_DEMO_URL },
          },
        ]
      : []),
  ],
  webServer: [
    ...(ONLY_RESIDENT ? [] : adminServers()),
    ...(RESIDENT_DEMO
      ? [
          {
            command: `npx expo start --web --port ${RESIDENT_DEMO_PORT}`,
            cwd: RESIDENT_APP_DIR,
            url: RESIDENT_DEMO_URL,
            reuseExistingServer: true,
            timeout: 240_000, // first Metro web bundle is slow
            env: { EXPO_PUBLIC_DEMO: '1', CI: '1', BROWSER: 'none' },
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
    ...(RESIDENT_WEB
      ? [
          {
            // Same app dir as the demo project, so the resident branch can be tested before it is merged.
            command: `npx expo start --web --port ${RESIDENT_WEB_PORT}`,
            cwd: RESIDENT_APP_DIR,
            url: RESIDENT_WEB_URL,
            reuseExistingServer: true,
            timeout: 180_000,
            env: { CI: '1', BROWSER: 'none' },
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
  ],
});

function adminServers() {
  return [
    {
      // No watch mode: a tsx-watch restart mid-run logged every spec out ("Cannot reach the server").
      command: 'corepack pnpm --filter @nestovin/api exec tsx --env-file-if-exists=.env src/server.ts',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 180_000,
      // Process env wins over apps/api/.env (--env-file-if-exists never overrides).
      env: { PORT: API_PORT, CORS_ORIGINS: WEB_URL },
      stdout: 'ignore' as const,
      stderr: 'pipe' as const,
    },
    {
      command: `corepack pnpm --filter @nestovin/web exec next dev --port ${WEB_PORT}`,
      url: `${WEB_URL}/admin/login`,
      reuseExistingServer: true,
      // The admin calls the API directly (no dev rewrite to :4000).
      env: { NEXT_PUBLIC_API_URL: API_URL },
      timeout: 240_000,
      stdout: 'ignore' as const,
      stderr: 'pipe' as const,
    },
  ];
}
