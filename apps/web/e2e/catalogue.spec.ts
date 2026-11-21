import { test, expect, newAdminPage, requireAdminCreds, gotoAdmin } from './support/fixtures';
import {
  activateCommunity,
  addCategory,
  addPlanWithService,
  addTask,
  assignCommunityToCluster,
  createCity,
  createCluster,
  createCommunity,
  enableServices,
  gotoStep,
  importFlatsViaGrid,
  publishCatalogue,
  setPackagePrice,
  type Category,
  type Community,
  type Plan,
} from './support/flows';

test.describe.configure({ mode: 'serial' });

/** Plans & packages → Price matrix → Review & publish → Activate. */
test.describe('Catalogue: plans, prices, publish and activate', () => {
  requireAdminCreds();
  let community: Community;
  let category: Category;
  let serviceName: string;
  let taskName: string;
  let plan: Plan;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await newAdminPage(browser);
    const city = await createCity(page);
    const cluster = await createCluster(page);
    community = await createCommunity(page, city);
    await assignCommunityToCluster(page, community, cluster);
    serviceName = await enableServices(page, community);
    category = await addCategory(page, community);
    await importFlatsViaGrid(page, community, category);
    taskName = await addTask(page, community, serviceName);
    await page.context().close();
  });

  test('publish step blocks when there is no draft', async ({ page }) => {
    await gotoStep(page, community, 'publish');
    await expect(page.getByText('There is no draft to publish. Start a draft in the Plans step.')).toBeVisible();
  });

  test('start a draft and add a plan with a service and task', async ({ page }) => {
    plan = await addPlanWithService(page, community, serviceName, taskName);
    await expect(page.getByText(`${taskName} · Every visit`)).toBeVisible();
  });

  test('price matrix flags invalid amounts', async ({ page }) => {
    await gotoStep(page, community, 'prices');
    const cell = page.getByLabel(`${plan.name}, ${category.label}, package`);
    await cell.fill('12.345');
    await expect(page.getByText(/^Fix 1 invalid amount\(s\)/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save prices' })).toBeDisabled();
  });

  test('set a package price', async ({ page }) => {
    await setPackagePrice(page, community, plan, category, '4,500');
    await gotoStep(page, community, 'prices');
    await expect(page.getByLabel(`${plan.name}, ${category.label}, package`)).toHaveValue(/4,?500/);
  });

  test('publish the catalogue', async ({ page }) => {
    const version = await publishCatalogue(page, community);
    const history = page.getByRole('table', { name: 'Catalogue versions' });
    await expect(history.getByRole('row').filter({ hasText: String(version) }).filter({ hasText: 'Published' })).toBeVisible();
    // A published version is frozen.
    await gotoStep(page, community, 'plans');
    await expect(page.getByText(new RegExp(`Version ${version} is published and frozen`))).toBeVisible();
    await expect(page.getByRole('button', { name: `New draft from version ${version}` })).toBeVisible();
  });

  test('activate the community', async ({ page }) => {
    await activateCommunity(page, community);
    await gotoAdmin(page, `/locations/communities/${community.id}`);
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  });
});
