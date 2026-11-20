'use client';

import { useEffect, useMemo, type AnchorHTMLAttributes, type ReactNode } from 'react';
import NextLink from 'next/link';
import {
  useParams as useNextParams,
  usePathname,
  useRouter,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';

/**
 * Thin routing helpers for the admin area. Screens use admin-relative paths
 * ("/access/admins"); these helpers prefix them with the /admin mount point.
 */
export const ADMIN_BASE = '/admin';

export function adminPath(to: string): string {
  if (to.startsWith(ADMIN_BASE + '/') || to === ADMIN_BASE) return to;
  return to === '/' ? ADMIN_BASE : `${ADMIN_BASE}${to.startsWith('/') ? to : `/${to}`}`;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; children: ReactNode };

export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <NextLink href={adminPath(to)} {...rest}>
      {children}
    </NextLink>
  );
}

/** Link with an active state, for the sidebar. `end` = exact match only. */
export function NavLink({
  to,
  end,
  className,
  children,
}: {
  to: string;
  end?: boolean;
  className: (state: { isActive: boolean }) => string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const href = adminPath(to);
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <NextLink href={href} className={className({ isActive })} aria-current={isActive ? 'page' : undefined}>
      {children}
    </NextLink>
  );
}

/** Client-side redirect (renders nothing). */
export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(adminPath(to));
    else router.push(adminPath(to));
  }, [router, to, replace]);
  return null;
}

export function useNavigate() {
  const router = useRouter();
  return (to: string, opts?: { replace?: boolean }) =>
    opts?.replace ? router.replace(adminPath(to)) : router.push(adminPath(to));
}

export function useParams(): Record<string, string | undefined> {
  const params = useNextParams();
  return useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params ?? {})) out[k] = Array.isArray(v) ? v[0] : v;
    return out;
  }, [params]);
}

/** [params, setParams] like react-router; setParams replaces the URL query. */
export function useSearchParams(): [URLSearchParams, (next: URLSearchParams, opts?: { replace?: boolean }) => void] {
  const router = useRouter();
  const pathname = usePathname() ?? ADMIN_BASE;
  const sp = useNextSearchParams();
  const params = useMemo(() => new URLSearchParams(sp?.toString() ?? ''), [sp]);
  const set = (next: URLSearchParams, opts?: { replace?: boolean }) => {
    const q = next.toString();
    const url = q ? `${pathname}?${q}` : pathname;
    if (opts?.replace === false) router.push(url);
    else router.replace(url);
  };
  return [params, set];
}
