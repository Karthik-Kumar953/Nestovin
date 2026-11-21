import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared helpers for the Resident app demo-mode specs (Expo web, EXPO_PUBLIC_DEMO=1).
 *
 * Demo mode serves fixtures from apps/resident/src/lib/demo.ts (no API, no sign-in):
 * the resident is "Ananya Rao", Primary resident of Green Meadows · Tower B · Flat 1204.
 * `?demo=new` and `?demo=pending` switch the resident to "not registered" / "under review",
 * but only while that query string is in the URL (demo.ts reads location.search per call).
 *
 * Selectors follow the real source (packages/ui-native + apps/resident/src):
 *  - Text variants display/title/h2/h3 get accessibilityRole="header"  -> role=heading
 *  - Button / Card(onPress) / PressScale(role=button)                  -> role=button, name = accessibilityLabel
 *  - ChoiceTile                                                        -> role=radio|checkbox, name = "title, description[, choice n]"
 *  - Field (TextInput accessibilityLabel={label})                      -> getByLabel(label)
 *  - Field error / Banner tone=error                                   -> role=alert
 *  - SegmentedControl / filter chips / native tab bar                  -> role=tablist + role=tab
 *
 * Screen (ui-native) renders the compact title bar (opacity 0 until scroll) with a second copy of
 * "Back" and the header actions. That invisible bar sits on top of the header, so a pointer tap on
 * "Back" lands on the compact-bar copy (same action): back() clicks the topmost (last) copy.
 *
 * The web tab bar used to float over the top of tab screens (BUG-QA-020, fixed in 30ce489).
 */

export const RESIDENT = { name: 'Ananya Rao', first: 'Ananya', community: 'Green Meadows', tower: 'Tower B', flat: '1204' };

/** Product copy: @nestovin/contracts NON_REFUNDABLE_DISCLOSURE.text (shown before joining a booking round). */
export const NON_REFUNDABLE =
  'The initial payment is a commitment to this demand cycle. If the remaining balance is not paid by the published deadline, ' +
  'the commitment expires and the initial payment is not refunded.';

/** A rupee amount as the app formats it (en-IN grouping, optional paise). */
export const RUPEES = /₹\d{1,3}(,\d{2,3})*(\.\d{2})?/;

type Fixtures = { pageErrors: string[] };

/**
 * `test` with an automatic page-error collector: every uncaught exception on the page fails the test
 * (asserted after the test body, so a screen that throws while rendering is reported even if the
 * visible assertions passed).
 */
export const test = base.extend<Fixtures>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
      await use(errors);
      expect(errors, 'Uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens a route of the demo app. Paths are relative to baseURL (e.g. 'book', '?demo=new'). */
export async function open(page: Page, path = '') {
  await page.goto(`/${path.replace(/^\//, '')}`);
}

/** A tab whose accessible name ends with `label` (tab names start with an icon-font glyph on web: BUG-QA-025). */
export const tabName = (label: string) => new RegExp(String.raw`(^|\s)` + label + '$');

/** The main tab bar: the tablist holding the Profile tab (it has no name on web since 30ce489: BUG-QA-025). */
export const tabBar = (page: Page) => page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: tabName('Profile') }) });

export async function openTab(page: Page, name: 'Home' | 'Book' | 'Visits' | 'Support' | 'Profile') {
  const tab = tabBar(page).getByRole('tab', { name: tabName(name) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Screen title (large title, role=heading). */
export const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { name, exact: typeof name === 'string' }).first();

/** The "Back" button of a pushed screen (the topmost copy, which is the one a tap reaches). */
export const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true }).last();

/** Home in the default (active, verified) state has finished loading. */
export async function waitForActiveHome(page: Page) {
  await expect(page.getByRole('heading', { name: new RegExp(`^Good (morning|afternoon|evening), ${RESIDENT.first}$`) })).toBeVisible();
}
