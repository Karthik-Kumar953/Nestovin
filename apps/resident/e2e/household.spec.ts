import { expect, test, type Page } from '@playwright/test';
import { openTab, requireResidentCreds, resident, signIn } from './fixtures';

/*
 * RES-04/05/14: household members, family requests (Primary only) and
 * reviewed residence changes (src/app/(app)/household.tsx).
 * Form validation only; submitting needs E2E_RESIDENT_ALLOW_WRITES=1.
 */

/** The Card that holds a given H2 (the heading's direct parent). */
const card = (page: Page, heading: string) => page.getByRole('heading', { name: heading }).locator('..');

test.describe('Household and family', () => {
  requireResidentCreds();
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openTab(page, 'Profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    const btn = page.getByRole('button', { name: 'Household and requests' });
    test.skip(!(await btn.isVisible().catch(() => false)), 'Test resident has no active membership (register and verify a flat first)');
    await btn.click();
    await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible();
  });

  test('lists members with their role', async ({ page }) => {
    const members = card(page, 'Members');
    await expect(members).toBeVisible();
    await expect(members.getByText(/^(Primary|Family)$/).first()).toBeVisible();
  });

  test('family request form validates name, phone and relationship (Primary only)', async ({ page }) => {
    const add = card(page, 'Add a family member');
    test.skip(!(await add.isVisible().catch(() => false)), 'Test resident is not the Primary Resident');
    const send = add.getByRole('button', { name: 'Send request' });
    await expect(send).toBeDisabled();
    await add.getByLabel('Full name').fill('Ravi Kumar');
    await add.getByLabel('Mobile number').fill('12345');
    await add.getByLabel('Relationship').fill('Spouse');
    await expect(send).toBeDisabled(); // invalid phone
    await add.getByLabel('Mobile number').fill('9876500011');
    await expect(send).toBeEnabled();
    await add.getByLabel('Relationship').fill('S');
    await expect(send).toBeDisabled(); // relationship too short

    if (resident.allowWrites) {
      await add.getByLabel('Relationship').fill('Spouse');
      await send.click();
      await expect(add.getByText(/Ravi Kumar · Spouse/)).toBeVisible();
      await add.getByRole('button', { name: 'Cancel' }).first().click();
    }
  });

  test('move-out request needs a YYYY-MM-DD date', async ({ page }) => {
    const change = card(page, 'Change your residence details');
    await change.getByRole('radio', { name: 'I am moving out' }).click();
    const send = change.getByRole('button', { name: 'Send request' });
    await expect(send).toBeDisabled();
    await change.getByLabel('Move-out date (YYYY-MM-DD)').fill('31/12/2026');
    await expect(send).toBeDisabled();
    await change.getByLabel('Move-out date (YYYY-MM-DD)').fill('2026-12-31');
    await expect(send).toBeEnabled();
  });

  test('owner/tenant change is offered to the Primary Resident only', async ({ page }) => {
    const isPrimary = await card(page, 'Add a family member').isVisible().catch(() => false);
    const change = card(page, 'Change your residence details');
    await expect(change.getByRole('radio', { name: 'Change owner / tenant' })).toHaveCount(isPrimary ? 1 : 0);
    if (isPrimary) {
      await change.getByRole('radio', { name: 'Change owner / tenant' }).click();
      const send = change.getByRole('button', { name: 'Send request' });
      await expect(send).toBeDisabled();
      await change.getByRole('radio', { name: 'Tenant' }).click();
      await expect(send).toBeEnabled();
    }
  });
});
