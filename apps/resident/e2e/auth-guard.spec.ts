import { expect, test } from '@playwright/test';

/*
 * Signed-in area guard (src/app/(app)/_layout.tsx): with no session, every
 * route under (app) redirects to /sign-in. No credentials or network needed.
 */

const protectedRoutes = ['/', '/book', '/visits', '/support', '/profile', '/register', '/vote', '/bookings', '/household', '/notifications'];

for (const path of protectedRoutes) {
  test(`redirects ${path} to /sign-in when signed out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Sign in or create an account' })).toBeVisible();
  });
}

test('the web build loads without uncaught errors on /sign-in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
