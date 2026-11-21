import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog } from './support/fixtures';
import { assignCommunityToCluster, createCity, createCluster, createCommunity, type City, type Cluster, type Community } from './support/flows';

test.describe.configure({ mode: 'serial' });

test.describe('Locations: city, cluster, community, towers and flats', () => {
  let city: City;
  let cluster: Cluster;
  let community: Community;

  test('lists load', async ({ page }) => {
    for (const [path, title, caption, empty] of [
      ['/locations/cities', 'Cities', 'Cities', 'No cities yet'],
      ['/locations/clusters', 'Clusters', 'Clusters', 'No clusters yet'],
      ['/locations/communities', 'Communities', 'Communities', 'No communities found'],
      ['/locations/expansion-votes', 'Expansion votes', 'Expansion votes', 'No votes yet'],
    ] as const) {
      await gotoAdmin(page, path);
      await expectPageTitle(page, title);
      await expectListLoaded(page, caption, [empty]);
    }
  });

  test('create a city', async ({ page }) => {
    city = await createCity(page);
  });

  test('create a cluster', async ({ page }) => {
    cluster = await createCluster(page);
  });

  test('cluster code validation rejects invalid characters', async ({ page }) => {
    await gotoAdmin(page, '/locations/clusters');
    await page.getByRole('button', { name: 'Add cluster' }).click();
    const d = dialog(page, 'Add cluster');
    await d.getByLabel('Name', { exact: true }).fill('E2E invalid code');
    await d.getByLabel('Code', { exact: true }).fill('E2E.BAD/CODE');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d.getByText('Use letters, numbers, spaces, hyphen or underscore')).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();
  });

  test('create a community and assign it to the cluster', async ({ page }) => {
    community = await createCommunity(page, city);
    await expect(page.getByText(`${community.code} · ${city.name}`)).toBeVisible();
    await expect(page.getByText('Unassigned').first()).toBeVisible();
    await assignCommunityToCluster(page, community, cluster);
    await expect(page.getByRole('button', { name: 'Move to another cluster' })).toBeVisible();
  });

  test('community appears in the list, filtered by city and cluster', async ({ page }) => {
    await gotoAdmin(page, '/locations/communities');
    await page.getByRole('searchbox', { name: 'Search name or code' }).fill(community.code);
    const table = page.getByRole('table', { name: 'Communities' });
    await expect(table.getByRole('link', { name: community.name })).toBeVisible();
    await expect(table.getByText(cluster.name)).toBeVisible();
    await expect(table.getByText('Draft')).toBeVisible();
  });

  test('add a tower and a flat on the community', async ({ page }) => {
    await gotoAdmin(page, `/locations/communities/${community.id}`);
    await page.getByRole('button', { name: 'Add tower' }).click();
    const t = dialog(page, 'Add tower');
    await t.getByLabel('Tower / building name').fill('E2E Tower Z');
    await t.getByLabel('Number of floors').fill('12');
    await t.getByRole('button', { name: 'Save' }).click();
    await expect(t).toBeHidden();
    const towerRow = page.getByRole('table', { name: 'Towers' }).getByRole('row').filter({ hasText: 'E2E Tower Z' });
    await expect(towerRow).toBeVisible();

    await towerRow.getByRole('button', { name: 'Flats' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Flats in E2E Tower Z' })).toBeVisible();
    await page.getByRole('button', { name: 'Add flat' }).click();
    const f = dialog(page, 'Add flat to E2E Tower Z');
    await f.getByLabel('Flat number').fill('Z-1201');
    await f.getByLabel('Floor', { exact: true }).fill('12');
    await f.getByLabel('Type (e.g. 2 BHK)').fill('3 BHK');
    await f.getByLabel('Area (sq ft)').fill('1450');
    await f.getByLabel('Occupancy').selectOption('TENANT');
    await f.getByRole('button', { name: 'Save' }).click();
    await expect(f).toBeHidden();
    await expect(page.getByRole('table', { name: 'Flats in E2E Tower Z' }).getByText('Z-1201')).toBeVisible();
  });

  test('edit community details and see change history', async ({ page }) => {
    await gotoAdmin(page, `/locations/communities/${community.id}`);
    await page.getByRole('button', { name: 'Edit details' }).click();
    const d = dialog(page, 'Edit community');
    await d.getByLabel('Address').fill('2 E2E Road, Test Nagar');
    await d.getByLabel('Latitude').fill('12.97160');
    await d.getByLabel('Longitude').fill('77.59460');
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText('2 E2E Road, Test Nagar')).toBeVisible();
    await expect(page.getByRole('link', { name: 'View on map' })).toBeVisible();

    await page.getByRole('button', { name: 'Show change history' }).click();
    const history = page.getByRole('table', { name: 'Change history' });
    await expect(history.getByText('Community created')).toBeVisible();
    await expect(history.getByText('Community updated').first()).toBeVisible();
  });
});
