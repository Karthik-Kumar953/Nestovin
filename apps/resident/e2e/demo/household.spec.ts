import { RESIDENT, back, expect, heading, open, openTab, test } from './demo-fixtures';

/*
 * RES-04/05: household members, family requests (Primary resident only) with the add-member form,
 * and residence change requests. Submitting a family request is not in demo mode (no fixture route),
 * so the form is covered up to its client-side validation.
 */

test.describe('Household', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'household');
    await expect(heading(page, 'Household')).toBeVisible();
  });

  test('shows the flat, its members and pending family requests', async ({ page }) => {
    await expect(heading(page, RESIDENT.community)).toBeVisible();
    await expect(page.getByText(`${RESIDENT.tower} · Flat ${RESIDENT.flat}`, { exact: true })).toBeVisible();
    await expect(heading(page, 'Members')).toBeVisible();
    await expect(page.getByText(RESIDENT.name, { exact: true })).toBeVisible();
    await expect(page.getByText('Primary resident', { exact: true })).toBeVisible();
    await expect(page.getByText('Family member', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(1); // only family members can be removed

    await expect(heading(page, 'Family members')).toBeVisible();
    await expect(page.getByText('They sign in with their own number. Our team checks them in person before access starts.')).toBeVisible();
    await expect(page.getByLabel('Status: Awaiting in-person check').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

    await expect(heading(page, 'Residence changes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a change' })).toBeVisible();
  });

  test('add family member: required-field validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Add a family member' }).click();
    await expect(page.getByRole('heading', { name: 'Add a family member' })).toBeVisible();
    await expect(page.getByText('We verify them in person before they get access.')).toBeVisible();
    const name = page.getByRole('textbox', { name: 'Full name', exact: true });
    const phone = page.getByRole('textbox', { name: 'Mobile number', exact: true });
    const relationship = page.getByRole('textbox', { name: 'Relationship', exact: true });
    await expect(name).toBeVisible();
    await expect(phone).toBeVisible();
    await expect(relationship).toHaveAttribute('placeholder', 'Spouse, parent, child');

    // No errors before the first submit.
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter their full name' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a 10-digit mobile number' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'For example: spouse, parent, child' })).toBeVisible();

    // Fixing a field clears only its own error.
    await name.fill('Sunil Rao');
    await expect(page.getByText('Enter their full name')).toHaveCount(0);
    await phone.fill('12345');
    await expect(page.getByText('Enter a 10-digit mobile number')).toBeVisible();
    await phone.fill('9876543210');
    await expect(page.getByText('Enter a 10-digit mobile number')).toHaveCount(0);
    await relationship.fill('B');
    await expect(page.getByText('For example: spouse, parent, child')).toBeVisible();
    await relationship.fill('Brother');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('add family member sheet closes without sending', async ({ page }) => {
    await page.getByRole('button', { name: 'Add a family member' }).click();
    await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Full name', exact: true })).toHaveCount(0);
    await expect(heading(page, 'Members')).toBeVisible();
  });

  test('"Request a change" opens the residence change form', async ({ page }) => {
    await page.getByRole('button', { name: 'Request a change' }).click();
    await expect(heading(page, 'Change residence')).toBeVisible();
    await expect(heading(page, 'What changed?')).toBeVisible();
    const send = page.getByRole('button', { name: 'Send for review' });
    await expect(send).toHaveCount(0); // no action until the resident says what changed
    await page.getByRole('radio', { name: /^Owner or tenant changed, / }).click();
    await expect(heading(page, 'You are now the')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Owner, Current' })).toBeDisabled();
    await expect(send).toBeDisabled();
    await page.getByRole('radio', { name: /^Tenant/ }).click();
    await expect(send).toBeEnabled();
    await back(page).click();
    await expect(heading(page, 'Household')).toBeVisible();
  });
});

test('Profile → Household', async ({ page }) => {
  await open(page);
  await openTab(page, 'Profile');
  await page.getByRole('button', { name: 'Household, Family members and access' }).click();
  await expect(heading(page, 'Household')).toBeVisible();
});
