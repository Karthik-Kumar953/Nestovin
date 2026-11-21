import { useState } from 'react';
import { haptics } from '@nestovin/ui-native';
import { ApiError, api } from './api';
import { demoLoginEnabled, demoMode } from './env';
import { supabase } from './supabase';

/**
 * TEMPORARY (client showcases): signs in the seeded demo resident with no phone or code.
 * The API returns a one-time magic-link token hash; verifying it gives a real Supabase session,
 * and routing then follows the session exactly like a normal sign-in (home, or onboarding if not registered).
 */
export function useDemoLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (!demoLoginEnabled || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ tokenHash: string; type: 'magiclink' }>('/v1/public/demo-login', {
        method: 'POST',
      });
      if (!demoMode) {
        const { error: e } = await supabase.auth.verifyOtp({
          token_hash: r.tokenHash,
          type: 'magiclink',
        });
        if (e) throw e;
      }
      haptics.success();
    } catch (e) {
      haptics.error();
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Demo login is switched off on the server. Sign in with your mobile number instead.'
          : e instanceof ApiError && e.status === 409
            ? 'The demo resident is not set up yet. Ask the Nestovin team to seed it, then try again.'
            : e instanceof ApiError && e.code === 'NETWORK'
              ? e.message
              : 'Demo login did not work. Try again, or sign in with your mobile number.',
      );
    } finally {
      setBusy(false);
    }
  };

  return { enabled: demoLoginEnabled, busy, error, signIn };
}
