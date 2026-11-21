import { NON_REFUNDABLE, RUPEES, TAB_BAR_OVERLAP, back, expect, heading, open, test } from './demo-fixtures';

/*
 * RES-06/07/08: catalogue (Book tab), plan detail, joining a booking round (demand-led) and picking a
 * slot (continuous). Every flow stops before "Pay …": checkout is Razorpay, a native module.
 * Plan names / prices in demo.ts are placeholders: we navigate by them but assert prices by format only.
 */

const planA = /^\[Plan A\] Maid, Booking round, 1 month, from ₹[\d,]+ including taxes$/; // demand-led
const planB = /^\[Plan B\] Cook, Start within 14 days, 1 month, from ₹[\d,]+ including taxes$/; // continuous

test.describe('Catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'book');
    await expect(heading(page, 'Book')).toBeVisible();
  });

  test('lists plans for the flat with the open booking round', async ({ page }) => {
    await expect(page.getByText('Plans for your 2 BHK · 1204')).toBeVisible();
    await expect(page.getByText(/ is open until /)).toBeVisible();
    await expect(page.getByText(/^For round-based plans you pay \d+% now and the rest once your time slot is confirmed\.$/)).toBeVisible();
    await expect(page.getByRole('button', { name: planA })).toBeVisible();
    await expect(page.getByRole('button', { name: planB })).toBeVisible();
    await expect(page.getByText('You do not choose a named worker. Nestovin assigns trained staff to your slot.')).toBeVisible();
  });

  test('filters plans by service', async ({ page }) => {
    const filters = page.getByRole('tablist', { name: 'Filter plans by service' });
    for (const name of ['All plans', 'Maid', 'Cook', 'Caretaker']) await expect(filters.getByRole('tab', { name, exact: true })).toBeVisible();
    await filters.getByRole('tab', { name: 'Maid', exact: true }).click();
    await expect(page.getByRole('button', { name: planA })).toBeVisible();
    await expect(page.getByRole('button', { name: planB })).toHaveCount(0);
    await filters.getByRole('tab', { name: 'Caretaker', exact: true }).click();
    await expect(page.getByRole('button', { name: planB })).toBeVisible(); // Caretaker is an add-on of the Cook plan
    await expect(page.getByRole('button', { name: planA })).toHaveCount(0);
    await filters.getByRole('tab', { name: 'All plans', exact: true }).click();
    await expect(page.getByRole('button', { name: planA })).toBeVisible();
    await expect(page.getByRole('button', { name: planB })).toBeVisible();
  });

  test('"My bookings" opens the bookings list (tap)', async ({ page }) => {
    test.fail(true, TAB_BAR_OVERLAP);
    test.setTimeout(45_000);
    await page.getByRole('button', { name: 'My bookings' }).first().click({ timeout: 10_000 });
    await expect(heading(page, 'Bookings')).toBeVisible();
  });

  test('"My bookings" opens the bookings list (keyboard)', async ({ page }) => {
    await page.getByRole('button', { name: 'My bookings' }).first().focus();
    await page.keyboard.press('Enter');
    await expect(heading(page, 'Bookings')).toBeVisible();
  });

  test('a11y: the header action is announced once', async ({ page }) => {
    test.fail(true, 'BUG: ui-native Screen renders `actions` twice in the header (and again in the hidden compact bar), so "My bookings" is announced 3 times');
    await expect(page.getByRole('button', { name: 'My bookings' })).toHaveCount(1, { timeout: 3_000 });
  });

  test('a11y: the selected filter is exposed as selected', async ({ page }) => {
    test.fail(true, 'BUG: accessibilityState is not mapped to aria-selected / aria-checked by react-native-web 0.21 (filter chips, SegmentedControl, ChoiceTile)');
    await expect(page.getByRole('tab', { name: 'All plans', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 3_000 });
  });
});

