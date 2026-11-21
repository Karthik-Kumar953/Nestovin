'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { Action, AdminDashboard, ModuleKey } from '@nestovin/contracts';
import { adminPath, Link, NavLink, useNavigate } from '../lib/router';
import { api } from '../lib/api';
import { useAuth, useMe } from '../auth/AuthProvider';
import { can } from '../lib/permissions';
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Command,
  House,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from './icons';

interface NavItem {
  to: string;
  label: string;
  module: ModuleKey;
  action?: Action;
  superAdminOnly?: boolean;
  /** Exact match for the active state. */
  end?: boolean;
  keywords?: string;
}
interface NavGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

/*
 * Navigation shows ONLY modules that are built AND granted to this admin.
 * Hiding a link is UX only; the API enforces every permission and scope.
 * Groups collapse; the group holding the current page opens itself.
 */
export const NAV: NavGroup[] = [
  {
    id: 'communities',
    title: 'Communities',
    icon: Building2,
    items: [
      { to: '/locations/clusters', label: 'Clusters', module: 'locations', keywords: 'group assign' },
      { to: '/locations/communities', label: 'Communities', module: 'locations', keywords: 'towers flats gated' },
      { to: '/locations/migration', label: 'Community migration', module: 'locations', keywords: 'excel import upload xlsx' },
      { to: '/locations/catalogue', label: 'Catalogue & pricing', module: 'locations', keywords: 'plans prices matrix publish' },
      { to: '/locations/cities', label: 'Cities', module: 'locations' },
      { to: '/locations/expansion-votes', label: 'Expansion votes', module: 'locations', superAdminOnly: true },
    ],
  },
  {
    id: 'residents',
    title: 'Residents',
    icon: UsersRound,
    items: [
      { to: '/residents', label: 'Residents', module: 'residents', end: true },
      { to: '/residents/verifications', label: 'Verifications', module: 'residents', keywords: 'residence documents' },
      { to: '/residents/family-requests', label: 'Family requests', module: 'family_requests' },
      { to: '/residents/change-requests', label: 'Change requests', module: 'residents' },
    ],
  },
  {
    id: 'demand',
    title: 'Demand & bookings',
    icon: ClipboardList,
    items: [
      { to: '/demand/cycles', label: 'Demand cycles', module: 'demand_payments' },
      { to: '/demand/bookings', label: 'Bookings', module: 'demand_payments', keywords: 'subscriptions' },
      { to: '/demand/payments', label: 'Payments', module: 'demand_payments', keywords: 'razorpay refund exceptions' },
      { to: '/scheduling/slots', label: 'Slots', module: 'scheduling', keywords: 'continuous capacity' },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    icon: CalendarClock,
    items: [
      { to: '/allocation', label: 'Allocation', module: 'allocation', end: true, keywords: 'standing assign worker' },
      { to: '/allocation/visits', label: 'Visits', module: 'allocation', keywords: 'replace cover' },
      { to: '/allocation/overtime', label: 'Overtime offers', module: 'allocation' },
      { to: '/attendance', label: 'Attendance', module: 'attendance', end: true, keywords: 'check in otp gps' },
      { to: '/attendance/corrections', label: 'Corrections', module: 'attendance' },
      { to: '/attendance/feedback', label: 'Feedback', module: 'attendance', keywords: 'ratings comments' },
    ],
  },
  {
    id: 'workforce',
    title: 'Workforce',
    icon: Users,
    items: [
      { to: '/workforce/employees', label: 'Employees', module: 'employees', keywords: 'workers readiness' },
      { to: '/workforce/applicants', label: 'Applicants', module: 'employees' },
      { to: '/workforce/leave', label: 'Leave requests', module: 'employees' },
      { to: '/workforce/settings', label: 'HR settings', module: 'employees', keywords: 'training links' },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    icon: LifeBuoy,
    items: [
      { to: '/support/tickets', label: 'Tickets', module: 'support', keywords: 'escalation complaints' },
      { to: '/support/enquiries', label: 'Website enquiries', module: 'support' },
      { to: '/support/holidays', label: 'Holiday calendar', module: 'support' },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    icon: Banknote,
    items: [
      { to: '/finance', label: 'Revenue', module: 'finance_payroll', end: true },
      { to: '/finance/payroll', label: 'Payroll', module: 'finance_payroll', keywords: 'salary payslip' },
    ],
  },
  {
    id: 'access',
    title: 'Access control',
    icon: ShieldCheck,
    items: [
      { to: '/access/admins', label: 'Admin users', module: 'admin_access', keywords: 'invite cluster scope' },
      { to: '/access/roles', label: 'Roles', module: 'admin_access', keywords: 'permissions grants' },
      { to: '/access/audit', label: 'Audit log', module: 'admin_access', superAdminOnly: true },
      { to: '/access/notifications', label: 'Notification delivery', module: 'admin_access', superAdminOnly: true },
    ],
  },
];

/** Queue counts keyed by portal route, shared by the sidebar and the home page. */
export function useQueueCounts() {
  const me = useMe();
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<AdminDashboard>('/v1/admin/overview/dashboard'),
    enabled: can(me, 'overview'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const fallback = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<{ items: { key: string; count: number; to: string }[] }>('/v1/admin/overview'),
    enabled: !can(me, 'overview') && me.hasAnyAccess,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const counts = new Map<string, number>();
    const alerts = new Set<string>();
    const items = dash.data?.sections.queues?.data?.items ?? fallback.data?.items ?? [];
    for (const q of items) {
      const key = 'key' in q ? q.key : '';
      if (key === 'tickets_overdue' || key === 'tickets_escalated') {
        if ((q.count ?? 0) > 0) alerts.add('/support/tickets');
        continue;
      }
      const to = key === 'import_batches' ? '/locations/migration' : q.to;
      counts.set(to, (counts.get(to) ?? 0) + (q.count ?? 0));
    }
    return { counts, alerts, dashboard: dash };
  }, [dash, fallback.data]);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const OPEN_KEY = 'nv.admin.nav.open';

export function Layout({ children }: { children: ReactNode }) {
  const me = useMe();
  const { signOut } = useAuth();
  const pathname = usePathname() ?? '';
  const { counts, alerts } = useQueueCounts();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const groups = useMemo(
    () =>
      NAV.map((g) => ({
        ...g,
        items: g.items.filter((i) => (i.superAdminOnly ? me.isSuperAdmin : can(me, i.module, i.action))),
      })).filter((g) => g.items.length > 0),
    [me],
  );

  const isActive = (i: NavItem) => {
    const href = adminPath(i.to);
    return i.end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };
  const activeGroup = groups.find((g) => g.items.some(isActive))?.id;

  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
      setOpen(saved);
    } catch {
      /* storage unavailable: start collapsed */
    }
  }, []);
  const toggle = (id: string) =>
    setOpen((o) => {
      const next = { ...o, [id]: !(o[id] ?? id === activeGroup) };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  // Close the phone drawer on navigation.
  useEffect(() => setNavOpen(false), [pathname]);

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title }))).find(isActive);
  const scopeLabel = me.isSuperAdmin || me.scope.type === 'GLOBAL' ? 'All clusters' : `${me.scope.clusterIds.length} cluster${me.scope.clusterIds.length === 1 ? '' : 's'}`;

  return (
    <div className="app" data-nav-open={navOpen}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar-head">
          <Link to="/" className="sidebar-brand">
            <Image src="/nestovin-logo.png" alt="" className="sidebar-logo" width={30} height={30} />
            <span>
              <span className="sidebar-brand-name">Nestovin</span>
              <span className="sidebar-brand-sub">Admin portal</span>
            </span>
          </Link>
          <button type="button" className="sidebar-search" onClick={() => setPaletteOpen(true)}>
            <Search size={15} />
            Search or jump to
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive: a }) => `nav-link single ${a ? 'active' : ''}`}>
            <House size={17} />
            Home
          </NavLink>
          {groups.map((g) => {
            const isOpen = open[g.id] ?? g.id === activeGroup;
            const total = g.items.reduce((n, i) => n + (counts.get(i.to) ?? 0), 0);
            const hasAlert = g.items.some((i) => alerts.has(i.to));
            const listId = `nav-${g.id}`;
            return (
              <div key={g.id} className="nav-group" data-open={isOpen} data-active={g.id === activeGroup}>
                <button type="button" className="nav-group-toggle" aria-expanded={isOpen} aria-controls={listId} onClick={() => toggle(g.id)}>
                  <g.icon size={17} />
                  {g.title}
                  {!isOpen && total > 0 ? (
                    <span className={`count nav-group-count ${hasAlert ? 'alert' : ''}`} aria-label={`${total} waiting`}>
                      {total}
                    </span>
                  ) : null}
                  <ChevronDown size={15} className="chev" />
                </button>
                <div className="nav-group-items" id={listId}>
                  <ul inert={!isOpen}>
                    {g.items.map((i) => {
                      const c = counts.get(i.to) ?? 0;
                      return (
                        <li key={i.to}>
                          <NavLink to={i.to} end={i.end} className={({ isActive: a }) => `nav-link ${a ? 'active' : ''}`}>
                            {i.label}
                            {c > 0 ? (
                              <span className={`count ${alerts.has(i.to) ? 'alert' : ''}`} aria-label={`${c} waiting`}>
                                {c}
                              </span>
                            ) : null}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden>
            {initials(me.fullName)}
          </span>
          <div className="sidebar-user-text">
            <p className="sidebar-user-name">{me.fullName}</p>
            <p className="sidebar-user-meta">{me.isSuperAdmin ? 'Super Admin' : scopeLabel}</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />
      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar-menu" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div className="topbar-crumbs">
            {current ? (
              <>
                <span className="nowrap">{current.group}</span>
                <ChevronRight size={14} />
                <strong>{current.label}</strong>
              </>
            ) : (
              <strong>{pathname === adminPath('/') ? 'Home' : 'Nestovin admin'}</strong>
            )}
          </div>
          <div className="topbar-right">
            <span className="scope-pill" title="Your data scope">
              <span className="dot" aria-hidden />
              {scopeLabel}
            </span>
            <button type="button" className="icon-btn" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to">
              <Command size={17} />
            </button>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} groups={groups} counts={counts} />
    </div>
  );
}

function CommandPalette({
  open,
  onClose,
  groups,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  counts: Map<string, number>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQ('');
      setActive(0);
      d.showModal();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  const all = [{ to: '/', label: 'Home', group: 'Overview', keywords: 'dashboard run sheet' }, ...groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))];
  const needle = q.trim().toLowerCase();
  const results = needle
    ? all.filter((i) => `${i.label} ${i.group} ${i.keywords ?? ''}`.toLowerCase().includes(needle))
    : all;

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <dialog
      ref={ref}
      className="modal cmdk"
      aria-label="Search or jump to"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <>
          <div className="cmdk-input">
            <Search size={17} />
            <input
              ref={inputRef}
              value={q}
              placeholder="Jump to a page: verifications, payroll, import…"
              aria-label="Search pages"
              role="combobox"
              aria-expanded
              aria-controls="cmdk-list"
              aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, results.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter' && results[active]) {
                  go(results[active].to);
                }
              }}
            />
            <kbd className="faint" style={{ fontSize: 11 }}>
              Esc
            </kbd>
          </div>
          <ul className="cmdk-list" id="cmdk-list" role="listbox">
            {results.length === 0 ? <li className="cmdk-group">No page matches “{q}”</li> : null}
            {results.map((r, idx) => (
              <li key={r.to} role="option" id={`cmdk-${idx}`} aria-selected={idx === active}>
                <button type="button" className="cmdk-item" data-active={idx === active} onMouseEnter={() => setActive(idx)} onClick={() => go(r.to)}>
                  <BadgeCheck size={15} />
                  {r.label}
                  <span className="hint">
                    {counts.get(r.to) ? `${counts.get(r.to)} waiting · ` : ''}
                    {r.group}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </dialog>
  );
}
