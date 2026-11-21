import { expect, test } from '@playwright/test';
import { openTab, requireResidentCreds, signIn } from './fixtures';

/*
 * RES-06/07/08/09: catalogue, demand-led and continuous booking forms, bookings list.
 * Stops before "Commit and pay" / "Pay ₹…": Razorpay Checkout is a native module
 * (react-native-razorpay) and is covered by the Maestro flow
 * apps/resident/.maestro/razorpay_test_payment_*.yaml.
 */

test.describe('Catalogue and booking', () => {
  requireResidentCreds();
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openTab(page, 'Book');
    await expect(page.getByRole('heading', { name: 'Book a service' })).toBeVisible();
  });

  test('shows the catalogue or the reason booking is unavailable', async ({ page }) => {
    const goHome = page.getByRole('button', { name: 'Go to home' });
    const plans = page.getByRole('heading', { name: 'Choose a plan' });
    const empty = page.getByText('No plans for your flat yet');
    await expect(goHome.or(plans).or(empty)).toBeVisible();
  });

  test('choosing a plan and service shows the matching booking form', async ({ page }) => {
    const plans = page.getByRole('heading', { name: 'Choose a plan' });
    test.skip(!(await plans.isVisible().catch(() => false)), 'Test resident is not eligible to book or has no published plans');

    await page.getByRole('radio').first().click();
    await expect(page.getByRole('heading', { name: 'What do you need?' })).toBeVisible();
    // Radios after the plan card's own radios are the "What do you need?" options
    // (Complete package or a single service). The heading's parent is the plan Card.
    const planCount = await plans.locator('..').getByRole('radio').count();
    await page.getByRole('radio').nth(planCount).click();

    const demand = page.getByRole('button', { name: 'Commit and pay' });
    const continuous = page.getByRole('button', { name: /^Pay ₹/ });
    const noCycle = page.getByText('There is no open demand cycle for this plan right now.', { exact: false });
    const mixed = page.getByText('These services are booked in different ways in your community.', { exact: false });
    await expect(demand.or(continuous).or(noCycle).or(mixed)).toBeVisible();

    if (await demand.isVisible()) {
      await expect(demand).toBeDisabled();
      await page.getByRole('checkbox', { name: /I understand and accept these payment terms/ }).click();
      await expect(demand).toBeDisabled(); // still needs a preferred time
      await page.getByRole('checkbox', { name: /\(\d{2}:\d{2}.\d{2}:\d{2}\)/ }).first().click();
      await expect(demand).toBeEnabled();
    } else if (await continuous.isVisible()) {
      await expect(continuous).toBeDisabled();
      await expect(page.getByText(/paid in full now/)).toBeVisible();
    }
  });

  test('"My bookings" opens bookings and payments', async ({ page }) => {
    const myBookings = page.getByRole('button', { name: 'My bookings' });
    test.skip(!(await myBookings.isVisible().catch(() => false)), 'Booking is not available for the test resident');
    await myBookings.click();
    await expect(page.getByRole('heading', { name: 'Bookings and payments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bookings', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demand requests' })).toBeVisible();
  });
});
