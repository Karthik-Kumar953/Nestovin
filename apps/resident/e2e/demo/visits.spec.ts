import { back, expect, heading, open, openTab, test } from './demo-fixtures';

/*
 * RES-10/11: upcoming visits by day, history by month, visit detail (timeline, rating) and the
 * check-in code screen (six digits + QR, short-lived). The demo resident has a Cook visit today
 * with a worker assigned and the code available.
 */

const todaysVisit = /^Cook, \w{3} \d{1,2} at 7:30 am, \w+, Worker assigned$/;

test.describe('Visits', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'visits');
    await expect(heading(page, 'Visits')).toBeVisible();
  });

  test('upcoming visits are grouped by day, today first', async ({ page }) => {
    await expect(page.getByRole('tablist', { name: 'Visits' }).getByRole('tab')).toHaveText(['Upcoming', 'History']);
    await expect(heading(page, 'Today')).toBeVisible();
    await expect(heading(page, 'Tomorrow')).toBeVisible();
    await expect(page.getByRole('button', { name: todaysVisit }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /, Scheduled$/ }).first()).toBeVisible();
    await expect(page.getByText('Worker to be assigned').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show check-in code' })).toBeVisible();
  });

  test("today's visit detail: worker, timeline and the check-in action", async ({ page }) => {
    await page.getByRole('button', { name: todaysVisit }).first().click();
    await expect(heading(page, 'Cook')).toBeVisible();
    await expect(page.getByText(/^\w+day, \d{1,2} \w+$/).filter({ visible: true }).first()).toBeVisible(); // eyebrow: long date
    await expect(page.getByText('Nestovin staff assigned to your slot')).toBeVisible();
    await expect(heading(page, 'What happened')).toBeVisible();
    await expect(page.getByLabel(/^Worker assigned, \w+, done$/)).toBeVisible();
    await expect(page.getByLabel('Checked in, Show your code when they arrive, current step')).toBeVisible();
    await expect(page.getByLabel('Completed, not yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show check-in code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get help with this visit' })).toBeVisible();
    await expect(heading(page, 'How was this visit?')).toHaveCount(0); // only after completion
  });

  test('check-in code: six digits, a QR and a countdown', async ({ page }) => {
    await page.getByRole('button', { name: 'Show check-in code' }).click();
    await expect(page.getByText('Check-in code', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Show this to \w+$/ })).toBeVisible();
    await expect(page.getByText(/They type the code or scan the QR when they arrive\.$/)).toBeVisible();
    await expect(page.getByLabel(/^Code \d( \d){5}$/)).toBeVisible();
    const qr = page.getByLabel('QR code for the worker to scan');
    await expect(qr).toBeVisible();
    await expect(qr.locator('svg')).toBeVisible();
    await expect(page.getByText(/^Valid for \d+:\d{2}$/)).toBeVisible();
    await expect(page.getByText('Never share this code by phone or message. It works once, only for this visit.')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(heading(page, 'Visits')).toBeVisible();
  });

  test('history: completed visits by month, and rating a visit', async ({ page }) => {
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^\w+ \d{4}$/ }).first()).toBeVisible(); // e.g. "November 2026"
    const done = page.getByRole('button', { name: /, Completed$/ });
    await expect(page.getByRole('button', { name: 'Load earlier' })).toBeVisible();
    // Early in a month the current month may have no past visits yet.
    if (!(await done.first().isVisible().catch(() => false))) await page.getByRole('button', { name: 'Load earlier' }).click();
    await expect(done.first()).toBeVisible();

    // The most recent completed visit has no rating yet.
    await done.first().click();
    await expect(heading(page, 'How was this visit?')).toBeVisible();
    await expect(page.getByText('Your rating goes to our quality team, not to the worker directly.')).toBeVisible();
    const send = page.getByRole('button', { name: 'Send rating' });
    await expect(send).toBeDisabled();
    await expect(page.getByText('Tap a star')).toBeVisible();
    await page.getByRole('button', { name: '4 stars, Good' }).click();
    await expect(page.getByText('Good', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Anything to add?', exact: true }).fill('Arrived on time.');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(heading(page, 'Thanks for your rating')).toBeVisible();
    await expect(page.getByLabel('Rating 4 of 5')).toBeVisible();
  });

  test('a missed visit explains what happened', async ({ page }) => {
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    const missed = page.getByRole('button', { name: /, Missed: no one home$/ });
    // The missed visit is 9 days back, so it may sit in the previous month's page.
    if (!(await missed.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Load earlier' }).click();
    await missed.click();
    await expect(page.getByText('No one was home')).toBeVisible();
    await expect(page.getByText('The worker could not get in for this visit. If that is not right, let us know.')).toBeVisible();
    await back(page).click();
    await expect(heading(page, 'Visits')).toBeVisible();
  });
});

test('Home → "Show check-in code" opens the code for today\'s visit', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Show check-in code' }).click();
  await expect(page.getByLabel(/^Code \d( \d){5}$/)).toBeVisible();
  await expect(page.getByLabel('QR code for the worker to scan')).toBeVisible();
});

test('Visits tab from the tab bar', async ({ page }) => {
  await open(page);
  await openTab(page, 'Visits');
  await expect(heading(page, 'Visits')).toBeVisible();
  await expect(heading(page, 'Today')).toBeVisible();
});
