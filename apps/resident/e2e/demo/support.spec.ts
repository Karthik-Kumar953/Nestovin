import { back, expect, heading, open, openTab, test } from './demo-fixtures';

/*
 * RES-12: support requests list, a request thread with the reply composer, and the new-request form
 * (category, subject, details) with its validation. Demo mode answers POST /tickets with the fixture
 * thread, so the full submit is safe to exercise.
 */

const ticket = /^Cook timing on weekends, Waiting for you, Visit timing$/;

test.describe('Support', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'support');
    await expect(heading(page, 'Support')).toBeVisible();
  });

  test('lists open requests with status and reference', async ({ page }) => {
    await expect(page.getByText('We usually reply within a working day.')).toBeVisible();
    await expect(heading(page, 'Open')).toBeVisible();
    const card = page.getByRole('button', { name: ticket });
    await expect(card).toBeVisible();
    await expect(card.getByText(/^NV-T-\d+ · Visit timing · /)).toBeVisible();
    await expect(page.getByRole('button', { name: 'New request', exact: true }).filter({ hasText: 'New request' })).toBeVisible();
  });

  test('request thread: messages, status and the reply composer', async ({ page }) => {
    await page.getByRole('button', { name: ticket }).click();
    await expect(heading(page, 'Cook timing on weekends')).toBeVisible();
    await expect(page.getByText(/^NV-T-\d+ · Visit timing$/)).toBeVisible();
    await expect(page.getByLabel('Status: Waiting for you').filter({ visible: true })).toBeVisible();
    await expect(page.getByLabel(/^You, .+: Can the Saturday breakfast visit start at 8:00 instead of 7:30\?$/)).toBeVisible();
    await expect(page.getByLabel(/^Priya, Nestovin Support, .+: We can move Saturdays to 8:00 from next week\. Shall we go ahead\?$/)).toBeVisible();
    await expect(page.getByText(/^Assigned to the Green Meadows team · /)).toBeVisible();

    const reply = page.getByRole('textbox', { name: 'Reply', exact: true });
    await expect(reply).toHaveAttribute('placeholder', 'Write a reply');
    await reply.fill('Yes, please go ahead.');
    await page.getByRole('button', { name: 'Send reply' }).last().click();
    await expect(reply).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('"New request" (tap on the header action)', async ({ page }) => {
    test.setTimeout(45_000);
    await page.getByRole('button', { name: 'New request', exact: true }).first().click({ timeout: 10_000 });
    await expect(heading(page, 'New request')).toBeVisible();
  });
});

test.describe('New request form', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, 'support');
    await page.getByRole('button', { name: 'New request', exact: true }).filter({ hasText: 'New request' }).click(); // the button below the list
    await expect(heading(page, 'New request')).toBeVisible();
  });

  test('validates category, subject and details', async ({ page }) => {
    await expect(heading(page, 'What is it about?')).toBeVisible();
    for (const name of ['Visit quality', 'Visit timing', 'Payments and billing']) await expect(page.getByRole('radio', { name })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Subject', exact: true })).toHaveAttribute('placeholder', 'For example: Cook arrived late today');
    await expect(page.getByText('Dates, times and what happened help us fix it faster.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: 'Send request' }).last().click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choose what your request is about' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Add a short subject (at least 3 characters)' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Tell us a little more (at least 5 characters)' })).toBeVisible();

    await page.getByRole('radio', { name: 'Payments and billing' }).click();
    await expect(page.getByText('Choose what your request is about')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Hi');
    await expect(page.getByText('Add a short subject (at least 3 characters)')).toBeVisible();
    await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Receipt missing');
    await expect(page.getByText('Add a short subject (at least 3 characters)')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Details', exact: true }).fill('Hm');
    await expect(page.getByText('Tell us a little more (at least 5 characters)')).toBeVisible();
    await page.getByRole('textbox', { name: 'Details', exact: true }).fill('I did not get a receipt for my last payment.');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a valid request is sent and opens its thread', async ({ page }) => {
    await page.getByRole('radio', { name: 'Visit timing' }).click();
    await page.getByRole('textbox', { name: 'Subject', exact: true }).fill('Cook timing on weekends');
    await page.getByRole('textbox', { name: 'Details', exact: true }).fill('Can the Saturday visit start later?');
    await page.getByRole('button', { name: 'Send request' }).last().click();
    await expect(page).toHaveURL(/\/ticket\/[0-9a-f-]+$/);
    await expect(page.getByRole('textbox', { name: 'Reply', exact: true })).toBeVisible();
  });

  test('back returns to Support', async ({ page }) => {
    await back(page).click();
    await expect(heading(page, 'Support')).toBeVisible();
  });
});

test('Support tab from the tab bar, and Profile → "Help and support"', async ({ page }) => {
  await open(page);
  await openTab(page, 'Support');
  await expect(heading(page, 'Support')).toBeVisible();
  await openTab(page, 'Profile');
  await page.getByRole('button', { name: 'Help and support' }).click();
  await expect(heading(page, 'Support')).toBeVisible();
});
