import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded, dialog, uniq } from './support/fixtures';

test.describe('Audit log', () => {
  test('audit log loads and filters', async ({ page }) => {
    await gotoAdmin(page, '/access/audit');
    await expectPageTitle(page, 'Audit log');
    await expectListLoaded(page, 'Audit log', ['No entries']);
    await page.getByRole('textbox', { name: 'Record type' }).fill('no_such_record_type_e2e');
    await expect(page.getByText('No entries', { exact: true })).toBeVisible();
  });

  test('a role created in the UI is recorded with its details', async ({ page }) => {
    const name = uniq('Audited role');
    await gotoAdmin(page, '/access/roles');
    await page.getByRole('button', { name: 'New role' }).click();
    const d = dialog(page, 'New role');
    await d.getByLabel('Role name').fill(name);
    await d.getByRole('button', { name: 'Create role' }).click();
    await expect(d).toBeHidden();

    await gotoAdmin(page, '/access/audit');
    await page.getByRole('textbox', { name: 'Record type' }).fill('role');
    await page.getByRole('textbox', { name: 'Action' }).fill('role.created');
    const row = page.getByRole('table', { name: 'Audit log' }).getByRole('row').filter({ hasText: 'Role created' }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Details' }).click();
    const details = dialog(page, 'Role created');
    await expect(details.getByRole('heading', { name: 'After' })).toBeVisible();
    await expect(details.getByText(name).first()).toBeVisible();
    await details.getByRole('button', { name: 'Close' }).last().click();

    // Clean up.
    await gotoAdmin(page, '/access/roles');
    const roleRow = page.getByRole('table', { name: 'Roles' }).getByRole('row').filter({ hasText: name });
    await roleRow.getByRole('button', { name: 'Delete' }).click();
    await dialog(page, 'Delete role').getByRole('button', { name: 'Delete role' }).click();
    await expect(page.getByRole('table', { name: 'Roles' }).getByText(name)).toHaveCount(0);
  });
});
