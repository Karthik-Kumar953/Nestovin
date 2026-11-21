import type { Page } from '@playwright/test';
import { dialog, expect, gotoAdmin, selectByText, uniq, uniqCode } from './fixtures';

/*
 * Reusable UI flows. Every record is created through the Admin UI with an
 * `E2E-<RUN>` name so test data is easy to find and clean up.
 */

export interface City {
  name: string;
  state: string;
}
export interface Cluster {
  name: string;
  code: string;
}
export interface Community {
  id: string;
  name: string;
  code: string;
}

export async function createCity(page: Page): Promise<City> {
  const city = { name: uniq('City'), state: 'E2E State' };
  await gotoAdmin(page, '/locations/cities');
  await page.getByRole('button', { name: 'Add city' }).click();
  const d = dialog(page, 'Add city');
  await d.getByLabel('City').fill(city.name);
  await d.getByLabel('State').fill(city.state);
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search cities' }).fill(city.name);
  await expect(page.getByRole('table', { name: 'Cities' }).getByRole('cell', { name: city.name })).toBeVisible();
  return city;
}

export async function createCluster(page: Page): Promise<Cluster> {
  const cluster = { name: uniq('Cluster'), code: uniqCode('CL') };
  await gotoAdmin(page, '/locations/clusters');
  await page.getByRole('button', { name: 'Add cluster' }).click();
  const d = dialog(page, 'Add cluster');
  await d.getByLabel(/^Name( \*)?$/).fill(cluster.name);
  await d.getByLabel(/^Code( \*)?$/).fill(cluster.code);
  await d.getByLabel('Description').fill('Created by the Playwright E2E suite');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search name or code' }).fill(cluster.code);
  await expect(page.getByRole('table', { name: 'Clusters' }).getByText(cluster.name)).toBeVisible();
  return cluster;
}

/** Creates a community in `city`; lands on its detail page. */
export async function createCommunity(page: Page, city: City): Promise<Community> {
  const name = uniq('Community');
  const code = uniqCode('CM');
  await gotoAdmin(page, '/locations/communities');
  await page.getByRole('button', { name: 'Add community' }).click();
  const d = dialog(page, 'Add community');
  await selectByText(d.getByLabel('City'), `${city.name}, ${city.state}`);
  await d.getByLabel('Community name').fill(name);
  await d.getByLabel(/^Code( \*)?$/).fill(code);
  await d.getByLabel('Address').fill('1 E2E Road, Test Nagar');
  await d.getByLabel('PIN code').fill('560001');
  await d.getByRole('button', { name: 'Create community' }).click();
  await expect(page).toHaveURL(/\/admin\/locations\/communities\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').pop()!;
  return { id, name, code };
}

/** On the community detail page: assign it to a cluster. */
export async function assignCommunityToCluster(page: Page, community: Community, cluster: Cluster): Promise<void> {
  await gotoAdmin(page, `/locations/communities/${community.id}`);
  await page.getByRole('button', { name: 'Assign to cluster' }).click();
  const d = dialog(page, 'Assign to cluster');
  await selectByText(d.getByLabel('Cluster'), cluster.name);
  await d.getByLabel('Reason (recorded in history and audit log)').fill('E2E cluster assignment');
  await d.getByRole('button', { name: 'Confirm' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('table', { name: 'Cluster membership history' }).getByText(cluster.name)).toBeVisible();
}

// ------------------------------------------------------------- setup wizard

export type Step = 'services' | 'categories' | 'import' | 'tasks' | 'plans' | 'prices' | 'publish' | 'activate';

export async function gotoStep(page: Page, community: Community, step: Step): Promise<void> {
  await gotoAdmin(page, `/locations/communities/${community.id}/setup?step=${step}`);
  await expect(page.getByRole('heading', { level: 1, name: `Community setup: ${community.name}` })).toBeVisible();
}

/** Step 1: default mode Demand-led, offer the first service. Returns that service's name. */
export async function enableServices(page: Page, community: Community): Promise<string> {
  await gotoStep(page, community, 'services');
  // Wait for the services to load first: loading resets the form from the server copy.
  const offer = page.getByRole('checkbox', { name: /^Offer / }).first();
  await expect(offer).toBeVisible();
  const defaultMode = page.getByLabel('Community default operating mode');
  await selectByText(defaultMode, 'Demand-led');
  await expect(defaultMode.locator('option:checked')).toHaveText(/^Demand-led/);
  const serviceName = ((await offer.getAttribute('aria-label')) ?? '').replace(/^Offer /, '');
  await offer.check();
  await page.getByRole('button', { name: 'Save services' }).click();
  await expect(page.getByText('Services saved.')).toBeVisible();
  return serviceName;
}

export async function addTimeWindow(page: Page, community: Community): Promise<string> {
  await gotoStep(page, community, 'services');
  const name = `${uniq('Morning')}`.slice(0, 60);
  await page.getByRole('button', { name: 'Add time window' }).click();
  const d = dialog(page, 'Add time window');
  await d.getByLabel(/^Name( \*)?$/).fill(name);
  await d.getByLabel(/^From( \*)?$/).fill('07:00');
  await d.getByLabel(/^To( \*)?$/).fill('11:00');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('table', { name: 'Time windows' }).getByText(name)).toBeVisible();
  return name;
}

export interface Category {
  code: string;
  label: string;
}

export async function addCategory(page: Page, community: Community): Promise<Category> {
  await gotoStep(page, community, 'categories');
  const cat = { code: uniqCode('2BHK'), label: uniq('2 BHK') };
  await page.getByRole('button', { name: 'Add category' }).click();
  const d = dialog(page, 'Add category');
  await d.getByLabel(/^Code( \*)?$/).fill(cat.code);
  await d.getByLabel('Label').fill(cat.label);
  await d.getByLabel('Display order').fill('1');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('table', { name: 'Residence categories' }).getByText(cat.label)).toBeVisible();
  return cat;
}

