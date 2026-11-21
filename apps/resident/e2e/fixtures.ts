import { expect, test, type Page, type Route } from '@playwright/test';

/*
 * Shared helpers for the Resident app Playwright specs (Expo web build).
 *
 * Selectors come from the real source:
 *  - Field (src/components/ui.tsx) sets accessibilityLabel={label} on the TextInput -> aria-label -> getByLabel(label)
 *  - Button/Card(onPress) use accessibilityRole="button" -> role=button, name = visible title
 *  - Choice uses accessibilityRole="radio" + accessibilityState.checked -> role=radio, aria-checked
 *  - H1/H2 use accessibilityRole="header" -> role=heading
 *  - Banner tone="error" uses accessibilityRole="alert" -> role=alert
 */

export const resident = {
  phone: process.env.E2E_RESIDENT_PHONE ?? '',
  otp: process.env.E2E_RESIDENT_OTP ?? '',
  /** Set to 1 to allow specs that create data (tickets, family requests). Off by default. */
  allowWrites: process.env.E2E_RESIDENT_ALLOW_WRITES === '1',
};

export const MISSING_CREDS_REASON =
  'E2E_RESIDENT_PHONE / E2E_RESIDENT_OTP not set. Add a test phone number in Supabase -> Authentication -> Phone -> Test OTPs and export both variables (see docs/testing/MOBILE_TESTING.md).';

/**
 * Web sign-in cannot finish today: src/lib/supabase.ts keeps the session key in
 * expo-secure-store, whose web build is an empty module, so saving the session
 * after verifyOtp throws and the app never leaves the OTP step. Set
 * E2E_RESIDENT_WEB_AUTH=1 once the app has a web-capable session store.
 */
export const WEB_AUTH_BLOCKED_REASON =
  'Web sign-in is blocked: expo-secure-store has no web implementation (apps/resident/src/lib/supabase.ts LargeSecureStore). Set E2E_RESIDENT_WEB_AUTH=1 once fixed.';

/** Skip the whole file/describe when no Supabase test phone is configured or web sign-in is blocked. */
export function requireResidentCreds() {
  test.skip(!resident.phone || !resident.otp, MISSING_CREDS_REASON);
  test.skip(process.env.E2E_RESIDENT_WEB_AUTH !== '1', WEB_AUTH_BLOCKED_REASON);
}

/**
 * Phone OTP sign-in through the real UI (RES-01). Ends on the Home tab.
 * Supabase allows one OTP request per phone every 60 s (also for test numbers),
 * so if the send is refused we wait out the window once and retry. Keep the
 * resident-web project at one worker for the signed-in specs.
 */
export async function signIn(page: Page) {
  test.setTimeout(Math.max(test.info().timeout, 150_000));
  await page.goto('/');
  if (await page.getByRole('tab', { name: /Profile/ }).isVisible({ timeout: 5_000 }).catch(() => false)) return; // session restored
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
  await page.getByLabel('Mobile number').fill(resident.phone);
  const sent = page.getByRole('heading', { name: 'Enter the code' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Send code' }).click();
    const outcome = await Promise.race([
      sent.waitFor({ timeout: 20_000 }).then(() => 'sent' as const),
      page.getByRole('alert').waitFor({ timeout: 20_000 }).then(() => 'refused' as const),
    ]).catch(() => 'timeout' as const);
    if (outcome === 'sent') break;
    if (attempt === 0) await page.waitForTimeout(61_000);
  }
  await expect(sent).toBeVisible();
  // One visually hidden input; it verifies on the 6th digit.
  await page.getByLabel(/^Verification code, 6 digits$/).fill(resident.otp, { force: true });
  await expect(page.getByRole('tab', { name: /Profile/ }), 'Home did not open after OTP verification.').toBeVisible({ timeout: 30_000 });
}

/**
 * Opens a bottom tab. React Navigation renders web tabs as links/tabs whose
 * accessible name starts with the tab title; fall back to the route URL.
 */
export async function openTab(page: Page, title: 'Home' | 'Book' | 'Visits' | 'Support' | 'Profile') {
  const name = new RegExp(`^${title}\\b`);
  const tab = page.getByRole('tab', { name }).or(page.getByRole('link', { name })).first();
  if (await tab.isVisible().catch(() => false)) await tab.click();
  else await page.goto(title === 'Home' ? '/' : `/${title.toLowerCase()}`);
}

/** Opens a hidden (href: null) route inside the signed-in area by URL. */
export async function openRoute(page: Page, path: '/register' | '/vote' | '/bookings' | '/notifications' | '/household') {
  await page.goto(path);
}

/* ---------- Offline mocks for the unauthenticated specs ---------- */

/** Matches the Supabase Auth OTP endpoints whatever EXPO_PUBLIC_SUPABASE_URL is. */
export const OTP_URL = /\/auth\/v1\/otp(\?|$)/;
export const VERIFY_URL = /\/auth\/v1\/verify(\?|$)/;

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** A syntactically valid (unsigned) session, enough for the client to treat the user as signed in. */
export function fakeSession(phone = '+919999900001') {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated', exp: now + 3600, phone })}.sig`;
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', phone: phone.replace('+', ''), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
