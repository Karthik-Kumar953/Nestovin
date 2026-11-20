'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { NavLink } from '../lib/router';
import type { Action, ModuleKey } from '@nestovin/contracts';
import { useAuth, useMe } from '../auth/AuthProvider';
import { can } from '../lib/permissions';
import { Button } from './ui';

interface NavItem {
  to: string;
  label: string;
  module: ModuleKey;
  action?: Action;
  superAdminOnly?: boolean;
}

/*
 * Navigation shows ONLY modules that are built AND granted to this admin.
 * Modules not yet built are not shown at all (PRD: no placeholder screens).
 * Hiding a link is UX only; the API enforces every permission.
 */
const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Home', module: 'overview' }] },
  {
    title: 'Locations',
    items: [
      { to: '/locations/communities', label: 'Communities', module: 'locations' },
      { to: '/locations/clusters', label: 'Clusters', module: 'locations' },
      { to: '/locations/cities', label: 'Cities', module: 'locations' },
      { to: '/locations/expansion-votes', label: 'Expansion votes', module: 'locations', superAdminOnly: true },
    ],
  },
  {
    title: 'Residents',
    items: [
      { to: '/residents', label: 'Residents', module: 'residents' },
      { to: '/residents/verifications', label: 'Residence verification', module: 'residents' },
      { to: '/residents/family-requests', label: 'Family requests', module: 'family_requests' },
    ],
  },
  {
    title: 'Demand & bookings',
    items: [
      { to: '/demand/cycles', label: 'Demand cycles', module: 'demand_payments' },
      { to: '/demand/bookings', label: 'Bookings', module: 'demand_payments' },
      { to: '/demand/payments', label: 'Payments', module: 'demand_payments' },
      { to: '/scheduling/slots', label: 'Slots', module: 'scheduling' },
    ],
  },
  {
    title: 'Support',
    items: [
      { to: '/support/tickets', label: 'Tickets', module: 'support' },
      { to: '/support/enquiries', label: 'Website enquiries', module: 'support' },
    ],
  },
  {
    title: 'Access control',
    items: [
      { to: '/access/admins', label: 'Admin users', module: 'admin_access' },
      { to: '/access/roles', label: 'Roles', module: 'admin_access' },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const me = useMe();
  const { signOut } = useAuth();

  const sections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => (i.superAdminOnly ? me.isSuperAdmin : i.to === '/' || can(me, i.module, i.action))),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <Image src="/nestovin-logo.png" alt="" className="sidebar-logo" width={36} height={32} />
          <span>Nestovin Admin</span>
        </div>
        <nav>
          {sections.map((s) => (
            <div key={s.title} className="nav-section">
              <p className="nav-section-title">{s.title}</p>
              <ul>
                {s.items.map((i) => (
                  <li key={i.to}>
                    <NavLink to={i.to} end={i.to === '/' || i.to === '/residents'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                      {i.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="sidebar-user">
          <p className="sidebar-user-name">{me.fullName}</p>
          <p className="sidebar-user-meta">
            {me.isSuperAdmin ? 'Super Admin' : me.scope.type === 'GLOBAL' ? 'All clusters' : `${me.scope.clusterIds.length} cluster(s)`}
          </p>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main" className="content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
