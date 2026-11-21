import { RESIDENT, back, expect, heading, open, openTab, test } from './demo-fixtures';

/*
 * RES-13/14: Profile (details, residence, links, edit sheet) and the Updates inbox.
 * Sign out confirms with Alert.alert, which react-native-web does not implement (no dialog on web),
 * so sign-out is not covered here.
 */

test.describe('Profile', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'profile');
    await expect(heading(page, 'Profile')).toBeVisible();
  });

  test('shows the resident, their flat and the account links', async ({ page }) => {
    await expect(heading(page, RESIDENT.name)).toBeVisible();
    await expect(page.getByText(/^\+91 \d{5} \d{5}$/)).toBeVisible();
    await expect(page.getByLabel('Status: Primary resident').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `${RESIDENT.community}, ${RESIDENT.tower} · Flat ${RESIDENT.flat} · Owner` })).toBeVisible();
    for (const name of [
      'Household, Family members and access',
      'Change residence details, Owner or tenant, or moving out',
      'Bookings and payments',
      'Updates',
      'Help and support',
      'Bring Nestovin to another community',
      'Sign out',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Updates', exact: true }).getByText(/^\d+ new$/)).toBeVisible();
    await expect(page.getByText(/^Nestovin \d+\.\d+\.\d+$/)).toBeVisible();
  });

  test('edit details: validates name and email, keeps the phone read-only', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible();
    await expect(page.getByText('Your phone number is how you sign in, so it cannot be changed here.')).toBeVisible();
    const name = page.getByRole('textbox', { name: 'Full name', exact: true });
    const email = page.getByRole('textbox', { name: 'Email', exact: true });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(name).toHaveValue(RESIDENT.name);
    await expect(email).toHaveValue('');
    await expect(page.getByText('For receipts and important updates.')).toBeVisible();
    await expect(save).toBeEnabled();

    await name.fill('A');
    await expect(page.getByRole('alert').filter({ hasText: 'Use at least 2 characters' })).toBeVisible();
    await expect(save).toBeDisabled();
    await name.fill(RESIDENT.name);
    await email.fill('ananya@');
    await expect(page.getByRole('alert').filter({ hasText: 'Enter an email like name@example.com' })).toBeVisible();
    await expect(save).toBeDisabled();
    await email.fill('ananya@example.com');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(save).toBeEnabled();

    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveCount(0);
  });

  test('"Updates" opens the inbox', async ({ page }) => {
    await page.getByRole('button', { name: 'Updates', exact: true }).click();
    await expect(heading(page, 'Updates')).toBeVisible();
  });

  test('"Bring Nestovin to another community" opens the vote form', async ({ page }) => {
    await page.getByRole('button', { name: 'Bring Nestovin to another community' }).click();
    await expect(heading(page, 'Bring Nestovin to you')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send my vote' })).toBeDisabled();
    await back(page).click();
    await expect(heading(page, 'Profile')).toBeVisible();
  });
});

test.describe('Updates inbox', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'notifications');
    await expect(heading(page, 'Updates')).toBeVisible();
  });

  test('groups updates into Today and Earlier, unread first marked', async ({ page }) => {
    await expect(heading(page, 'Today')).toBeVisible();
    await expect(heading(page, 'Earlier')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Unread\. Support replied\. / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Unread\. You joined the booking round\. / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Cook service confirmed\. / })).toBeVisible(); // already read
    await expect(page.getByRole('button', { name: 'Mark all read' }).first()).toBeVisible();
  });

  test('a support reply opens its request thread', async ({ page }) => {
    await page.getByRole('button', { name: /^Unread\. Support replied\. / }).click();
    await expect(heading(page, 'Cook timing on weekends')).toBeVisible();
    await back(page).click();
    await expect(heading(page, 'Updates')).toBeVisible();
  });

  test('a booking update opens the booking', async ({ page }) => {
    await page.getByRole('button', { name: /^Cook service confirmed\. / }).click();
    await expect(heading(page, '[Plan B] Cook')).toBeVisible();
  });

  test('"Mark all read" clears the unread count', async ({ page }) => {
    await page.getByRole('button', { name: 'Mark all read' }).last().click(); // topmost copy (compact bar overlays the header)
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
  });

  test('a11y: update labels read as clean sentences', async ({ page }) => {
    test.fail(true, 'BUG: notifications.tsx joins title/body/time with ". " after a body that already ends in ".", so screen readers hear "reply.. 2 hours ago"');
    await expect(page.getByRole('button', { name: /Support replied/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /\.\. / })).toHaveCount(0, { timeout: 3_000 });
  });
});

test('Profile tab from the tab bar', async ({ page }) => {
  await open(page);
  await openTab(page, 'Profile');
  await expect(heading(page, 'Profile')).toBeVisible();
  await expect(heading(page, RESIDENT.name)).toBeVisible();
});
