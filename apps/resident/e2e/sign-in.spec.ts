import { expect, test } from '@playwright/test';
import { fakeSession, json, OTP_URL, VERIFY_URL } from './fixtures';

/*
 * RES-01 phone OTP sign-in (src/app/sign-in.tsx). Runs without credentials:
 * Supabase Auth calls are mocked with page.route, so nothing is sent to a real
 * project and no SMS is triggered.
 */

test.describe('Sign in: phone entry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome to Nestovin' })).toBeVisible();
  });

  test('shows the phone step', async ({ page }) => {
    await expect(page.getByText('Managed maid, cook and caretaker services for your home.')).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toHaveAttribute('placeholder', '98765 43210');
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
    await expect(page.getByLabel('Code')).toHaveCount(0);
  });

  for (const bad of ['', '12345', '5876543210', '98765 4321', 'abcdefghij']) {
    test(`rejects invalid number "${bad}" without calling Supabase`, async ({ page }) => {
      let called = false;
      await page.route(OTP_URL, (r) => { called = true; return json(r, 200, {}); });
      if (bad) await page.getByLabel('Mobile number').fill(bad);
      await page.getByRole('button', { name: 'Send code' }).click();
      await expect(page.getByRole('alert')).toHaveText('Enter a valid 10-digit mobile number');
      expect(called).toBe(false);
    });
  }

  for (const [input, e164] of [
    ['98765 43210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ] as const) {
    test(`normalises "${input}" to ${e164}`, async ({ page }) => {
      let sentPhone: string | undefined;
      await page.route(OTP_URL, async (r) => {
        sentPhone = (r.request().postDataJSON() as { phone?: string }).phone;
        await json(r, 200, {});
      });
      await page.getByLabel('Mobile number').fill(input);
      await page.getByRole('button', { name: 'Send code' }).click();
      await expect(page.getByText(`We sent a 6-digit code to ${e164}.`)).toBeVisible();
      // supabase-js may strip the leading "+"; compare digits only.
      expect(sentPhone?.replace(/\D/g, '')).toBe(e164.replace(/\D/g, ''));
    });
  }

  test('shows a generic error when Supabase fails to send', async ({ page }) => {
    await page.route(OTP_URL, (r) => json(r, 500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending sms' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toHaveText('We could not send the code. Please try again.');
    await expect(page.getByLabel('Mobile number')).toBeVisible();
  });

  test('shows the rate-limit message for an SMS rate limit', async ({ page }) => {
    await page.route(OTP_URL, (r) => json(r, 429, { code: 429, error_code: 'over_sms_send_rate_limit', msg: 'SMS rate limit exceeded' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    // Copy from claude/resident-app-0932e5 e539651 (BUG-QA-006 fix); N comes from Supabase or defaults to 60.
    await expect(page.getByRole('alert')).toHaveText(/^Too many attempts\. Please wait \d+ seconds, then send a new code\.$/);
  });

  test('shows the rate-limit message when a code is re-requested within 60 s', async ({ page }) => {
    // BUG-QA-006 (fixed in e539651): 429 over_request_rate_limit used to fall through to the generic error.
    await page.route(OTP_URL, (r) => json(r, 429, { code: 429, error_code: 'over_request_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByRole('alert')).toHaveText('Too many attempts. Please wait 42 seconds, then send a new code.');
  });
});

test.describe('Sign in: OTP step', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(OTP_URL, (r) => json(r, 200, {}));
    await page.goto('/sign-in');
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('We sent a 6-digit code to +919876543210.')).toBeVisible();
  });

  test('shows the code field and actions', async ({ page }) => {
    await expect(page.getByLabel('Code')).toBeVisible();
    await expect(page.getByLabel('Code')).toHaveAttribute('maxlength', '6');
    await expect(page.getByRole('button', { name: 'Verify and continue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a different number' })).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toHaveCount(0);
  });

  test('keeps digits only in the code field', async ({ page }) => {
    await page.getByLabel('Code').pressSequentially('12ab3-4');
    await expect(page.getByLabel('Code')).toHaveValue('1234');
  });

  for (const code of ['', '123', '12345']) {
    test(`rejects a short code "${code}" without calling Supabase`, async ({ page }) => {
      let called = false;
      await page.route(VERIFY_URL, (r) => { called = true; return json(r, 200, {}); });
      if (code) await page.getByLabel('Code').fill(code);
      await page.getByRole('button', { name: 'Verify and continue' }).click();
      await expect(page.getByRole('alert')).toHaveText('Enter the 6-digit code');
      expect(called).toBe(false);
    });
  }

  test('shows an error for a wrong or expired code', async ({ page }) => {
    await page.route(VERIFY_URL, (r) => json(r, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }));
    await page.getByLabel('Code').fill('000000');
    await page.getByRole('button', { name: 'Verify and continue' }).click();
    await expect(page.getByRole('alert')).toHaveText('That code is not correct or has expired.');
    await expect(page.getByLabel('Code')).toBeVisible();
  });

  test('"Use a different number" returns to the phone step and clears the code', async ({ page }) => {
    await page.getByLabel('Code').fill('123');
    await page.getByRole('button', { name: 'Use a different number' }).click();
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByLabel('Code')).toHaveValue('');
  });

  test('a successful verification opens Home (mocked session and API)', async ({ page }) => {
    // BUG-QA-004 (fixed in e539651): the web build now stores the session in localStorage.
    await page.route(VERIFY_URL, (r) => json(r, 200, fakeSession('+919876543210')));
    await page.route(/\/v1\/resident\/me(\?|$)/, (r) =>
      json(r, 200, { id: '00000000-0000-4000-8000-000000000001', phone: '+919876543210', fullName: 'Asha Rao', email: null, status: 'ACTIVE', membership: null, verification: null, version: 1 }),
    );
    await page.route(/\/v1\/resident\/notifications/, (r) => json(r, 200, { items: [], unread: 0 }));
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Verify and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible({ timeout: 15_000 });
    // No membership yet: onboarding card.
    await expect(page.getByRole('heading', { name: 'Register your flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register my flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My community is not listed' })).toBeVisible();
  });
});
