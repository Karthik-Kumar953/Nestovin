# @nestovin/ui-native

Shared React Native building blocks for the Resident and Worker apps. Styling uses NativeWind 4 classes from the Nestovin Tailwind preset; motion uses Reanimated 4 and honours Reduce Motion. Owned by the resident-app session. The Worker app uses it read-only and asks for changes through the lead.

## What is inside
| Area | Exports |
|---|---|
| Tokens | `colors`, `fonts`, `gradients`, `motion`, `elevation`, `radius`, `spacing` |
| Type and icons | `Text` (variants `display`, `title`, `h2`, `h3`, `lead`, `body`, `bodyStrong`, `label`, `sm`, `caption`, `overline`, `metric`), `Icon` (Ionicons outline) |
| Actions | `Button` (primary, secondary, tertiary, destructive, inverse, soft; loading, disabled, pressed; haptics), `IconButton` (44 pt, badge) |
| Surfaces | `Card`, `IconTile`, `ListRow`, `Divider`, `SectionHeader`, `StatusChip` (colour + icon + text), `Banner` |
| Forms | `Field` (persistent label, helper, error), `OtpInput` (SMS autofill), `ChoiceTile` (radio, checkbox, ranked), `SegmentedControl` |
| Containers | `Screen` (large title that collapses into a glass bar, refresh, sticky footer), `Sheet`, `EmptyState`, `Illustration`, `Skeleton`, `SkeletonCard`, `SkeletonList` |
| Media | `Photo` (designed brand-gradient fallback when an image is missing), `Avatar` (initials fallback) |
| Platform | `GlassSurface` (Liquid Glass on iOS 26, solid fallback otherwise or under Reduce Transparency), `useLiquidGlass`, `useReduceTransparency`, `haptics` |
| Motion | `Entrance` (stagger), `PressScale`, `SuccessCheck`, `Shimmer`, `useReducedMotion` |

Glass is only for navigation chrome and floating controls (`Mobile_Design_System.md`), never cards, lists or text.

## Rules that will bite you
- **`className` only on core React Native components.** NativeWind 4 (react-native-css-interop) styles only the core components it registers: `View`, `Text`, `Pressable`, `ScrollView`, `TextInput`, `Image`, `KeyboardAvoidingView` and so on.
  - Never put `className` on `Animated.*` (Reanimated), `GlassView` (expo-glass-effect), expo-image `Image` or `LinearGradient`: it is silently dropped at runtime, and tsc, lint and the bundle all still pass.
  - Give those components `style` only, and put the classes on a core `View` or `Pressable` inside or around them. `PressScale` and `Entrance` follow this pattern.
- **Tokens come from one place.** DESIGN.md values come from `@nestovin/design-tokens/tokens.json`; mobile-only additions live in `src/extensions.json`. Never hard-code a colour, radius or font name in a component; use the classes or `colors` / `fonts` from this package.
- **Animate only `transform` and `opacity`** (no width, height, top or margin), and check `useReducedMotion()`. All motion primitives here already do.

## Using it in an app (Worker app checklist)
The package declares no React Native dependencies on purpose. Under pnpm, its own copies would resolve with different peers and `expo-doctor` reports duplicate native modules. The host app provides them instead (listed in `package.json` → `nestovin.hostProvides`).

1. `package.json`: `"@nestovin/ui-native": "workspace:*"`, and install everything in `hostProvides` with `npx expo install`, plus `react-native-css-interop@0.2.7` (NativeWind's JSX runtime; pnpm does not hoist it).
2. `babel.config.js`, `metro.config.js`, `global.css`, `nativewind-env.d.ts`: copy from `apps/resident`.
3. `tailwind.config.js`: `presets: [require('nativewind/preset'), require('../../packages/ui-native/tailwind-preset.js')]`, and add `'../../packages/ui-native/src/**/*.{ts,tsx}'` to `content`.
4. `tsconfig.json`: copy the `compilerOptions.paths` block from `apps/resident/tsconfig.json`, so TypeScript resolves this package's imports through the app.
5. `app.json`: set `expo.experiments.tsconfigPaths` to `false`, so Metro ignores those type-only paths. Metro already resolves through the app's `node_modules`.
6. Load the fonts in the root layout: Manrope 600/700/800 and Inter 400/500/600/700 from `@expo-google-fonts/*`, as in `apps/resident/src/app/_layout.tsx`.

Type-check: `pnpm --filter @nestovin/ui-native typecheck` (runs through the Resident app's tsconfig).
