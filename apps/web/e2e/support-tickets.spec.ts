import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq } from './support/fixtures';

test.describe('Support tickets', () => {
  test('ticket list loads for each view', async ({ page }) => {
    await gotoAdmin(page, '/support/tickets');
    await expectPageTitle(page, 'Support tickets');
    await expectListLoaded(page, 'Support tickets', ['No tickets']);
    for (const label of ['Assigned to me', 'Escalated', 'Resolved', 'Closed', 'All tickets']) {
      await page.getByRole('combobox', { name: 'View' }).selectOption({ label });
      await expectListLoaded(page, 'Support tickets', ['No tickets']);
    }
  });

  test('add and deactivate a ticket category', async ({ page }) => {
    const name = uniq('Category');
    await gotoAdmin(page, '/support/tickets');
    await page.getByRole('button', { name: 'Categories' }).click();
    const d = dialog(page, 'Ticket categories');
    await d.getByLabel('New category').fill(name);
    await d.getByRole('button', { name: 'Add', exact: true }).click();
    const row = d.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row.getByRole('button', { name: 'Activate' })).toBeVisible();
    await d.getByRole('button', { name: 'Close' }).click();
  });

  test('reply, internal note and escalation on an E2E ticket', async ({ page }) => {
    // Tickets are raised in the Resident app; only touch tickets created for E2E.
    await gotoAdmin(page, '/support/tickets');
    await page.getByRole('combobox', { name: 'View' }).selectOption({ label: 'Open tickets' });
    const link = page.getByRole('table', { name: 'Support tickets' }).getByRole('link', { name: /E2E/ }).first();
    // Wait for the list to settle (rows or the empty state); other tickets may exist without "E2E".
    await expectListLoaded(page, 'Support tickets', ['No tickets']);
    test.skip(
      (await link.count()) === 0,
      'No open ticket with "E2E" in its subject. Tickets can only be raised from the Resident app; create one there to run this test.',
    );
    await link.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Conversation' })).toBeVisible();

    await page.getByLabel('Type').selectOption({ label: 'Internal note (admins only)' });
    await page.getByLabel(/^Note( \*)?$/).fill(`${uniq('note')}`);
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText(/ · internal note/).first()).toBeVisible();

    const escalate = page.getByRole('button', { name: 'Escalate', exact: true });
    test.skip((await escalate.count()) === 0, 'Ticket is already with the Super Admin.');
    await escalate.click();
    await page.getByLabel('Escalation reason').fill('E2E escalation check');
    const confirm = page.getByRole('button', { name: /^Escalate to (Cluster|Super) Admin$/ });
    const target = (await confirm.innerText()).includes('Cluster') ? 'With Cluster Admin' : 'With Super Admin';
    await confirm.click();
    await expect(page.getByText(target).first()).toBeVisible();
    await expect(page.getByText(/manual · \d+ notified/).first()).toBeVisible();
  });

  test('website enquiries load for each status', async ({ page }) => {
    await gotoAdmin(page, '/support/enquiries');
    await expectPageTitle(page, 'Website enquiries');
    await expectListLoaded(page, 'Website enquiries', ['No enquiries']);
    for (const label of ['In progress', 'Closed']) {
      await page.getByRole('combobox', { name: 'Status' }).selectOption({ label });
      await expectListLoaded(page, 'Website enquiries', ['No enquiries']);
    }
  });

  test('holiday calendar: add and remove a holiday', async ({ page }) => {
    await gotoAdmin(page, '/support/holidays');
    await expectPageTitle(page, 'Holiday calendar');
    // A far-future date so it never shifts real ticket deadlines.
    const year = 2090 + Math.floor(Math.random() * 9);
    const date = `${year}-0${1 + Math.floor(Math.random() * 9)}-1${Math.floor(Math.random() * 9)}`;
    const name = uniq('Holiday');
    await page.getByLabel(/^Date( \*)?$/).fill(date);
    await page.getByLabel(/^Name( \*)?$/).fill(name);
    await page.getByRole('button', { name: 'Add holiday' }).click();
    const row = page.getByRole('table', { name: 'Holidays' }).getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
  });
});
