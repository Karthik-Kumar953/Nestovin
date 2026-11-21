import type { Page } from '@playwright/test';
import { RUPEES, back, expect, heading, open, openTab, test } from './demo-fixtures';

/*
 * RES-09: bookings list (current / past) and detail for a continuous booking, a demand-led booking
 * with a balance due, and a booking-round request (never shown as a confirmed service).
 */

const continuous = (page: Page) => page.getByRole('button', { name: '[Plan B] Cook, Cook, Confirmed' });
const balanceDue = (page: Page) => page.getByRole('button', { name: '[Plan A] Maid, Maid, Balance due' });
const request = (page: Page) => page.getByRole('button', { name: /^\[Plan A\] Maid, .+, Joined · awaiting slot$/ });

test.describe('Bookings', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'bookings');
    await expect(heading(page, 'Bookings')).toBeVisible();
  });

  test('lists current bookings and booking-round requests separately', async ({ page }) => {
    await expect(page.getByRole('tablist', { name: 'Show' }).getByRole('tab')).toHaveText(['Current', 'Past']);
    await expect(heading(page, 'Booking round requests')).toBeVisible();
    await expect(request(page)).toBeVisible();
    await expect(continuous(page)).toBeVisible();
    await expect(balanceDue(page)).toBeVisible();
    await expect(page.getByRole('progressbar', { name: /^Paid ₹[\d,]+ of ₹[\d,]+$/ })).toHaveCount(2);
    await expect(balanceDue(page).getByText(/^Due /)).toBeVisible();
    await expect(request(page).getByText(/^Preferred: /)).toBeVisible();
  });

  test('the Past tab shows its empty state', async ({ page }) => {
    await page.getByRole('tab', { name: 'Past', exact: true }).click();
    await expect(heading(page, 'Nothing here yet')).toBeVisible();
    await expect(page.getByText('Ended, expired and cancelled bookings appear here.')).toBeVisible();
    await expect(continuous(page)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Current', exact: true }).click();
    await expect(continuous(page)).toBeVisible();
  });

  test('continuous booking detail: paid in full, payments, agreed terms, renewal', async ({ page }) => {
    await continuous(page).click();
    await expect(heading(page, '[Plan B] Cook')).toBeVisible();
    await expect(page.getByText(/^NV-BK-\d+ · Continuous$/)).toBeVisible();
    await expect(page.getByLabel('Status: Confirmed').filter({ visible: true })).toBeVisible();
    await expect(page.getByLabel('Status: Active').filter({ visible: true })).toBeVisible();
    await expect(page.getByLabel(/^Paid in full, ₹[\d,]+, done$/)).toBeVisible();
    await expect(page.getByLabel(/^Booking confirmed, Breakfast at 7:30 am · Every day, done$/)).toBeVisible();

    await expect(heading(page, 'Amounts')).toBeVisible();
    await expect(page.getByText('Of which taxes')).toBeVisible();
    await expect(heading(page, 'Payments')).toBeVisible();
    await expect(page.getByLabel(/^Full payment, ₹[\d,]+, Paid$/)).toBeVisible();

    await page.getByRole('button', { name: /^What you agreed to/ }).click();
    await expect(page.getByText('Meal preparation')).toBeVisible();
    await expect(page.getByText('Plan length')).toBeVisible();
    await expect(page.getByText('Later catalogue changes do not affect this booking.')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Renew for the next period' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get help with this booking' })).toBeVisible();
  });

  test('demand-led booking detail: balance due, non-refundable warning, pay balance', async ({ page }) => {
    await balanceDue(page).click();
    await expect(heading(page, '[Plan A] Maid')).toBeVisible();
    await expect(page.getByText(/^NV-BK-\d+ · Booking round$/)).toBeVisible();
    await expect(page.getByLabel('Status: Balance due').filter({ visible: true })).toBeVisible();
    await expect(page.getByLabel(/^Pay the balance, Due by .+, current step$/)).toBeVisible();
    await expect(page.getByText('If the balance is not paid by the deadline, the booking expires and the amount paid to join is not refunded.')).toBeVisible();
    await expect(page.getByLabel(/^Joining payment, ₹[\d,]+, Paid$/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay balance ₹[\d,]+$/ })).toBeEnabled();

    await page.getByRole('button', { name: /^What you agreed to/ }).click();
    await expect(page.getByText(/^\d+%, non-refundable$/)).toBeVisible();
    await expect(page.getByText(/^Payment terms accepted /)).toBeVisible();
  });

  test('booking-round request detail is not shown as a confirmed service', async ({ page }) => {
    await request(page).click();
    await expect(heading(page, '[Plan A] Maid')).toBeVisible();
    await expect(page.getByText(/^NV-DR-\d+ · Booking round$/)).toBeVisible();
    await expect(page.getByLabel('Status: Joined · awaiting slot').filter({ visible: true })).toBeVisible();
    await expect(page.getByText('Not a confirmed service yet')).toBeVisible();
    await expect(page.getByText('When the round closes we publish your slot and the balance due date. We will notify you.')).toBeVisible();
    await expect(page.getByLabel(/^Joined booking round, Paid ₹[\d,]+, done$/)).toBeVisible();
    await expect(page.getByLabel(/^Round closes and your slot is confirmed, Preferred: .+, current step$/)).toBeVisible();
    await expect(page.getByText(/^To join \(\d+%\)$/)).toBeVisible();
    await expect(page.getByText('Balance after slot confirmation')).toBeVisible();
    await expect(page.getByText(RUPEES).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay ₹/ })).toHaveCount(0); // already paid to join

    await page.getByRole('button', { name: /^What you agreed to/ }).click();
    await expect(page.getByText(/^The \d+% paid to join is non-refundable if the balance is not paid by the deadline\.$/)).toBeVisible();
  });

  test('"Get help" opens a support request prefilled with the booking reference', async ({ page }) => {
    await continuous(page).click();
    await page.getByRole('button', { name: 'Get help with this booking' }).click();
    await expect(heading(page, 'New request')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveValue(/^Booking NV-BK-\d+$/);
    await back(page).click();
    await expect(heading(page, '[Plan B] Cook')).toBeVisible();
  });
});

test('Profile → "Bookings and payments" opens the bookings list', async ({ page }) => {
  await open(page);
  await openTab(page, 'Profile');
  await page.getByRole('button', { name: 'Bookings and payments' }).click();
  await expect(heading(page, 'Bookings')).toBeVisible();
  await expect(continuous(page)).toBeVisible();
});
