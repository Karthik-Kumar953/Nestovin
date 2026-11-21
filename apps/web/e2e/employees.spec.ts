import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq, randomPhone, selectByText, newAdminPage, requireAdminCreds, isoDate } from './support/fixtures';
import { createCluster, type Cluster } from './support/flows';

test.describe.configure({ mode: 'serial' });

test.describe('Employees and HR', () => {
  requireAdminCreds();
  let cluster: Cluster;
  const fullName = uniq('Worker');
  let employeeUrl: string;

  test.beforeAll(async ({ browser }) => {
    const page = await newAdminPage(browser);
    cluster = await createCluster(page);
    await page.context().close();
  });

  test('employees list loads and filters', async ({ page }) => {
    await gotoAdmin(page, '/workforce/employees');
    await expectPageTitle(page, 'Employees');
    await expectListLoaded(page, 'Employees', ['No employees']);
    await page.getByRole('combobox', { name: 'Readiness' }).selectOption('NOT_READY');
    await expectListLoaded(page, 'Employees', ['No employees']);
  });

  test('add employee form validates the phone number', async ({ page }) => {
    await gotoAdmin(page, '/workforce/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    const d = dialog(page, 'Add employee');
    await expect(d.getByRole('button', { name: 'Create' })).toBeDisabled();
    await d.getByLabel('Full name').fill(uniq('Bad phone'));
    await d.getByLabel('Phone').fill('12345');
    await selectByText(d.getByLabel('Home cluster'), cluster.name);
    await d.getByRole('button', { name: 'Create' }).click();
    await expect(d.getByText('Enter the number with country code, e.g. +919876543210')).toBeVisible();
    await d.getByRole('button', { name: 'Cancel' }).click();
  });

  test('add an employee', async ({ page }) => {
    await gotoAdmin(page, '/workforce/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    const d = dialog(page, 'Add employee');
    await expect(d.getByText(/An Employee ID \(NV-…\) is generated/)).toBeVisible();
    await d.getByLabel('Full name').fill(fullName);
    await d.getByLabel('Phone').fill(randomPhone());
    await selectByText(d.getByLabel('Home cluster'), cluster.name);
    await d.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/admin\/workforce\/employees\/[0-9a-f-]{36}$/);
    await expectPageTitle(page, fullName);
    await expect(page.getByText(new RegExp(`NV-.* · .* · ${cluster.name}`))).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Verification checklist' })).toBeVisible();
    await expect(page.getByText('Login: Not enabled')).toBeVisible();
    employeeUrl = new URL(page.url()).pathname;
  });

  test('employee shows in the list search', async ({ page }) => {
    await gotoAdmin(page, '/workforce/employees');
    await page.getByRole('searchbox', { name: 'Search name, ID or phone' }).fill(fullName);
    await expect(page.getByRole('table', { name: 'Employees' }).getByRole('link', { name: fullName })).toBeVisible();
  });

  test('set availability and salary', async ({ page }) => {
    await gotoAdmin(page, employeeUrl);
    await page.getByRole('button', { name: 'Edit availability' }).click();
    const d = dialog(page, 'Availability');
    await d.getByRole('button', { name: 'Add window' }).click();
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d).toBeHidden();
    await expect(page.getByText('No windows set: availability is not restricted.')).toHaveCount(0);

    await page.getByLabel('Monthly salary (₹)').fill('15000');
    await page.getByLabel('From', { exact: true }).fill(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    await page.getByRole('button', { name: 'Set salary' }).click();
    await expect(page.getByText(/₹15,000(\.00)?\/month · from /)).toBeVisible();
  });

  test('mark ready and enable login', async () => {
    test.skip(
      true,
      'Needs every required HR checklist item recorded as Verified and qualified services; adding required checklist items changes readiness for ALL employees in the shared environment.',
    );
  });

  test('HR settings: add and deactivate a training link', async ({ page }) => {
    const title = uniq('Training');
    await gotoAdmin(page, '/workforce/settings');
    await expectPageTitle(page, 'HR settings');
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Video link (https)').fill('https://example.com/e2e-training');
    await page.getByRole('button', { name: 'Add link' }).click();
    const row = page.getByRole('table', { name: 'Training links' }).getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row.getByRole('button', { name: 'Activate' })).toBeVisible();
  });

  test('applicants and leave lists load', async ({ page }) => {
    await gotoAdmin(page, '/workforce/applicants');
    await expectPageTitle(page, 'Applicants');
    await expectListLoaded(page, 'Applicants', ['No applicants']);
    await gotoAdmin(page, '/workforce/leave');
    await expectPageTitle(page, 'Leave requests');
    await expectListLoaded(page, 'Leave requests', ['No leave requests']);
  });

  test('convert an applicant / decide leave', async () => {
    test.skip(true, 'Applicants and leave requests come from the Worker app; no Admin UI creates them.');
  });
});
