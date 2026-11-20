'use client';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's newer "publishable" key (sb_publishable_...) replaces the legacy anon key.
// Both are public by design. The legacy name is accepted as a fallback.
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the portal has been configured (see apps/web/.env.example). */
export const supabaseConfigured = Boolean(url && anonKey);

/**
 * Supabase is used ONLY for identity: sign-in, invite acceptance, password reset
 * and TOTP MFA. All business data goes through the Nestovin API, which
 * authorises every request. (The anon key is public by design.)
 */
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Picks up the session from invite / password-reset links.
    detectSessionInUrl: true,
    storageKey: 'nestovin-admin-auth',
  },
});
