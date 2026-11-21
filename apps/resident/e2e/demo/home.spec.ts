import { RESIDENT, RUPEES, back, expect, heading, open, openTab, tabBar, test, waitForActiveHome } from './demo-fixtures';

/*
 * Home in its three states (src/app/(app)/(tabs)/index.tsx) and the native tab bar.
 * Default = verified resident with visits; ?demo=new = not registered; ?demo=pending = under review.
 */

test.describe('Home: active resident (default demo state)', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await waitForActiveHome(page);
  });

  test('greets the resident and shows their flat', async ({ page }) => {
    await expect(page.getByText(`${RESIDENT.community} · ${RESIDENT.tower} ${RESIDENT.flat}`)).toBeVisible();
    await expect(page.getByRole('button', { name: `${RESIDENT.community}, ${RESIDENT.tower} flat ${RESIDENT.flat}. Household` })).toBeVisible();
    await expect(page.getByText('Verified · Primary resident')).toBeVisible();
  });

  test("shows today's visit with the assigned worker and the check-in hint", async ({ page }) => {
    const today = page.getByRole('button', { name: /^Today: Cook at \d{1,2}:\d{2} (am|pm), Worker assigned$/ });
    await expect(today).toBeVisible();
    await expect(today.getByText('Nestovin staff, assigned for this visit')).toBeVisible();
    await expect(today.getByText('When they arrive, show your check-in code. Do not share it on the phone.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show check-in code' })).toBeVisible();
  });

  test('flags the unpaid balance and opens that booking', async ({ page }) => {
    const due = page.getByRole('button', { name: /^\[Plan A\] Maid: ₹[\d,]+ due\. Pay by .+ to keep your slot\.?$/ });
    await expect(due).toBeVisible();
    await due.click();
    await expect(heading(page, '[Plan A] Maid')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pay balance ₹/ })).toBeVisible();
  });

  test('lists coming-up visits and links to all visits', async ({ page }) => {
    await expect(heading(page, 'Coming up')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Maid, \w{3} \d{1,2} at .+, Scheduled$/ })).toBeVisible();
    await page.getByRole('button', { name: 'All visits' }).click();
    await expect(heading(page, 'Visits')).toBeVisible();
  });

  test('service cards open the catalogue filtered to that service', async ({ page }) => {
    await expect(heading(page, 'Book a service')).toBeVisible();
    for (const name of ['Maid, Cleaning and upkeep. See plans', 'Cook, Home-style meals. See plans', 'Caretaker, Care for elders. See plans']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Cook, Home-style meals. See plans' }).click();
    await expect(heading(page, 'Book')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Cook', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^\[Plan B\] Cook,/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^\[Plan A\] Maid,/ })).toHaveCount(0);
  });

  test('the Updates bell shows the unread count and opens Updates', async ({ page }) => {
    test.setTimeout(45_000);
    const bell = page.getByRole('button', { name: /^Updates, \d+ unread$/ });
    await expect(bell).toBeVisible();
    await bell.click({ timeout: 10_000 });
    await expect(heading(page, 'Updates')).toBeVisible();
    await back(page).click();
    await waitForActiveHome(page);
  });

  test('the Updates bell is reachable by keyboard', async ({ page }) => {
    const bell = page.getByRole('button', { name: /^Updates, \d+ unread$/ });
    await bell.focus();
    await page.keyboard.press('Enter');
    await expect(heading(page, 'Updates')).toBeVisible();
  });

  test('the community card opens Household', async ({ page }) => {
    await page.getByRole('button', { name: `${RESIDENT.community}, ${RESIDENT.tower} flat ${RESIDENT.flat}. Household` }).click();
    await expect(heading(page, 'Household')).toBeVisible();
  });

  test('amounts are shown in rupees', async ({ page }) => {
    await expect(page.getByText(RUPEES).filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe('Home: not registered (?demo=new)', () => {
  test('explains the three registration steps and offers to register', async ({ page }) => {
    await open(page, '?demo=new');
    await expect(page.getByRole('heading', { name: `Welcome, ${RESIDENT.first}` })).toBeVisible();
    await expect(page.getByText('Managed home help for gated communities.')).toBeVisible();
    await expect(heading(page, 'Register your flat')).toBeVisible();
    await expect(page.getByText('Three quick steps. Our team verifies every residence before services start.')).toBeVisible();
    for (const step of ['Choose your flat', 'Add one proof of residence', 'Book a plan']) await expect(page.getByText(step, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register my flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My community is not listed' })).toBeVisible();
    await expect(heading(page, 'What you can book')).toBeVisible();
    // No visits, no check-in code and no flat chip before registration.
    await expect(page.getByRole('button', { name: 'Show check-in code' })).toHaveCount(0);
    await expect(page.getByText(`${RESIDENT.community} · ${RESIDENT.tower} ${RESIDENT.flat}`)).toHaveCount(0);
  });

  test('"Register my flat" opens registration', async ({ page }) => {
    await open(page, '?demo=new');
    await page.getByRole('button', { name: 'Register my flat' }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(heading(page, 'Register your flat')).toBeVisible();
  });

  test('"My community is not listed" opens the community vote', async ({ page }) => {
    await open(page, '?demo=new');
    await page.getByRole('button', { name: 'My community is not listed' }).click();
    await expect(heading(page, 'Bring Nestovin to you')).toBeVisible();
  });
});

test.describe('Home: verification pending (?demo=pending)', () => {
  test('shows the review status and timeline, with no booking actions', async ({ page }) => {
    await open(page, '?demo=pending');
    await expect(heading(page, RESIDENT.community)).toBeVisible();
    await expect(page.getByText(`${RESIDENT.tower} · Flat ${RESIDENT.flat}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Status: Under review').filter({ visible: true })).toBeVisible();
    await expect(heading(page, 'We are checking your document')).toBeVisible();
    await expect(page.getByText('You will get an update here and by notification. Booking opens as soon as your residence is verified.')).toBeVisible();
    await expect(page.getByLabel(`Flat registered, ${RESIDENT.tower} · Flat ${RESIDENT.flat} · Owner, done`)).toBeVisible();
    await expect(page.getByLabel('Proof of residence, Received, done')).toBeVisible();
    await expect(page.getByLabel('Verification by our team, current step')).toBeVisible();
    await expect(page.getByLabel('Book services, not yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show check-in code' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Register my flat' })).toHaveCount(0);
  });
});

test.describe('Tab bar', () => {
  test('the tab bar and its tabs have clean accessible names', async ({ page }) => {
    test.fail(true, 'BUG-QA-025: the web tab bar has no name and each tab name starts with an icon-font glyph');
    await open(page);
    await waitForActiveHome(page);
    const main = page.getByRole('tablist', { name: 'Main' });
    for (const name of ['Home', 'Book', 'Visits', 'Support', 'Profile']) await expect(main.getByRole('tab', { name, exact: true })).toBeVisible({ timeout: 3_000 });
  });

  test('every tab opens with its heading', async ({ page }) => {
    await open(page);
    await waitForActiveHome(page);
    await expect(tabBar(page).getByRole('tab')).toHaveText([/Home$/, /Book$/, /Visits$/, /Support$/, /Profile$/]);

    await openTab(page, 'Book');
    await expect(heading(page, 'Book')).toBeVisible();
    await openTab(page, 'Visits');
    await expect(heading(page, 'Visits')).toBeVisible();
    await openTab(page, 'Support');
    await expect(heading(page, 'Support')).toBeVisible();
    await openTab(page, 'Profile');
    await expect(heading(page, 'Profile')).toBeVisible();
    await openTab(page, 'Home');
    await waitForActiveHome(page);
  });
});