test.describe('Booking not open', () => {
  test('not registered: asks the resident to register first', async ({ page }) => {
    await open(page, 'book?demo=new');
    await expect(heading(page, 'Register your flat to book')).toBeVisible();
    await expect(page.getByText('Choose your flat and add one proof of residence. Booking opens once it is verified.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register my flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: planA })).toHaveCount(0);
  });

  test('under review: explains booking opens after verification', async ({ page }) => {
    await open(page, 'book?demo=pending');
    await expect(heading(page, 'Your residence is being verified')).toBeVisible();
    await expect(page.getByText('Booking opens as soon as our team approves your document. We will notify you.')).toBeVisible();
    await expect(page.getByRole('button', { name: planA })).toHaveCount(0);
  });
});

test.describe('Demand-led plan: join a booking round', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'book');
    await page.getByRole('button', { name: planA }).click();
    await expect(heading(page, '[Plan A] Maid')).toBeVisible();
  });

  test('plan detail shows what is included and the non-refundable condition', async ({ page }) => {
    await expect(page.getByText('Join the round with your preferred times. Your slot and start date are confirmed after the round closes.')).toBeVisible();
    await expect(heading(page, 'What is included')).toBeVisible();
    await expect(page.getByText('1 visit a day · 60 min · Mon to Sat')).toBeVisible();
    await expect(page.getByText('Total for 1 month, incl. taxes')).toBeVisible();

    const more = page.getByRole('button', { name: /^Show all \d+ tasks$/ });
    await expect(page.getByText('Bathroom cleaning')).toHaveCount(0);
    await more.click();
    await expect(page.getByText('Bathroom cleaning')).toBeVisible();
    await page.getByRole('button', { name: 'Show fewer tasks' }).click();
    await expect(page.getByText('Bathroom cleaning')).toHaveCount(0);

    await page.getByRole('button', { name: /^Payment conditions/ }).click();
    await expect(page.getByText(/^You pay \d+% now to join the round\. This part is non-refundable\. The balance is due by the deadline shown once your slot is confirmed\.$/)).toBeVisible();
    await expect(page.getByText('Prices include taxes. The plan, tasks and prices are fixed for your booking when you pay.')).toBeVisible();
  });

  test('round form: preferred times in order, explicit consent, then the pay button enables', async ({ page }) => {
    await page.getByRole('button', { name: 'Join booking round' }).click();
    await expect(heading(page, 'Join booking round')).toBeVisible();
    await expect(page.getByText(/^Closes /)).toBeVisible();
    await expect(heading(page, 'Preferred times')).toBeVisible();

    const pay = page.getByRole('button', { name: /^Pay ₹[\d,]+ and join$/ });
    await expect(pay).toBeDisabled();

    // Non-refundable disclosure (product copy from @nestovin/contracts NON_REFUNDABLE_DISCLOSURE).
    await expect(page.getByText('Non-refundable payment')).toBeVisible();
    await expect(page.getByText(NON_REFUNDABLE)).toBeVisible();
    await expect(page.getByText('Joining is not a confirmed service. We confirm your slot and start date when the round closes.')).toBeVisible();

    // Amounts: plan total, the joining share and the balance.
    await expect(page.getByText('Plan total, incl. taxes')).toBeVisible();
    await expect(page.getByText(/^Pay now to join \(\d+%\)$/)).toBeVisible();
    await expect(page.getByText('Balance, due after your slot is confirmed')).toBeVisible();

    // Ranked preferences: the order of taps becomes choice 1, choice 2.
    await page.getByRole('checkbox', { name: /^Morning, / }).click();
    await page.getByRole('checkbox', { name: /^Early morning, / }).click();
    await expect(page.getByRole('checkbox', { name: /^Morning, .*, choice 1$/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /^Early morning, .*, choice 2$/ })).toBeVisible();
    await expect(pay).toBeDisabled(); // terms not accepted yet

    const terms = page.getByRole('checkbox', { name: 'I understand and accept these payment terms' });
    await terms.click();
    await expect(pay).toBeEnabled();

    // Removing every preferred time disables payment again.
    await page.getByRole('checkbox', { name: /^Morning, / }).click();
    await expect(page.getByRole('checkbox', { name: /^Early morning, .*, choice 1$/ })).toBeVisible();
    await page.getByRole('checkbox', { name: /^Early morning, / }).click();
    await expect(pay).toBeDisabled();

    // Un-accepting the terms also disables it.
    await page.getByRole('checkbox', { name: /^Evening, / }).click();
    await expect(pay).toBeEnabled();
    await terms.click();
    await expect(pay).toBeDisabled();
  });

  test('back returns to the plan', async ({ page }) => {
    await page.getByRole('button', { name: 'Join booking round' }).click();
    await expect(heading(page, 'Join booking round')).toBeVisible();
    await back(page).click();
    await expect(heading(page, '[Plan A] Maid')).toBeVisible();
  });
});

