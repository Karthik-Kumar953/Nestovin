'use client';

import { Link } from '../lib/router';
import { MODULES } from '@nestovin/contracts';
import { useMe } from '../auth/AuthProvider';
import { can } from '../lib/permissions';
import { EmptyState, PageHeader } from '../components/ui';

/**
 * ADM-01 (minimal for Milestone 1): welcome, scope, and shortcuts to the modules
 * this admin may use. Operational counts and pending actions are added as each
 * module ships, always filtered by permission and cluster scope on the server.
 */
export function HomePage() {
  const me = useMe();
  const shortcuts = [
    { to: '/locations/communities', label: 'Communities', desc: 'Communities, towers and flats', ok: can(me, 'locations') },
    { to: '/locations/clusters', label: 'Clusters', desc: 'Operational groupings of communities', ok: can(me, 'locations') },
    { to: '/access/admins', label: 'Admin users', desc: 'Invite admins, assign roles and cluster scope', ok: can(me, 'admin_access') },
    { to: '/access/roles', label: 'Roles', desc: 'Reusable sets of module permissions', ok: can(me, 'admin_access') },
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
          Your account is active, but the Super Admin has not granted you any modules. Contact them to request access.
        </EmptyState>
      ) : (
        <div className="card-grid">
          {shortcuts.map((s) => (
            <Link key={s.to} to={s.to} className="card card-link">
              <h2 className="card-title">{s.label}</h2>
              <p className="card-desc">{s.desc}</p>
            </Link>
          ))}
        </div>
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
