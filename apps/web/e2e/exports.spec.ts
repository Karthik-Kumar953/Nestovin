import { test, expect, gotoAdmin } from './support/fixtures';

/** Every "Export CSV" button produces a browser download of a .csv file. */
const EXPORTS: { area: string; path: string; before?: string }[] = [
  { area: 'communities', path: '/locations/communities' },
  { area: 'residents', path: '/residents' },
  { area: 'bookings', path: '/demand/bookings' },
  { area: 'payments', path: '/demand/payments', before: 'All payments' },
  { area: 'employees', path: '/workforce/employees' },
  { area: 'attendance', path: '/attendance' },
  { area: 'tickets', path: '/support/tickets' },
];

test.describe('CSV exports', () => {
  for (const { area, path, before } of EXPORTS) {
    test(`${area} export downloads a CSV`, async ({ page }) => {
      await gotoAdmin(page, path);
      if (before) await page.getByRole('button', { name: before }).click();
      const button = page.getByRole('button', { name: 'Export CSV' });
      await expect(button).toBeEnabled();
      const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
      const path_ = await download.path();
      expect(path_).toBeTruthy();
      await expect(page.locator('.banner-error')).toHaveCount(0);
    });
  }
});
