import { test, expect, dialog, gotoAdmin, newAdminPage, requireAdminCreds } from './support/fixtures';
import {
  addCategory,
  addTask,
  addTimeWindow,
  assignCommunityToCluster,
  createCity,
  createCluster,
  createCommunity,
  enableServices,
  gotoStep,
  importFlatsViaGrid,
  type Category,
  type Community,
} from './support/flows';

test.describe.configure({ mode: 'serial' });

/** Community setup wizard steps 1–4 plus the dashboard-grid migration (Towers & flats). */
test.describe('Community setup wizard and grid migration', () => {
  requireAdminCreds();
  let community: Community;
  let category: Category;
  let serviceName: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await newAdminPage(browser);
    const city = await createCity(page);
    const cluster = await createCluster(page);
    community = await createCommunity(page, city);
    await assignCommunityToCluster(page, community, cluster);
    await page.context().close();
  });

  test('wizard shows all eight steps and navigates', async ({ page }) => {
    await gotoStep(page, community, 'services');
    const steps = page.getByRole('navigation', { name: 'Setup steps' }).getByRole('button');
    await expect(steps).toHaveCount(8);
    for (const label of ['Services & time windows', 'Residence categories', 'Towers & flats', 'Tasks', 'Plans & packages', 'Price matrix', 'Review & publish', 'Activate']) {
      await expect(steps.filter({ hasText: label })).toHaveCount(1);
    }
    await expect(steps.filter({ hasText: 'Services & time windows' })).toHaveAttribute('aria-current', 'step');
    await page.getByRole('button', { name: 'Next step →' }).click();
    await expect(steps.filter({ hasText: 'Residence categories' })).toHaveAttribute('aria-current', 'step');
    await expect(page).toHaveURL(/step=categories/);
    await page.getByRole('button', { name: '← Previous step' }).click();
    await expect(page).toHaveURL(/step=services|setup$/);
  });

  test('step 1: enable a service and add a time window', async ({ page }) => {
    serviceName = await enableServices(page, community);
    await addTimeWindow(page, community);
  });

  test('step 2: add a residence category', async ({ page }) => {
    category = await addCategory(page, community);
  });

  test('step 3: grid rows are validated before submission', async ({ page }) => {
    await gotoStep(page, community, 'import');
    const grid = page.getByRole('table', { name: 'Flats to import' });
    // Flat number without tower / category must fail the check.
    await grid.getByLabel(/^Row\ 1\ Flat\ number( \*)?$/).fill('999');
    await page.getByRole('button', { name: 'Check rows' }).click();
    await expect(page.getByText(/^Row 1: /)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Submit for approval/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Remove row 1' }).click();
  });

  test('step 3: enter flats in the grid, approve and commit the batch', async ({ page }) => {
    await importFlatsViaGrid(page, community, category, ['101', '102', '201']);
    const history = page.getByRole('table', { name: 'Import history' });
    await expect(history.getByRole('row').filter({ hasText: 'Dashboard table' }).first()).toBeVisible();
  });

  test('step 3: Excel template downloads', async ({ page }) => {
    await gotoStep(page, community, 'import');
    await page.getByRole('tab', { name: 'Excel import' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download template' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test('step 3: reject an Excel upload that is not a workbook', async ({ page }) => {
    await gotoStep(page, community, 'import');
    await page.getByRole('tab', { name: 'Excel import' }).click();
    await page.getByLabel('Choose Excel file').setInputFiles({ name: 'not-a-workbook.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a zip') });
    const upload = page.getByRole('button', { name: 'Upload filled workbook' });
    if (await upload.isEnabled()) await upload.click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('step 4: add a task', async ({ page }) => {
    await addTask(page, community, serviceName);
  });

  test('activation checklist reflects completed setup', async ({ page }) => {
    await gotoStep(page, community, 'activate');
    await expect(page.getByRole('heading', { level: 2, name: 'Activate community' })).toBeVisible();
    const checklist = page.locator('ul.checklist');
    await expect(checklist.getByText('Assigned to a cluster')).toBeVisible();
    await expect(checklist.getByText(/3 active flat\(s\)/)).toBeVisible();
    await expect(checklist.getByText(/1 service\(s\) enabled/)).toBeVisible();
    // No catalogue yet, so activation must be blocked.
    await expect(page.getByRole('button', { name: 'Activate community' })).toBeDisabled();
  });

  test('flat edit dialog offers the new pricing category', async ({ page }) => {
    await gotoAdmin(page, `/locations/communities/${community.id}`);
    const towerRow = page.getByRole('table', { name: 'Towers' }).getByRole('row').filter({ hasText: 'E2E Tower A' });
    await towerRow.getByRole('button', { name: 'Flats' }).click();
    const flats = page.getByRole('table', { name: 'Flats in E2E Tower A' });
    await expect(flats.getByText(category.label).first()).toBeVisible();
    await flats.getByRole('row').filter({ hasText: '101' }).getByRole('button', { name: 'Edit' }).click();
    const d = dialog(page, 'Edit flat 101');
    await expect(d.getByLabel('Pricing category').locator('option').filter({ hasText: category.label })).toHaveCount(1);
    await d.getByRole('button', { name: 'Cancel' }).click();
  });
});
