import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded } from './support/fixtures';

const PAYMENT_DATA = 'Needs real Razorpay payments made from the Resident app; the Admin UI cannot create them.';

test.describe('Payments and bookings', () => {
  test('payments: Needs review tab loads, open and resolved', async ({ page }) => {
    await gotoAdmin(page, '/demand/payments');
    await expectPageTitle(page, 'Payments');
    await expectListLoaded(page, 'Payment exceptions', ['Nothing needs review']);
    await page.getByRole('combobox', { name: 'Exception status' }).selectOption({ label: 'Resolved' });
    await expectListLoaded(page, 'Payment exceptions', ['No resolved exceptions']);
  });

  test('payments: All payments tab loads and filters by status', async ({ page }) => {
    await gotoAdmin(page, '/demand/payments');
    await page.getByRole('button', { name: 'All payments' }).click();
    await expectListLoaded(page, 'Payments', ['No payments']);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    for (const label of ['Paid', 'Started, not paid', 'Needs review', 'Expired']) {
      await page.getByRole('combobox', { name: 'Payment status' }).selectOption({ label });
      await expectListLoaded(page, 'Payments', ['No payments']);
    }
  });

  test('payments: approve a refund', async () => {
    test.skip(true, PAYMENT_DATA);
  });

  test('payments: resolve a payment exception', async () => {
    test.skip(true, PAYMENT_DATA);
  });

  test('bookings list loads and filters', async ({ page }) => {
    await gotoAdmin(page, '/demand/bookings');
    await expectPageTitle(page, 'Bookings');
    await expectListLoaded(page, 'Bookings', ['No bookings']);
    await page.getByRole('combobox', { name: 'Booking status' }).selectOption({ label: 'Confirmed' });
    await expectListLoaded(page, 'Bookings', ['No bookings']);
  });

  test('bookings: send a payment reminder', async () => {
    test.skip(true, 'Needs a PENDING_PAYMENT booking made by a resident in the Resident app.');
  });

  test('continuous slots page loads', async ({ page }) => {
    await gotoAdmin(page, '/scheduling/slots');
    await expectPageTitle(page, 'Slots');
    await expect(page.getByRole('combobox', { name: 'Community' }).or(page.getByText('No slots yet')).first()).toBeVisible();
  });
});
