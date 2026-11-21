import { test, expect } from '@playwright/test';

/* Sign-in and session gating. These run WITHOUT credentials. */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Admin auth (signed out)', () => {
  test('sign-in page renders with an invitation-only notice', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Nestovin Admin' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Admin access is by invitation only.')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    // The portal must be configured, otherwise sign-in cannot work at all.
    await expect(page.getByText('The portal is not configured.')).toHaveCount(0);
    await expect(page).toHaveTitle(/Nestovin Admin/);
  });

  test('Sign in stays disabled until both email and password are entered', async ({ page }) => {
    await page.goto('/admin/login');
    const submit = page.getByRole('button', { name: 'Sign in' });
    await expect(submit).toBeDisabled({ timeout: 90_000 });
    await page.getByLabel('Email').fill('nobody@example.test');
    await expect(submit).toBeDisabled();
    await page.getByLabel('Password').fill('x');
    await expect(submit).toBeEnabled();
  });

  test('wrong password shows a generic error and stays on sign-in', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(`e2e-no-such-admin-${Date.now()}@example.test`, { timeout: 90_000 });
    await page.getByLabel('Password').fill('Definitely-Wrong-Password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('unauthenticated /admin redirects to sign-in', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 90_000 });
    await expect(page.getByRole('heading', { name: 'Sign in to Nestovin Admin' })).toBeVisible();
  });

  test('unauthenticated deep link redirects to sign-in', async ({ page }) => {
    await page.goto('/admin/access/roles');
    await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 90_000 });
  });

  test('MFA page without a session redirects to sign-in', async ({ page }) => {
    await page.goto('/admin/mfa');
    await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 90_000 });
  });

  test('forgot password page renders and links back to sign-in', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click({ timeout: 90_000 });
    await expect(page).toHaveURL(/\/admin\/forgot-password$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeDisabled();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('expired invitation link shows the expired state', async ({ page }) => {
    await page.goto('/admin/accept-invite');
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible({ timeout: 90_000 });
  });
});
