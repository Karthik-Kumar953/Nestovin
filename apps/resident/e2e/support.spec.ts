import { expect, test } from '@playwright/test';
import { openTab, requireResidentCreds, resident, signIn } from './fixtures';

/* RES-12: support tickets (src/app/(app)/support.tsx, ticket/[id].tsx). */

test.describe('Support tickets', () => {
  requireResidentCreds();
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openTab(page, 'Support');
    await expect(page.getByRole('heading', { name: 'Support' })).toBeVisible();
  });

  test('lists tickets or shows the empty state', async ({ page }) => {
    const empty = page.getByText('No tickets', { exact: true });
    // Ticket cards are pressable Cards showing "<reference> · <category> · <date>".
    const anyTicket = page.getByRole('button').filter({ hasText: ' · ' }).first();
    await expect(empty.or(anyTicket)).toBeVisible();
  });

  test('new ticket form validates category, subject and details', async ({ page }) => {
    await page.getByRole('button', { name: 'New ticket' }).click();
    await expect(page.getByRole('heading', { name: 'What do you need help with?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New ticket' })).toHaveCount(0);
    const send = page.getByRole('button', { name: 'Send', exact: true });
    await expect(send).toBeDisabled();

    const categories = page.getByRole('radio');
    test.skip((await categories.count()) === 0, 'No ticket categories configured');
    await categories.first().click();
    await page.getByLabel('Subject').fill('ab');
    await page.getByLabel('Details').fill('Leaking tap in kitchen');
    await expect(send).toBeDisabled(); // subject under 3
    await page.getByLabel('Subject').fill('Kitchen tap');
    await page.getByLabel('Details').fill('abcd');
    await expect(send).toBeDisabled(); // details under 5
    await page.getByLabel('Details').fill('Leaking tap in kitchen');
    await expect(send).toBeEnabled();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'New ticket' })).toBeVisible();
  });

  test('creates a ticket and replies to it', async ({ page }) => {
    test.skip(!resident.allowWrites, 'Creates data: set E2E_RESIDENT_ALLOW_WRITES=1 to run');
    const subject = `E2E ticket ${Date.now()}`;
    await page.getByRole('button', { name: 'New ticket' }).click();
    await page.getByRole('radio').first().click();
    await page.getByLabel('Subject').fill(subject);
    await page.getByLabel('Details').fill('Created by the Playwright resident-web suite. Safe to close.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByRole('heading', { name: subject })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Open', { exact: true })).toBeVisible();
    await page.getByLabel('Reply').fill('Adding a reply from the e2e suite.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByText('Adding a reply from the e2e suite.')).toBeVisible();
    await expect(page.getByLabel('Reply')).toHaveValue('');

    await page.getByRole('button', { name: '‹ Back to support' }).click();
    await expect(page.getByRole('button').filter({ hasText: subject })).toBeVisible();
  });
});