test.describe('Continuous plan: choose a slot', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'book');
    await page.getByRole('button', { name: planB }).click();
    await expect(heading(page, '[Plan B] Cook')).toBeVisible();
  });

  test('plan detail: full payment terms and an optional add-on that changes the total', async ({ page }) => {
    await expect(page.getByText('Pick an available slot and a start date from tomorrow up to 14 days ahead.')).toBeVisible();
    await expect(page.getByText('Pay now, incl. taxes')).toBeVisible();
    await page.getByRole('button', { name: /^Payment conditions/ }).click();
    await expect(page.getByText('You pay the full amount now. Your service is confirmed only after payment succeeds and the slot is still available.')).toBeVisible();
    await expect(page.getByText(/non-refundable/i)).toHaveCount(0);

    await expect(heading(page, 'Add-ons')).toBeVisible();
    const total = page.getByRole('heading', { name: RUPEES });
    const before = await total.textContent();
    await page.getByRole('checkbox', { name: /^Add Caretaker, \d+ hours a day · Every day$/ }).click();
    await expect(total).not.toHaveText(before ?? '');
    await expect(total).toHaveText(RUPEES);
  });

  test('slot form: pay stays disabled until a slot and a start date are chosen', async ({ page }) => {
    await page.getByRole('checkbox', { name: /^Add Caretaker, / }).click();
    await page.getByRole('button', { name: 'Choose a slot' }).click();
    await expect(heading(page, 'Choose a slot')).toBeVisible();
    await expect(heading(page, 'Time slot')).toBeVisible();
    await expect(heading(page, 'Start date')).toBeVisible();

    const pay = page.getByRole('button', { name: /^Pay ₹[\d,]+$/ });
    await expect(pay).toBeDisabled();
    await expect(page.getByText('Not chosen')).toHaveCount(2); // slot and start date in the summary
    await expect(page.getByText('Add-on: Caretaker')).toBeVisible();
    await expect(page.getByText('Pay now, in full, incl. taxes')).toBeVisible();

    await page.getByRole('radio', { name: /^Breakfast · 7:30 am, 90 min · Every day$/ }).click();
    await expect(page.getByText('Breakfast · 7:30 am', { exact: true })).toHaveCount(2); // the tile and the summary row
    await expect(pay).toBeDisabled();

    const dates = page.getByRole('radiogroup', { name: 'Start date' }).getByRole('radio');
    await expect(dates.first()).toHaveAccessibleName(/^\w+day, \d{1,2} \w+$/); // e.g. "Sunday, 22 November"
    expect(await dates.count()).toBeGreaterThanOrEqual(14);
    await dates.nth(2).click();
    await expect(page.getByText('Not chosen')).toHaveCount(0);
    await expect(pay).toBeEnabled();
    await expect(page.getByText('Your service is confirmed only after payment succeeds and the slot is still available.')).toBeVisible();
  });
});
