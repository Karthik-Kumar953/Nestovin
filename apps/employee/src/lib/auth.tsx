import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { demoMode } from './env';
import { demoSession, demoState } from './demo';

interface AuthState {
  session: Session | null;
  ready: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, ready: false });

/** Employee ID + password session (EMP-02). Token refresh runs only in the foreground. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (demoMode) {
      // DEV-ONLY design review: a stand-in session (none for ?demo=signedout).
      setSession(demoState() === 'signedout' ? null : demoSession);
      setReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
    return () => {
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  return <AuthContext.Provider value={{ session, ready }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const STAFF_EMAIL_DOMAIN = 'staff.nestovin.invalid';

/**
 * Employee IDs look like NV-000123 (ADR-012). Workers may type "nv123",
 * "NV 000123" or just "123"; all become NV-000123.
 */
export function normalizeEmployeeId(input: string): string | null {
  const m = input.trim().toUpperCase().replace(/\s+/g, '').match(/^(?:NV-?)?(\d{1,6})$/);
  if (!m) return null;
  return `NV-${m[1]!.padStart(6, '0')}`;
}

/** Supabase Auth login email for an Employee ID (lower-cased by the API when the login is created). */
export const staffEmail = (employeeCode: string) => `${employeeCode.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;

export async function signInWithEmployeeId(employeeCode: string, password: string) {
  return supabase.auth.signInWithPassword({ email: staffEmail(employeeCode), password });
}

/** Password rule shown to workers (Supabase enforces its own minimum too). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number';
  return null;
}
