import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq } from './support/fixtures';

test.describe('Access control', () => {
  test('home shows the Super Admin welcome and navigation', async ({ page }) => {
    await gotoAdmin(page, '/');
    await expectPageTitle(page, /^Welcome, /);
    await expect(page.getByText('You are the Super Admin: full access to every module and all clusters.')).toBeVisible();
    const nav = page.getByRole('complementary', { name: 'Main navigation' });
    for (const link of ['Communities', 'Roles', 'Admin users', 'Audit log', 'Payroll', 'Tickets']) {
      await expect(nav.getByRole('link', { name: link, exact: true })).toBeVisible();
    }
  });

  test('unknown admin route shows "Page not found"', async ({ page }) => {
    await gotoAdmin(page, '/this-route-does-not-exist-e2e');
    await expect(page.getByText('Page not found')).toBeVisible();
    await page.getByRole('link', { name: 'Go to Home' }).click();
    await expectPageTitle(page, /^Welcome, /);
  });

  test('admin users list loads with search and status filter', async ({ page }) => {
    await gotoAdmin(page, '/access/admins');
    await expectPageTitle(page, 'Admin users');
    await expectListLoaded(page, 'Admin users', ['No admins match']);
    // The signed-in Super Admin is always listed.
    await expect(page.getByRole('table', { name: 'Admin users' }).getByText('Super Admin').first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('ACTIVE');
    await expectListLoaded(page, 'Admin users', ['No admins match']);
    await page.getByRole('searchbox', { name: 'Search name or email' }).fill(uniq('nobody'));
    await expect(page.getByText('No admins match')).toBeVisible();
  });

  test('invite admin form validates before sending', async ({ page }) => {
    await gotoAdmin(page, '/access/admins');
    await page.getByRole('button', { name: 'Invite admin' }).click();
    const d = dialog(page, 'Invite admin');
    const send = d.getByRole('button', { name: 'Send invitation' });
    await expect(send).toBeDisabled();
    await d.getByLabel('Full name').fill(uniq('Invitee'));
    await d.getByLabel('Work email').fill('e2e-invitee@example.test');
    // Default scope is "Specific clusters" with none ticked: still blocked.
    await expect(send).toBeDisabled();
    await d.getByRole('radio', { name: /^All clusters/ }).check();
    await expect(send).toBeEnabled();
    // Not sent: sending creates a real Supabase user and emails an invitation.
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(d).toBeHidden();
  });

  test('invite an admin end to end', async () => {
    test.skip(
      true,
      'Sending an invitation creates a real auth user and emails a real invitation; needs a disposable mailbox to accept it.',
    );
  });

  test('create, edit and delete a role', async ({ page }) => {
    const name = uniq('Role');
    await gotoAdmin(page, '/access/roles');
    await expectPageTitle(page, 'Roles');
    await expectListLoaded(page, 'Roles', ['No roles yet']);

    await page.getByRole('button', { name: 'New role' }).click();
    const d = dialog(page, 'New role');
    await d.getByLabel('Role name').fill(name);
    await d.getByLabel('Description').fill('Created by the Playwright E2E suite');
    await d.getByRole('table', { name: 'Role permissions' }).getByRole('checkbox').first().check();
    await d.getByRole('button', { name: 'Create role' }).click();
    await expect(d).toBeHidden();

    const row = page.getByRole('table', { name: 'Roles' }).getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Edit' }).click();
    const e = dialog(page, `Edit role: ${name}`);
    await e.getByLabel('Description').fill('Edited by the Playwright E2E suite');
    await e.getByRole('button', { name: 'Save changes' }).click();
    await expect(e).toBeHidden();

    await row.getByRole('button', { name: 'Delete' }).click();
    const del = dialog(page, 'Delete role');
    await expect(del.getByText(name)).toBeVisible();
    await del.getByRole('button', { name: 'Delete role' }).click();
    await expect(del).toBeHidden();
    await expect(page.getByRole('table', { name: 'Roles' }).getByText(name)).toHaveCount(0);
  });

  test('notification delivery log loads', async ({ page }) => {
    await gotoAdmin(page, '/access/notifications');
    await expectPageTitle(page, 'Notification delivery');
    await expectListLoaded(page, 'Notification delivery', ['Nothing queued']);
    await page.getByRole('combobox', { name: 'Status' }).selectOption('DEAD');
    await expectListLoaded(page, 'Notification delivery', ['Nothing queued']);
  });
});
