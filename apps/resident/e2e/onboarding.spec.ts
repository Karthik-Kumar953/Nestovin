import { expect, test } from '@playwright/test';
import { requireResidentCreds, signIn } from './fixtures';

/*
 * RES-02A / RES-03: Home status, flat registration pickers and the interest vote.
 * Needs a Supabase test phone (E2E_RESIDENT_PHONE / E2E_RESIDENT_OTP) and the
 * API running with http://localhost:8081 in CORS_ORIGINS. Read-only: the
 * document upload (native file/camera picker) and final submit are not run here.
 */

test.describe('Onboarding and residence', () => {
  requireResidentCreds();
  test.beforeEach(async ({ page }) => signIn(page));

  test('Home shows the residence state', async ({ page }) => {
    const unregistered = page.getByRole('heading', { name: 'Register your flat' });
    const pending = page.getByRole('heading', { name: 'Verification in progress' });
    const verified = page.getByRole('heading', { name: 'Coming up' });
    await expect(unregistered.or(pending).or(verified)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Updates/ })).toBeVisible();
  });

  test('registration pickers reveal steps in order', async ({ page }) => {
    const registerBtn = page.getByRole('button', { name: 'Register my flat' });
    if (await registerBtn.isVisible()) await registerBtn.click();
    else await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Register your flat' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '1. City' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: '2. Community' })).toHaveCount(0);

    const cities = page.getByRole('radio');
    test.skip((await cities.count()) === 0, 'No active city is configured in the test project');
    await cities.first().click();
    await expect(cities.first()).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: '2. Community' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '3. Tower' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
  });

  test('interest vote requires a place name and a city', async ({ page }) => {
    await page.goto('/vote');
    await expect(page.getByRole('heading', { name: 'Bring Nestovin to you' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit vote' });
    await expect(page.getByRole('radio', { name: 'My community is not listed' })).toHaveAttribute('aria-checked', 'true');
    await expect(submit).toBeDisabled();
    await page.getByLabel('Community name').fill('Test Meadows');
    await expect(submit).toBeDisabled(); // city still missing

    await page.getByRole('radio', { name: 'My city is not listed' }).click();
    await expect(page.getByLabel('City name')).toBeVisible();
    await page.getByLabel('City name').fill('X');
    await expect(submit).toBeDisabled(); // under 2 characters
    await page.getByLabel('City name').fill('Mysuru');
    await expect(submit).toBeEnabled();
  });
});
