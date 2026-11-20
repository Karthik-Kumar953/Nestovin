'use client';

import { useQuery } from '@tanstack/react-query';
import { Link } from '../lib/router';
import { api } from '../lib/api';
import { MODULES } from '@nestovin/contracts';
import { useMe } from '../auth/AuthProvider';
import { can } from '../lib/permissions';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui';

interface OverviewItem {
  key: string;
  label: string;
  count: number;
  to: string;
}

/**
 * ADM-01: pending work for this admin, filtered on the server by module grants
 * and cluster scope (never global numbers for a cluster-scoped admin), plus
 * shortcuts to the modules they may use.
 */
export function HomePage() {
  const me = useMe();
  const overview = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<{ items: OverviewItem[] }>('/v1/admin/overview'),
    enabled: me.hasAnyAccess,
  });
  const pending = (overview.data?.items ?? []).filter((i) => i.count > 0);
  const shortcuts = [
    {
      to: '/locations/communities',
      label: 'Communities',
      desc: 'Communities, towers and flats',
      ok: can(me, 'locations'),
    },
    {
      to: '/locations/clusters',
      label: 'Clusters',
      desc: 'Operational groupings of communities',
      ok: can(me, 'locations'),
    },
    {
      to: '/access/admins',
      label: 'Admin users',
      desc: 'Invite admins, assign roles and cluster scope',
      ok: can(me, 'admin_access'),
    },
    {
      to: '/access/roles',
      label: 'Roles',
      desc: 'Reusable sets of module permissions',
      ok: can(me, 'admin_access'),
    },
  ].filter((s) => s.ok);

  const grantedModules = me.isSuperAdmin
    ? 'all modules'
    : [...new Set(me.grants.map((g) => g.module))]
        .map((m) => MODULES[m as keyof typeof MODULES]?.label ?? m)
        .join(', ');

  return (
    <>
      <PageHeader
        title={`Welcome, ${me.fullName.split(' ')[0]}`}
        description={
          me.isSuperAdmin
            ? 'You are the Super Admin: full access to every module and all clusters.'
            : `Access: ${grantedModules || 'none yet'}. Scope: ${me.scope.type === 'GLOBAL' ? 'all clusters' : `${me.scope.clusterIds.length} assigned cluster(s)`}.`
        }
      />
      {!me.hasAnyAccess ? (
        <EmptyState title="No modules have been assigned to you yet">
          Your account is active, but the Super Admin has not granted you any modules. Contact them
          to request access.
        </EmptyState>
      ) : (
        <>
          <h2 className="section-title">Needs your attention</h2>
          {overview.isLoading ? <Spinner /> : null}
          <ErrorBanner error={overview.error} />
          {overview.data && pending.length === 0 ? (
            <p className="muted">Nothing is waiting for you right now.</p>
          ) : null}
          {pending.length ? (
            <div className="card-grid">
              {pending.map((i) => (
                <Link key={i.key} to={i.to} className="card card-link">
                  <p className="card-title">{i.count}</p>
                  <p className="card-desc">{i.label}</p>
                </Link>
              ))}
            </div>
          ) : null}
          <h2 className="section-title">Shortcuts</h2>
          <div className="card-grid">
            {shortcuts.map((s) => (
              <Link key={s.to} to={s.to} className="card card-link">
                <h2 className="card-title">{s.label}</h2>
                <p className="card-desc">{s.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function NoAccessPage() {
  return (
    <EmptyState title="You don’t have access to this page">
      Ask your Super Admin if you need this module. <Link to="/">Go to Home</Link>
    </EmptyState>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState title="Page not found">
      <Link to="/">Go to Home</Link>
    </EmptyState>
  );
}
