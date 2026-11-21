/**
 * Public configuration only (EXPO_PUBLIC_* is bundled into the app).
 * Never put secrets here: the API holds every secret key.
 * Dot access is required so Expo can inline the values at build time.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, ''),
};

/** DEV-ONLY: EXPO_PUBLIC_DEMO=1 serves fixtures (src/lib/demo.ts) for design review. Never on in a release build. */
export const demoMode = __DEV__ && process.env.EXPO_PUBLIC_DEMO === '1';

export const missingEnv = Object.entries(env)
  .filter(([, v]) => !v)
  .map(([k]) => k);
