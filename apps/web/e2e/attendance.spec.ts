import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded } from './support/fixtures';

test.describe('Attendance', () => {
  test('attendance page loads with date range and filter', async ({ page }) => {
    await gotoAdmin(page, '/attendance');
    await expectPageTitle(page, 'Attendance');
    await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    await expect(page.getByLabel('To', { exact: true })).toBeVisible();
    await expectListLoaded(page, 'Attendance records', ['Nothing needs attention', 'No visits in this period']);
    await page.getByRole('checkbox', { name: 'Only items needing attention' }).uncheck();
    await expectListLoaded(page, 'Attendance records', ['No visits in this period', 'Nothing needs attention']);
  });

  test('geofence radius can be set for the selected community', async ({ page }) => {
    await gotoAdmin(page, '/attendance');
    const radius = page.getByRole('spinbutton', { name: 'Geofence radius in metres' });
    test.skip(!(await radius.isVisible()), 'No community is available to configure.');
    // Leave other teams' communities alone: only E2E communities are changed.
    const community = page.getByRole('combobox', { name: 'Community' });
    const e2eOption = community.locator('option').filter({ hasText: /^E2E-/ }).first();
    test.skip((await e2eOption.count()) === 0, 'No E2E community exists yet (run the catalogue spec first).');
    await community.selectOption((await e2eOption.getAttribute('value')) ?? '');
    await radius.fill('250');
    await page.getByRole('button', { name: 'Set radius' }).click();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  });

  test('review a flagged check-in / record a no-show', async () => {
    test.skip(true, 'Needs assigned visits and Worker-app check-ins.');
  });

  test('corrections list loads for each status', async ({ page }) => {
    await gotoAdmin(page, '/attendance/corrections');
    await expectPageTitle(page, 'Attendance corrections');
    await expectListLoaded(page, 'Correction requests', ['No correction requests']);
    for (const label of ['Approved', 'Rejected']) {
      await page.getByRole('combobox', { name: 'Status' }).selectOption({ label });
      await expectListLoaded(page, 'Correction requests', ['No correction requests']);
    }
  });

  test('approve / reject a correction', async () => {
    test.skip(true, 'Correction requests are raised in the Worker app.');
  });
});
