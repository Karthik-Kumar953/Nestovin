import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq, randomPhone, selectByText, newAdminPage, requireAdminCreds, PREFIX } from './support/fixtures';
import { createCluster } from './support/flows';

test.describe.configure({ mode: 'serial' });

/*
 * Payroll for a past month: a fresh E2E employee who joined on the 1st of that
 * month with a salary from the same day, so the run has exactly one payable
 * line we own. A random month in 2000–2019 avoids clashing with real payroll
 * (an APPROVED month cannot be prepared again, so the month must be unused).
 */
test.describe('Payroll: prepare, review, approve and record payment', () => {
  requireAdminCreds();
  // Approving a past-month run also approves lines for any shared employee without a
  // join date, and approved months cannot be undone: opt in explicitly.
  test.skip(process.env.E2E_ALLOW_SHARED_WRITES !== '1', 'Payroll approval writes shared data: set E2E_ALLOW_SHARED_WRITES=1 (see docs/testing/E2E.md)');
  const fullName = uniq('Payroll worker');
  let month: string;
  let runPath: string;

  function randomPastMonth(): string {
    const year = 2000 + Math.floor(Math.random() * 20);
    const m = 1 + Math.floor(Math.random() * 12);
    return `${year}-${String(m).padStart(2, '0')}`;
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    month = randomPastMonth();
    const page = await newAdminPage(browser);
    const cluster = await createCluster(page);
    await gotoAdmin(page, '/workforce/employees');
    await page.getByRole('button', { name: 'Add employee' }).click();
    const d = dialog(page, 'Add employee');
    await d.getByLabel('Full name').fill(fullName);
    await d.getByLabel('Phone').fill(randomPhone());
    await selectByText(d.getByLabel('Home cluster'), cluster.name);
    await d.getByLabel('Joined on (optional)').fill(`${month}-01`);
    await d.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/admin\/workforce\/employees\/[0-9a-f-]{36}$/);
    await page.getByLabel('Monthly salary (₹)').fill('12000');
    await page.getByLabel(/^From( \*)?$/).fill(`${month}-01`);
    await page.getByRole('button', { name: 'Set salary' }).click();
    await expect(page.getByText(/₹12,000(\.00)?\/month · from /)).toBeVisible();
    await page.context().close();
  });

  test('payroll runs list and finance overview load', async ({ page }) => {
    await gotoAdmin(page, '/finance/payroll');
    await expectPageTitle(page, 'Payroll');
    await expectListLoaded(page, 'Payroll runs', ['No payroll prepared yet']);
    await gotoAdmin(page, '/finance');
    await expectPageTitle(page, 'Finance overview');
    await expectListLoaded(page, 'Monthly finance summary', ['Nothing here yet']);
  });

  test('prepare payroll for the month', async ({ page }) => {
    await gotoAdmin(page, '/finance/payroll');
    await page.getByLabel('Month').fill(month);
    await page.getByRole('button', { name: 'Prepare payroll' }).click();
    await expect(page).toHaveURL(/\/admin\/finance\/payroll\/[0-9a-f-]{36}$/);
    await expectPageTitle(page, `Payroll ${month}`);
    runPath = new URL(page.url()).pathname;
    const line = page.getByRole('table', { name: 'Payroll lines' }).getByRole('row').filter({ hasText: fullName });
    await expect(line).toBeVisible();
    await expect(line.getByText('Not paid')).toBeVisible();
  });

  test('payroll export downloads a CSV', async ({ page }) => {
    await gotoAdmin(page, runPath);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('add an authorised entry while draft', async ({ page }) => {
    await gotoAdmin(page, runPath);
    const line = page.getByRole('table', { name: 'Payroll lines' }).getByRole('row').filter({ hasText: fullName });
    await line.getByRole('button', { name: 'Add entry' }).click();
    const d = dialog(page, `Authorised entry – ${fullName}`);
    await d.getByLabel('Amount (₹)').fill('500');
    await d.getByLabel('Reason / approval reference').fill(`${PREFIX} allowance`);
    await d.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(d).toBeHidden();
    await expect(line.getByRole('button', { name: 'Remove' })).toBeVisible();
  });

  test('send for review and approve', async ({ page }) => {
    await gotoAdmin(page, runPath);
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/^Approved\. Make the transfers through your bank/)).toBeVisible();
  });

  test('record the salary payment', async ({ page }) => {
    await gotoAdmin(page, runPath);
    const line = page.getByRole('table', { name: 'Payroll lines' }).getByRole('row').filter({ hasText: fullName });
    await line.getByRole('button', { name: 'Record payment' }).click();
    const d = dialog(page, `Record payment – ${fullName}`);
    await d.getByLabel('Bank / UPI reference').fill(`${PREFIX}-${Date.now()}`);
    await d.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(d).toBeHidden();
    await expect(line.getByText('Paid', { exact: true })).toBeVisible();
  });
});
