'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Me } from '@nestovin/contracts';
import { supabase } from '../lib/supabase';
import { api, ApiError } from '../lib/api';

/**
 * Session states:
 *  loading   - restoring the session
 *  signedOut - no session
 *  needsMfa  - password accepted, TOTP enrolment or challenge still required (aal1)
 *  denied    - signed in, but the API does not recognise an active admin profile
 *  ready     - aal2 session and an active admin profile (`me` is set)
 */
type Status = 'loading' | 'signedOut' | 'needsMfa' | 'denied' | 'ready';

interface AuthState {
  status: Status;
  session: Session | null;
  me: Me | null;
  deniedReason: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);

  const evaluate = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setMe(null);
      setStatus('signedOut');
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== 'aal2') {
      setMe(null);
      setStatus('needsMfa');
      return;
    }
    try {
      setMe(await api<Me>('/v1/admin/me'));
      setDeniedReason(null);
      setStatus('ready');
    } catch (err) {
      setMe(null);
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
        setStatus('needsMfa');
      } else if (err instanceof ApiError && err.status === 401) {
        setDeniedReason(err.message);
        setStatus('denied');
      } else {
        setDeniedReason(err instanceof Error ? err.message : 'Could not load your account');
        setStatus('denied');
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void evaluate(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Token refreshes do not change who the user is; avoid refetching /me on every refresh.
      if (event === 'TOKEN_REFRESHED') {
        setSession(s);
        return;
      }
      // Defer: calling Supabase from inside the callback can deadlock its auth lock.
      setTimeout(() => active && void evaluate(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [evaluate]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      session,
      me,
      deniedReason,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        await evaluate(data.session);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [status, session, me, deniedReason, evaluate],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For pages that only render once the admin is fully signed in. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe used outside a ready session');
  return me;
}
