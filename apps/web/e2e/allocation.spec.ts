import { test, expect, gotoAdmin, expectPageTitle, expectListLoaded } from './support/fixtures';

const NEEDS_BOOKINGS =
  'Needs paid bookings/subscriptions from the Resident app plus a Ready employee (verified checklist, qualified service); not creatable from the Admin UI alone.';

test.describe('Allocation and visits', () => {
  test('allocation page loads with its filter', async ({ page }) => {
    await gotoAdmin(page, '/allocation');
    await expectPageTitle(page, 'Allocation');
    const onlyUnstaffed = page.getByRole('checkbox', { name: 'Only services without a worker' });
    await expect(onlyUnstaffed).toBeChecked();
    await expectListLoaded(page, 'Services to staff', ['Every service has a worker', 'No current services']);
    await onlyUnstaffed.uncheck();
    await expectListLoaded(page, 'Services to staff', ['No current services', 'Every service has a worker']);
  });

  test('visits page loads with date filter and gaps toggle', async ({ page }) => {
    await gotoAdmin(page, '/allocation/visits');
    await expectPageTitle(page, 'Visits');
    await expect(page.getByLabel('From date')).toBeVisible();
    await expectListLoaded(page, 'Visits', ['No gaps', 'No visits in this period']);
    await page.getByRole('checkbox', { name: 'Only gaps' }).click();
    await expectListLoaded(page, 'Visits', ['No gaps', 'No visits in this period']);
  });

  test('assign a standing worker', async () => {
    test.skip(true, NEEDS_BOOKINGS);
  });

  test('cover / replace a visit', async () => {
    test.skip(true, NEEDS_BOOKINGS);
  });
});

test.describe('Overtime offers', () => {
  test('overtime list loads for each status', async ({ page }) => {
    await gotoAdmin(page, '/allocation/overtime');
    await expectPageTitle(page, 'Overtime offers');
    await expectListLoaded(page, 'Overtime offers', ['No offers']);
    for (const label of ['Confirmed', 'Cancelled']) {
      await page.getByRole('combobox', { name: 'Status' }).selectOption({ label });
      await expectListLoaded(page, 'Overtime offers', ['No offers']);
    }
  });

  test('offer overtime and confirm an accepted worker', async () => {
    test.skip(true, 'Offers are made from a visit without a worker (needs bookings) and accepted in the Worker app.');
  });
});
