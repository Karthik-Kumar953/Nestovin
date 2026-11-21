import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { demoMode } from './env';
import { demoSession } from './demo';
import { unregisterPush } from './push';

interface AuthState {
  session: Session | null;
  ready: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  ready: false,
  signOut: async () => undefined,
});

/** Phone-OTP session (RES-01). Token refresh runs only while the app is in the foreground. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (demoMode) {
      setSession(demoSession);
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Drop the previous resident's cached household, bookings and inbox when the session ends.
      if (event === 'SIGNED_OUT') qc.clear();
      setSession(s);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, [qc]);

  return (
    <AuthContext.Provider
      value={{
        session,
        ready,
        signOut: async () => {
          // Remove this device's push token first, or the next person on this phone gets our updates.
          await unregisterPush();
          await supabase.auth.signOut();
          qc.clear();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => use(AuthContext);

/** Indian mobile numbers: accept 10 digits, +91…, or 91… and return E.164. */
export function toE164(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  const d = digits.replace(/^\+/, '');
  if (/^[6-9]\d{9}$/.test(d)) return `+91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return `+${d}`;
  return null;
}
