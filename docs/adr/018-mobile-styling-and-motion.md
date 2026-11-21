# ADR-018: Mobile styling and motion (Resident and Worker apps)

**Status:** Accepted (lead, 21 Nov 2026). Owner asked for NativeWind and modern tooling; versions verified by the Resident app session.

## Decision
- **Styling: NativeWind 4.2.7 + Tailwind CSS 3.4.19 + react-native-css-interop 0.2.7** in both Expo apps (SDK 58, RN 0.88).
  - 4.2.7 is the current stable release; NativeWind 5 is still a release candidate (5.0.0-rc.1) and needs Tailwind 4, so we wait for its stable release before moving.
- **One shared theme:** `packages/ui-native/tailwind-preset.js` is built from `@nestovin/design-tokens` (the `DESIGN.md` values). Both apps use it, so colours, type, radius and spacing can't drift.
- **Motion:** Reanimated 4.7.1 with react-native-worklets 0.13.0 (the SDK 58 bundled versions). NativeWind's Babel preset forwards to the Worklets plugin, so no extra Babel config is needed. Moti and Lottie are used only where they add clear value.
  - Every animation honours Reduce Motion.
  - Framer Motion and GSAP are web-only; they are for the admin and the website.
- **Platform chrome:** `expo-router/native-tabs` for tabs. `expo-glass-effect` (Liquid Glass) only on iOS 26 navigation and floating controls, with a solid fallback when Liquid Glass is unavailable or Reduce Transparency is on. Material 3 surfaces on Android (see `docs/Design/Mobile_Design_System.md`).

## Consequences
- Upgrading to NativeWind 5 later means moving to Tailwind 4 and the new CSS-first config. The token preset is the only place the theme lives, so the move is contained.
- Building blocks live in `packages/ui-native` (owned by the Resident app session). The Worker app uses them and requests changes through the lead.
