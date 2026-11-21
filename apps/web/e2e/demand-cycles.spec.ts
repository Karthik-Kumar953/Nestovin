import { test, expect, newAdminPage, requireAdminCreds, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq } from './support/fixtures';
import { provisionActiveCommunity, type ProvisionedCommunity } from './support/flows';

test.describe.configure({ mode: 'serial' });

test.describe('Demand cycles', () => {
  requireAdminCreds();
  let p: ProvisionedCommunity;
  const cycleName = uniq('Cycle');

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(420_000);
    const page = await newAdminPage(browser);
    p = await provisionActiveCommunity(page);
    await page.context().close();
  });

  test('cycles list loads for the community', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await expectPageTitle(page, 'Demand cycles');
    await expect(page.getByRole('combobox', { name: 'Community' })).toHaveValue(p.community.id);
    await expectListLoaded(page, 'Demand cycles', ['No demand cycles']);
  });

  test('create a draft cycle', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('button', { name: 'New cycle' }).click();
    const d = dialog(page, 'New demand cycle');
    await expect(d.getByText('Nothing is visible to residents until you publish.', { exact: false })).toBeVisible();
    await d.getByLabel('Name').fill(cycleName);
    await d.getByLabel('Initial payment %').fill('30');
    await d.getByRole('checkbox', { name: new RegExp(`^${p.plan.name} \\(${p.plan.code}, 30 days\\)$`) }).check();
    await d.getByRole('button', { name: 'Save draft' }).click();
    await expect(d).toBeHidden();
    const row = page.getByRole('table', { name: 'Demand cycles' }).getByRole('row').filter({ hasText: cycleName });
    await expect(row.getByText('Draft')).toBeVisible();
    await expect(row.getByText('30%')).toBeVisible();
  });

  test('closing time must be after opening time', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('button', { name: 'New cycle' }).click();
    const d = dialog(page, 'New demand cycle');
    await d.getByLabel('Name').fill(uniq('Bad cycle'));
    await d.getByLabel('Opens').fill('2030-01-10T10:00');
    await d.getByLabel('Closes').fill('2030-01-05T10:00');
    await d.getByRole('button', { name: 'Save draft' }).click();
    await expect(d.getByText('The cycle must close after it opens')).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();
  });

  test('publish the cycle', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('link', { name: cycleName }).click();
    await expectPageTitle(page, cycleName);
    await page.getByRole('button', { name: 'Publish cycle' }).click();
    await expect(page.getByRole('button', { name: 'Extend', exact: true })).toBeVisible();
    await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('30% (locked)')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Demand' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Slots and commencement' })).toBeVisible();
  });

  test('extend the collection window', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('link', { name: cycleName }).click();
    await page.getByRole('button', { name: 'Extend', exact: true }).click();
    const d = dialog(page, 'Extend collection window');
    const closes = d.getByLabel('New closing time');
    const later = new Date(Date.now() + 14 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await closes.fill(`${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T18:00`);
    await d.getByLabel('Reason').fill('E2E extension');
    await d.getByRole('button', { name: 'Extend' }).click();
    await expect(d).toBeHidden();
  });

  test('create a slot set for the published cycle', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('link', { name: cycleName }).click();
    await page.getByRole('button', { name: 'New slot set' }).click();
    const d = dialog(page, 'New slot set');
    await d.getByRole('button', { name: 'Create' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add slot' })).toBeVisible();
  });

  test('slot set publish needs paid commitments', async () => {
    test.skip(true, 'Approve and publish needs an allocated COMMITTED request, i.e. a resident paying the initial amount in the Resident app (Razorpay).');
  });

  test('close the cycle', async ({ page }) => {
    await gotoAdmin(page, `/demand/cycles?communityId=${p.community.id}`);
    await page.getByRole('link', { name: cycleName }).click();
    await page.getByRole('button', { name: 'Close now' }).click();
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close now' })).toHaveCount(0);
  });
});
