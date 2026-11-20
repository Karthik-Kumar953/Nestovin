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

export const missingEnv = Object.entries(env)
  .filter(([, v]) => !v)
  .map(([k]) => k);
