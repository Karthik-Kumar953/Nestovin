import { expect, test } from '@playwright/test';
import { openTab, requireResidentCreds, resident, signIn } from './fixtures';

/*
 * RES-10/11 visits and check-in code, RES-13 in-app inbox, RES-14 profile and sign-out.
 * The check-in QR uses react-native-svg, which renders on web.
 */

test.describe('Visits, updates and profile', () => {
  requireResidentCreds();
  test.beforeEach(async ({ page }) => signIn(page));

  test('visits lists upcoming and recent sections', async ({ page }) => {
    await openTab(page, 'Visits');
    await expect(page.getByRole('heading', { name: 'Visits' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
  });

  test('check-in code sheet shows a 6-digit code with a countdown', async ({ page }) => {
    await openTab(page, 'Visits');
    const show = page.getByRole('button', { name: 'Show check-in code' }).first();
    test.skip(!(await show.isVisible().catch(() => false)), 'No visit today that allows a check-in code');
    await show.click();
    await expect(page.getByRole('heading', { name: 'Check-in code' })).toBeVisible();
    await expect(page.getByLabel(/^Code \d( \d){5}$/)).toBeVisible();
    await expect(page.getByText(/^Valid for \d+:\d{2}$/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Check-in code' })).toHaveCount(0);
  });

  test('Updates opens the in-app inbox', async ({ page }) => {
    await page.getByRole('button', { name: /^Updates/ }).click();
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    const empty = page.getByText('No updates yet');
    const markAll = page.getByRole('button', { name: 'Mark all read' });
    const anyItem = page.getByText(/\d{4}, \d{1,2}:\d{2}/).first();
    await expect(empty.or(markAll).or(anyItem)).toBeVisible();
  });

  test('profile shows the signed-in phone and validates nothing destructive', async ({ page }) => {
    await openTab(page, 'Profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    const digits = resident.phone.replace(/\D/g, '').slice(-10);
    await expect(page.getByText(new RegExp(`Signed in as \\+?\\d*${digits}`))).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await expect(page.getByLabel('Email (optional)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });

  test('sign out returns to the sign-in screen', async ({ page }) => {
    await openTab(page, 'Profile');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Nestovin' })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
