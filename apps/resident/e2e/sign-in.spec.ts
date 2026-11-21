import { expect, test, type Page } from '@playwright/test';
import { fakeSession, json, OTP_URL, VERIFY_URL } from './fixtures';

/*
 * RES-01 phone OTP sign-in (src/app/sign-in.tsx, current as of claude/resident-app-0932e5 e539651).
 * Runs without credentials: Supabase Auth and the Nestovin API are mocked with page.route, so
 * nothing reaches a real project and no SMS is sent.
 */

const PHONE_ERROR = 'Enter a 10-digit mobile number, for example 98765 43210';
const otpInput = (page: Page) => page.getByLabel(/^Verification code, 6 digits$/);
/** The OTP box is one visually hidden input that verifies on the 6th digit. */
const typeCode = (page: Page, code: string) => otpInput(page).fill(code, { force: true });

async function openSignIn(page: Page) {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
}

async function toCodeStep(page: Page) {
  await page.route(OTP_URL, (r) => json(r, 200, {}));
  await openSignIn(page);
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
}

test.describe('Sign in: phone entry', () => {
  test.beforeEach(async ({ page }) => openSignIn(page));

  test('shows the phone step', async ({ page }) => {
    await expect(page.getByText('We will text you a 6-digit code.')).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toHaveAttribute('placeholder', '98765 43210');
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
    await expect(otpInput(page)).toHaveCount(0);
  });

  for (const bad of ['', '12345', '5876543210', '98765 4321', 'abcdefghij']) {
    test(`rejects invalid number "${bad}" without calling Supabase`, async ({ page }) => {
      let called = false;
      await page.route(OTP_URL, (r) => {
        called = true;
        return json(r, 200, {});
      });
      if (bad) await page.getByLabel('Mobile number').fill(bad);
      await page.getByRole('button', { name: 'Send code' }).click();
      await expect(page.getByText(PHONE_ERROR)).toBeVisible();
      expect(called).toBe(false);
    });
  }

  for (const [input, e164, shown] of [
    ['98765 43210', '+919876543210', '+91 98765 43210'],
    ['+91 98765 43210', '+919876543210', '+91 98765 43210'],
    ['919876543210', '+919876543210', '+91 98765 43210'],
  ] as const) {
    test(`normalises "${input}" to ${e164}`, async ({ page }) => {
      let sentPhone: string | undefined;
      await page.route(OTP_URL, async (r) => {
        sentPhone = (r.request().postDataJSON() as { phone?: string }).phone;
        await json(r, 200, {});
      });
      await page.getByLabel('Mobile number').fill(input);
      await page.getByRole('button', { name: 'Send code' }).click();
      await expect(page.getByText(`Sent to ${shown}`)).toBeVisible();
      // supabase-js may strip the leading "+"; compare digits only.
      expect(sentPhone?.replace(/\D/g, '')).toBe(e164.replace(/\D/g, ''));
    });
  }

  test('shows a generic error when Supabase fails to send', async ({ page }) => {
    await page.route(OTP_URL, (r) => json(r, 500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending sms' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('We could not send the code. Check the number and try again.')).toBeVisible();
    await expect(page.getByLabel('Mobile number')).toBeVisible();
  });

  test('shows the rate-limit message for an SMS rate limit', async ({ page }) => {
    // BUG-QA-019: on a first send that is rate-limited the app moves to the code step, but showError
    // still sees the old sentTo (null) and puts the message on the hidden phone step: nothing is shown.
    await page.route(OTP_URL, (r) => json(r, 429, { code: 429, error_code: 'over_sms_send_rate_limit', msg: 'SMS rate limit exceeded' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    // BUG-QA-006 fix (e539651): N comes from Supabase's message or defaults to 60.
    await expect(page.getByText(/^Too many attempts\. Please wait \d+ seconds, then send a new code\.$/)).toBeVisible();
  });

  test('shows the rate-limit message when a code is re-requested within 60 s', async ({ page }) => {
    // BUG-QA-019: on a first send that is rate-limited the app moves to the code step, but showError
    // still sees the old sentTo (null) and puts the message on the hidden phone step: nothing is shown.
    await page.route(OTP_URL, (r) => json(r, 429, { code: 429, error_code: 'over_request_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }));
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByText('Too many attempts. Please wait 42 seconds, then send a new code.')).toBeVisible();
    // The resident is moved to the code step with the resend countdown running.
    await expect(page.getByRole('button', { name: /^Resend in \d+s$/ })).toBeDisabled();
  });
});

test.describe('Sign in: code step', () => {
  test.beforeEach(async ({ page }) => toCodeStep(page));

  test('shows the code input and actions', async ({ page }) => {
    await expect(page.getByText('Sent to +91 98765 43210')).toBeVisible();
    await expect(otpInput(page)).toHaveAttribute('maxlength', '6');
    await expect(page.getByRole('button', { name: 'Verify and continue' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Change number' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Resend in \d+s$/ })).toBeDisabled();
    await expect(page.getByLabel('Mobile number')).toHaveCount(0);
  });

  test('keeps digits only in the code input', async ({ page }) => {
    await otpInput(page).pressSequentially('12ab3-4', { delay: 20 });
    await expect(otpInput(page)).toHaveValue('1234');
  });

  for (const code of ['', '123', '12345']) {
    test(`does not verify a short code "${code}"`, async ({ page }) => {
      let called = false;
      await page.route(VERIFY_URL, (r) => {
        called = true;
        return json(r, 200, {});
      });
      if (code) await typeCode(page, code);
      await expect(page.getByRole('button', { name: 'Verify and continue' })).toBeDisabled();
      expect(called).toBe(false);
    });
  }

  test('shows an error for a wrong or expired code', async ({ page }) => {
    await page.route(VERIFY_URL, (r) => json(r, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }));
    await typeCode(page, '000000'); // verifies on the 6th digit
    await expect(page.getByText('That code is not correct or has expired. Check the SMS or send a new code.')).toBeVisible();
    await expect(otpInput(page)).toBeAttached();
  });

  test('"Change number" returns to the phone step; a new send clears the code', async ({ page }) => {
    await typeCode(page, '123');
    await page.getByRole('button', { name: 'Change number' }).click();
    await expect(page.getByLabel('Mobile number')).toBeVisible();
    await page.getByLabel('Mobile number').fill('9876543210');
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(otpInput(page)).toHaveValue('');
  });

  test('a successful verification opens Home (mocked session and API)', async ({ page }) => {
    // BUG-QA-004 (fixed in e539651): the web build stores the session in localStorage.
    // Every Nestovin API call is mocked: nothing reaches a real server with this fake token.
    await page.route(/\/v1\/resident\//, (r) => json(r, 200, { items: [], unread: 0 }));
    await page.route(/\/v1\/resident\/me(\?|$)/, (r) =>
      json(r, 200, { id: '00000000-0000-4000-8000-000000000001', phone: '+919876543210', fullName: 'Asha Rao', email: null, status: 'ACTIVE', membership: null, verification: null, version: 1 }),
    );
    await page.route(VERIFY_URL, (r) => json(r, 200, fakeSession('+919876543210')));
    await typeCode(page, '123456');
    await expect(page.getByText(/, Asha$/).first()).toBeVisible({ timeout: 20_000 });
    // No membership yet: the onboarding card.
    await expect(page.getByRole('heading', { name: 'Register your flat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register my flat' })).toBeVisible();
  });
});
