'use client';

import { Suspense, useState, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Action, ModuleKey } from '@nestovin/contracts';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ApiError } from './lib/api';
import { can } from './lib/permissions';
import { Navigate } from './lib/router';
import { Spinner } from './components/ui';
import { NoAccessPage } from './pages/HomePage';

const subscribeNoop = () => () => {};

/**
 * Client-side providers for the whole /admin area.
 * The admin is rendered on the client only: its state (session, MFA level,
 * permissions) lives in the browser and the API, so server-rendering it adds
 * nothing and would cause hydration mismatches. The server sends a spinner.
 */
export function AdminRoot({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Do not retry permission/validation errors; retry transient ones once.
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
          },
        },
      }),
  );
  if (!mounted) return <Spinner />;
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Portal pages render only for a fully signed-in admin (aal2 + active profile). */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <Spinner label="Restoring your session" />;
  if (status === 'signedOut') return <Navigate to="/login" />;
  if (status === 'needsMfa') return <Navigate to="/mfa" />;
  if (status === 'denied') return <Navigate to="/denied" />;
  return <>{children}</>;
}

/** UX gate: renders if the admin can view ANY of the given modules (each step re-checks). */
export function RequireAnyPermission({ modules, children }: { modules: ModuleKey[]; children: ReactNode }) {
  const { me } = useAuth();
  return modules.some((m) => can(me, m, 'view')) ? <>{children}</> : <NoAccessPage />;
}

/** UX gate only; the API enforces the same rule on every request. */
export function RequirePermission({ module, action = 'view', children }: { module: ModuleKey; action?: Action; children: ReactNode }) {
  const { me } = useAuth();
  return can(me, module, action) ? <>{children}</> : <NoAccessPage />;
}
