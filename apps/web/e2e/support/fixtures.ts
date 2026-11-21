import { test as base, expect, type Browser, type Locator, type Page } from '@playwright/test';

export const CREDS_MISSING = 'E2E admin credentials missing: see docs/testing/E2E.md';

export const ADMIN_STORAGE_STATE = 'e2e/.auth/admin.json';

export function adminCreds(): { email: string; password: string; totpSecret: string } | null {
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD;
  const totpSecret = process.env.E2E_ADMIN_TOTP_SECRET?.trim();
  if (!email || !password || !totpSecret) return null;
  return { email, password, totpSecret };
}

/** Per-run id; every record a spec creates carries the `E2E-<RUN>` prefix. */
export const RUN = process.env.E2E_RUN_ID ?? 'LOCAL';
export const PREFIX = `E2E-${RUN}`;

let seq = 0;
/** Unique, namespaced name: `E2E-<RUN> <label> <n>`. */
export function uniq(label: string): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${PREFIX} ${label} ${rand}${seq}`;
}
/** Unique code safe for both location and catalogue code rules (letters, digits, hyphen). */
export function uniqCode(label: string): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${PREFIX}-${label}-${rand}`.slice(0, 40);
}

/**
 * Authenticated test: skips the whole test when credentials are missing.
 * (Unauthenticated specs import `test` from @playwright/test directly.)
 */
export const test = base.extend<{ requireAdmin: void }>({
  requireAdmin: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their deps
    async ({}, use, testInfo) => {
      testInfo.skip(!adminCreds(), CREDS_MISSING);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** Call at the top of a describe block: skips every test AND hook in it without credentials. */
export function requireAdminCreds(): void {
  base.skip(!adminCreds(), CREDS_MISSING);
}

/** A signed-in page for beforeAll hooks (which cannot use the `page` fixture). */
export async function newAdminPage(browser: Browser): Promise<Page> {
  const baseURL = base.info().project.use.baseURL;
  const context = await browser.newContext({ storageState: ADMIN_STORAGE_STATE, ...(baseURL ? { baseURL } : {}), acceptDownloads: true });
  return context.newPage();
}

/** Navigate to an /admin path and wait until the portal shell has rendered (not the session spinner). */
export async function gotoAdmin(page: Page, path: string): Promise<void> {
  await page.goto(path.startsWith('/admin') ? path : `/admin${path}`);
  await expect(page.getByRole('navigation').or(page.getByRole('heading', { level: 1 })).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Restoring your session' })).toHaveCount(0, { timeout: 60_000 });
  // A redirect to sign-in here means the saved session is no longer valid.
  expect(page.url(), 'stored admin session was rejected; re-run the setup project').not.toMatch(/\/admin\/(login|mfa|denied)/);
}

export async function expectPageTitle(page: Page, title: string | RegExp): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** The open <dialog> with the given title. */
export function dialog(page: Page, title: string | RegExp): Locator {
  return page.getByRole('dialog', { name: title });
}

/** Choose an <option> by (partial) visible text. */
export async function selectByText(select: Locator, text: string | RegExp): Promise<void> {
  const option = select.locator('option').filter({ hasText: text }).first();
  await expect(option).toBeAttached();
  const value = await option.getAttribute('value');
  await select.selectOption(value ?? '');
}

/** Either the data table (by caption) or the empty state is visible: the list loaded without an error. */
export async function expectListLoaded(page: Page, caption: string, emptyTitles: string[]): Promise<void> {
  const table = page.getByRole('table', { name: caption });
  let anyOf: Locator = table;
  for (const t of emptyTitles) anyOf = anyOf.or(page.getByText(t, { exact: true }));
  await expect(anyOf.first()).toBeVisible();
  await expect(page.locator('.banner-error')).toHaveCount(0);
}

/** Today as YYYY-MM-DD in local time. */
export function isoDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Random Indian mobile number (10 digits starting 9), for test employees. */
export function randomPhone(): string {
  return `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
}
