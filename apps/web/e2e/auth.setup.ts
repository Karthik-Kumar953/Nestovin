import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { ADMIN_STORAGE_STATE, CREDS_MISSING, adminCreds } from './support/fixtures';
import { totp, totpSecondsRemaining } from './support/totp';

/**
 * Signs the test Super Admin in once (password + TOTP, aal2) and saves the
 * browser state. Supabase keeps its session in localStorage, which
 * storageState captures for the web origin.
 */
setup('sign in as the E2E admin', async ({ page }) => {
  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  const creds = adminCreds();
  if (!creds) {
    // Keep the admin project loadable; its specs skip on their own.
    writeFileSync(ADMIN_STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, CREDS_MISSING);
    return;
  }

  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Nestovin Admin' })).toBeVisible({ timeout: 90_000 });
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 30_000 });
  const enrolHeading = page.getByRole('heading', { name: 'Set up two-factor verification' });
  const challengeHeading = page.getByRole('heading', { name: 'Two-factor verification', exact: true });
  await expect(enrolHeading.or(challengeHeading)).toBeVisible();
  if (await enrolHeading.isVisible()) {
    throw new Error(
      'The E2E admin has no verified TOTP factor, so the portal started a new enrolment. ' +
        'Enrol the factor with E2E_ADMIN_TOTP_SECRET first (see docs/testing/E2E.md).',
    );
  }
  await expect(page.getByText('Preparing…')).toHaveCount(0);

  // Avoid submitting a code that expires mid-request.
  if (totpSecondsRemaining() < 4) await page.waitForTimeout((totpSecondsRemaining() + 1) * 1000);
  await page.getByLabel('6-digit code').fill(totp(creds.totpSecret));
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