/** Step 3: enter flats in the dashboard grid, check, submit, approve and commit the batch. */
export async function importFlatsViaGrid(page: Page, community: Community, category: Category, flats = ['101', '102']): Promise<void> {
  await gotoStep(page, community, 'import');
  await expect(page.getByRole('heading', { level: 2, name: 'Towers and flats' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Enter in table' })).toHaveAttribute('aria-selected', 'true');
  const grid = page.getByRole('table', { name: 'Flats to import' });
  for (const [i, flat] of flats.entries()) {
    const n = i + 1;
    await grid.getByLabel(`Row ${n} Tower`, { exact: true }).fill('E2E Tower A');
    await grid.getByLabel(`Row ${n} Floor`, { exact: true }).fill('1');
    await grid.getByLabel(`Row ${n} Flat number`, { exact: true }).fill(flat);
    await grid.getByLabel(`Row ${n} BHK type`, { exact: true }).fill('2 BHK');
    await grid.getByLabel(`Row ${n} Area (sq ft)`, { exact: true }).fill('1100');
    await selectByText(grid.getByLabel(`Row ${n} Residence category`, { exact: true }), category.label);
    await grid.getByLabel(`Row ${n} Occupancy`, { exact: true }).selectOption('Owner');
  }
  await page.getByRole('button', { name: 'Check rows' }).click();
  await expect(page.getByText(new RegExp(`^All ${flats.length} rows are valid`))).toBeVisible();
  await page.getByRole('button', { name: `Submit for approval (${flats.length})` }).click();

  await expect(page.getByText('Entered in dashboard').first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve import' }).click();
  await page.getByRole('button', { name: 'Commit to community' }).click();
  await expect(page.getByText(/^Imported: \d+ new tower\(s\), \d+ new flat\(s\)/)).toBeVisible();
}

export async function addTask(page: Page, community: Community, serviceName: string): Promise<string> {
  await gotoStep(page, community, 'tasks');
  const name = uniq('Sweeping and mopping');
  await page.getByRole('button', { name: 'Add task' }).click();
  const d = dialog(page, 'Add task');
  await selectByText(d.getByLabel(/^Service( \*)?$/), serviceName);
  await d.getByLabel(/^Task( \*)?$/).fill(name);
  await d.getByLabel('Typical minutes (optional)').fill('30');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByRole('table', { name: 'Tasks' }).getByText(name)).toBeVisible();
  return name;
}

export interface Plan {
  name: string;
  code: string;
}

/** Step 5: start a draft (if needed), add a plan with one service component. */
export async function addPlanWithService(page: Page, community: Community, serviceName: string, taskName?: string): Promise<Plan> {
  await gotoStep(page, community, 'plans');
  const start = page.getByRole('button', { name: /^(Start draft|New draft from version \d+)$/ });
  const addPlan = page.getByRole('button', { name: 'Add plan' });
  await expect(start.or(addPlan).first()).toBeVisible();
  if (await start.isVisible()) await start.click();
  await expect(page.getByText(/Editing draft version \d+/)).toBeVisible();

  const plan = { name: uniq('Gold'), code: uniqCode('GOLD') };
  await addPlan.click();
  const d = dialog(page, 'Add plan');
  await d.getByLabel('Plan name').fill(plan.name);
  await d.getByLabel(/^Code( \*)?$/).fill(plan.code);
  await d.getByLabel('Validity (days)').fill('30');
  await d.getByLabel('Description (shown to residents)').fill('E2E plan');
  await d.getByRole('button', { name: 'Save' }).click();
  await expect(d).toBeHidden();

  const card = page.locator('.card').filter({ has: page.getByRole('heading', { level: 3, name: `${plan.name} (${plan.code})` }) });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Add service' }).click();
  const c = dialog(page, `Add service to ${plan.name}`);
  await selectByText(c.getByLabel(/^Service( \*)?$/), serviceName);
  await c.getByLabel('Visits per day').fill('1');
  await c.getByLabel('Minutes per visit').fill('60');
  if (taskName) await c.getByRole('checkbox', { name: taskName }).check();
  await c.getByRole('button', { name: 'Save' }).click();
  await expect(c).toBeHidden();
  await expect(card.getByText(/1× per day · 60 min/)).toBeVisible();
  return plan;
}

/** Step 6: set the package price for the category. */
export async function setPackagePrice(page: Page, community: Community, plan: Plan, category: Category, rupees = '4500'): Promise<void> {
  await gotoStep(page, community, 'prices');
  await page.getByLabel(`${plan.name}, ${category.label}, package`).fill(rupees);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save prices' }).click();
  await expect(page.getByText('Prices saved.')).toBeVisible();
}

/** Step 7: publish the draft catalogue. Returns the published version number. */
export async function publishCatalogue(page: Page, community: Community): Promise<number> {
  await gotoStep(page, community, 'publish');
  const ready = page.getByText(/^Draft version (\d+) is ready to publish\.$/);
  const blocked = page.getByText(/^Fix before publishing \(\d+\)/);
  await expect(ready.or(blocked).first()).toBeVisible();
  if (await blocked.isVisible()) {
    throw new Error(`Catalogue is not publishable: ${await blocked.locator('..').innerText()}`);
  }
  const version = Number(/version (\d+)/.exec(await ready.innerText())?.[1]);
  await page.getByRole('button', { name: `Publish version ${version}` }).click();
  await expect(page.getByText('Published. Residents in this community will see this catalogue once the community is active.')).toBeVisible();
  return version;
}

/** Step 8: activate. */
export async function activateCommunity(page: Page, community: Community): Promise<void> {
  await gotoStep(page, community, 'activate');
  const btn = page.getByRole('button', { name: 'Activate community' });
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.getByText('This community is active.')).toBeVisible();
}

export interface ProvisionedCommunity {
  city: City;
  cluster: Cluster;
  community: Community;
  serviceName: string;
  category: Category;
  plan: Plan;
}

/** A fully set-up ACTIVE community with a published catalogue (one plan, one price). */
export async function provisionActiveCommunity(page: Page): Promise<ProvisionedCommunity> {
  const city = await createCity(page);
  const cluster = await createCluster(page);
  const community = await createCommunity(page, city);
  await assignCommunityToCluster(page, community, cluster);
  const serviceName = await enableServices(page, community);
  const category = await addCategory(page, community);
  await importFlatsViaGrid(page, community, category);
  // Publishing needs at least one task per offered service.
  const taskName = await addTask(page, community, serviceName);
  const plan = await addPlanWithService(page, community, serviceName, taskName);
  await setPackagePrice(page, community, plan, category);
  await publishCatalogue(page, community);
  await activateCommunity(page, community);
  return { city, cluster, community, serviceName, category, plan };
}
