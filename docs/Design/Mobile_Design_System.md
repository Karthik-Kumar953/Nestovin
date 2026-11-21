# Nestovin mobile design system (Resident and Worker apps)

Status: draft for review, 20 Nov 2026. Source of truth for tokens and copy stays `DESIGN.md`; this file only adds mobile platform rules. Light mode only.

Clickable preview of every Resident screen: https://claude.ai/artifact/CLKL7mn846ew6mVX4so8eE (each screen has Platform and Reduce Transparency tweaks).

## Tokens used on mobile
- Colours, type, radius and spacing exactly as `DESIGN.md`. Filled buttons use `teal-action #00796B` (white text 5.3:1). Brand teal `#00897B` is for the logo and accents only (white text 4.3:1 fails).
- Secondary text `#4B5563`. `#9CA3AF` is never used for text.
- Screen title Manrope 700 30/38 (iOS large title), 600 28/36 on Android. Body Inter 16/24. Essential payment, deadline and code text is never caption size.
- Mobile margin 20. Buttons at least 48 tall, inputs 52.
- Proposed mobile adjustment (not in `DESIGN.md`): button label 16/600 instead of 14/500, for legibility. Confirm or revert.

## Liquid Glass (iOS 26+) scope
Glass is used only where iOS itself uses it: navigation chrome and floating controls.
- Yes: tab bar (`expo-router/native-tabs`), header bar buttons, the floating "Show check-in code" action (`GlassView` from `expo-glass-effect`, `isInteractive`, teal tint).
- No: cards, lists, forms, sheets with codes or inputs, banners, anything holding body text.
- Fallback to solid white with a hairline border when `isLiquidGlassAvailable()` is false (iOS 18 and earlier) or `AccessibilityInfo.isReduceTransparencyEnabled()` is true.
- This narrows `DESIGN.md`'s "avoid glassmorphism" rule to system navigation chrome, per the owner's request for Liquid Glass on iOS.

## Platform split
| Element | iOS | Android |
|---|---|---|
| Tab bar | `NativeTabs`: system glass, `minimizeBehavior="onScrollDown"`, SF Symbols | `NativeTabs`: M3 bar, mint `indicatorColor`, labels always visible, Material icons |
| Header | Native stack, large title on tab roots, glass 44 pt buttons | Top app bar, title left, 48 dp icon buttons, no glass |
| Floating action | Full-width glass capsule above the tab bar | Extended FAB, right, 16 dp corners |
| Sheets | Form sheet with detents, solid surface | Modal bottom sheet, drag handle, solid surface |
| Back | Edge swipe, chevron | Predictive back, arrow |
| Controls | Segmented control, iOS switch, compact date picker | Outlined segmented buttons, M3 switch, date picker dialog |
| Buttons | 12 pt radius, highlight on press | Full pill, `android_ripple` |
| Haptics | Selection on choices; success on payment and check-in code | `CONFIRM` / `REJECT` on the same events |

Implementation: one component tree; platform differences live in `Platform.select` inside shared primitives (`ui.tsx`) and in `.ios.tsx` / `.android.tsx` files only for chrome (tab layout, floating action, sheet).

## Accessibility (WCAG 2.2 AA)
- Targets 44 × 44 pt / 48 × 48 dp, 8 px apart; hit slop when the visual is smaller.
- Dynamic Type / font scale up to 200%: `allowFontScaling` everywhere; rows switch to stacks above 1.3× (`useWindowDimensions().fontScale`); screens scroll, nothing truncates. Bold Text respected.
- VoiceOver / TalkBack: `accessibilityLabel` on icon buttons, `accessibilityRole` and `accessibilityState` on choices, switches, tabs; decorative icons hidden; OTP and check-in code read digit by digit.
- Live updates (payment result, code timer, new reply) use polite announcements without moving focus.
- Reduce Motion: crossfades instead of slides and springs (`AccessibilityInfo.isReduceMotionEnabled`).
- Status = colour + icon + text. Errors sit under the field and are announced.
- OTP autofill: `textContentType="oneTimeCode"` (iOS), `autoComplete="sms-otp"` (Android).

## Copy rules applied
Sentence case, no emoji, no invented plan names, prices, percentages or policies: those render from the catalogue and booking snapshot (shown as `[brackets]` in the preview). A demand request is never shown as a confirmed booking ("Joined · awaiting slot").

## Resident app gaps the design closes
- "Upload a new document" after rejection goes back to the proof step, not a full re-registration.
- New booking detail screen with timeline, amounts and agreed terms.
- Visit history by month, with a load-earlier action (no 30-day cap).
- Each update links to its screen (deep links from push and inbox).
- "Booking not open" states: community not live, no open round, offline.
- Native date picker for move-out instead of typed dates.
