import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, uniq } from './support/fixtures';

const RESIDENT_APP = 'Needs a resident submission from the Resident app (no Admin UI to create it).';

test.describe('Residents and residence verification', () => {
  test('residents list loads, searches and filters', async ({ page }) => {
    await gotoAdmin(page, '/residents');
    await expectPageTitle(page, 'Residents');
    await expectListLoaded(page, 'Residents', ['No residents found']);
    await page.getByRole('combobox', { name: 'Account' }).selectOption('SUSPENDED');
    await expectListLoaded(page, 'Residents', ['No residents found']);
    await page.getByRole('combobox', { name: 'Account' }).selectOption('');
    await page.getByRole('searchbox', { name: 'Search name or phone' }).fill(uniq('nobody'));
    await expect(page.getByText('No residents found')).toBeVisible();
  });

  test('resident detail opens from the list', async ({ page }) => {
    await gotoAdmin(page, '/residents');
    const view = page.getByRole('table', { name: 'Residents' }).getByRole('button', { name: 'View' }).first();
    const empty = page.getByText('No residents found');
    await expect(view.or(empty).first()).toBeVisible();
    test.skip(await empty.isVisible(), 'No residents exist yet: ' + RESIDENT_APP);
    await view.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Residence history' })).toBeVisible();
  });

  test('suspend / reactivate a resident', async () => {
    test.skip(true, 'Would suspend a real resident account; ' + RESIDENT_APP);
  });

  test('verification queue loads for each decision', async ({ page }) => {
    await gotoAdmin(page, '/residents/verifications');
    await expectPageTitle(page, 'Residence verification');
    await expectListLoaded(page, 'Residence verification requests', ['Nothing to review']);
    for (const label of ['Approved', 'Rejected']) {
      await page.getByRole('combobox', { name: 'Decision' }).selectOption({ label });
      await expectListLoaded(page, 'Residence verification requests', ['No requests']);
    }
  });

  test('approve / reject a residence verification', async () => {
    test.skip(true, RESIDENT_APP + ' The resident must register a flat and upload a document.');
  });
});

test.describe('Family requests', () => {
  test('family requests load for each status', async ({ page }) => {
    await gotoAdmin(page, '/residents/family-requests');
    await expectPageTitle(page, 'Family requests');
    await expectListLoaded(page, 'Family requests', ['Nothing to review']);
    for (const label of ['Approved', 'Rejected', 'Cancelled by resident']) {
      await page.getByRole('combobox', { name: 'Status' }).selectOption({ label });
      await expectListLoaded(page, 'Family requests', ['No requests']);
    }
  });

  test('approve / reject a family request', async () => {
    test.skip(true, RESIDENT_APP + ' A verified Primary Resident must request a family member.');
  });
});

test.describe('Residence change requests', () => {
  test('change requests load for each status', async ({ page }) => {
    await gotoAdmin(page, '/residents/change-requests');
    await expectPageTitle(page, 'Residence change requests');
    await expectListLoaded(page, 'Residence change requests', ['No requests']);
    for (const label of ['Approved', 'Rejected', 'Cancelled by resident']) {
      await page.getByRole('combobox', { name: 'Status' }).selectOption({ label });
      await expectListLoaded(page, 'Residence change requests', ['No requests']);
    }
  });

  test('approve / reject a change request', async () => {
    test.skip(true, RESIDENT_APP + ' A resident must ask to change occupancy or move out.');
  });
});
