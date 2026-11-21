import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const ADMIN_STORAGE_STATE = 'e2e/.auth/admin.json';

// The Resident Expo web build is opt-in: it needs react-native-web in apps/resident and its own dev server.
const RESIDENT_WEB = process.env.E2E_RESIDENT_WEB === '1' || process.argv.some((a) => a.includes('resident-web'));
const RESIDENT_WEB_URL = process.env.E2E_RESIDENT_WEB_URL ?? 'http://localhost:8081';

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
            fullyParallel: false, // signed-in specs share one Supabase test phone (60 s OTP resend limit)
            use: { ...devices['Pixel 7'], baseURL: RESIDENT_WEB_URL },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: 'corepack pnpm --filter @nestovin/api dev',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'corepack pnpm --filter @nestovin/web dev',
      url: `${WEB_URL}/admin/login`,
      reuseExistingServer: true,
      timeout: 240_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    ...(RESIDENT_WEB
      ? [
          {
            command: 'corepack pnpm --filter @nestovin/resident exec expo start --web --port 8081',
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
