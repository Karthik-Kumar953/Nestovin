'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, ApiError, qs } from '../lib/api';
import { useMe } from '../auth/AuthProvider';
import { Link } from '../lib/router';
import { Button, DataTable, Drawer, ErrorBanner, formatDateTime, PageHeader, Panel, Toolbar } from './ui';
import { History } from './icons';

export interface AuditEntry {
  id: string;
  at: string;
  actor: { kind: string; id: string | null; name: string | null };
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

/** "community.created" -> "Community created" */
export function actionLabel(action: string): string {
  const [area = '', verb = ''] = action.split('.');
  const s = `${area.replace(/_/g, ' ')} ${verb.replace(/_/g, ' ')}`.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const actorLabel = (a: AuditEntry['actor']) =>
  a.name ?? (a.kind === 'system' ? 'System' : a.kind === 'public' ? 'Website visitor' : a.kind === 'resident' ? 'Resident' : a.kind === 'employee' ? 'Worker' : 'Admin');

/** Record types the audit log knows (mirrors the server's history mapping), plus exports. */
export const RECORD_TYPES: { value: string; label: string }[] = [
  'admin',
  'app_settings',
  'applicant',
  'attendance_correction',
  'attendance_event',
  'booking',
  'business_holiday',
  'catalogue_version',
  'city',
  'cluster',
  'community',
  'demand_cycle',
  'demand_request',
  'document',
  'employee',
  'expansion_vote',
  'export',
  'family_access_request',
  'flat',
  'import_batch',
  'leave_request',
  'payment_exception',
  'payment_order',
  'payment_transaction',
  'payroll_line',
  'payroll_run',
  'plan',
  'plan_component',
  'residence_category',
  'residence_membership',
  'resident',
  'role',
  'salary_payment',
  'service_occurrence',
  'service_task',
  'slot',
  'slot_set',
  'subscription',
  'subscription_component',
  'support_ticket',
  'ticket_category',
  'time_window',
  'tower',
  'training_item',
  'verification_item',
  'website_enquiry',
].map((v) => ({ value: v, label: typeLabel(v) }));

function typeLabel(t: string): string {
  const s = t.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Admin pages that open a single record, by audit record type. */
const RECORD_LINK: Record<string, (id: string) => string> = {
  admin: (id) => `/access/admins/${id}`,
  employee: (id) => `/workforce/employees/${id}`,
  community: (id) => `/locations/communities/${id}`,
  demand_cycle: (id) => `/demand/cycles/${id}`,
  payroll_run: (id) => `/finance/payroll/${id}`,
  support_ticket: (id) => `/support/tickets/${id}`,
};

/** A readable name from the record's after/before snapshot, when it has one. */
function recordName(e: AuditEntry): string | null {
  for (const snap of [e.after, e.before]) {
    if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
      const o = snap as Record<string, unknown>;
      for (const k of ['name', 'fullName', 'full_name', 'title', 'subject', 'employeeCode', 'code', 'flatNumber', 'email']) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
      }
    }
  }
  return null;
}

function RecordCell({ e }: { e: AuditEntry }) {
  const name = recordName(e);
  const link = e.targetId ? RECORD_LINK[e.targetType] : undefined;
  const label = name ?? (link ? 'Open record' : null);
  return (
    <span className="primary-cell" style={{ fontWeight: 400 }}>
      {label ? link && e.targetId ? <Link to={link(e.targetId)}>{label}</Link> : label : <span className="muted">—</span>}
      <span className="sub">{typeLabel(e.targetType)}</span>
    </span>
  );
}

function Details({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const pretty = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));
  const link = entry.targetId ? RECORD_LINK[entry.targetType] : undefined;
  return (
    <Drawer
      open
      title={actionLabel(entry.action)}
      subtitle={`${formatDateTime(entry.at)} · ${actorLabel(entry.actor)}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="stack">
        <dl className="details" style={{ margin: 0 }}>
          <div>
            <dt>Record</dt>
            <dd>
              {typeLabel(entry.targetType)}
              {recordName(entry) ? ` · ${recordName(entry)}` : ''}
              {link && entry.targetId ? (
                <>
                  {' '}
                  <Link to={link(entry.targetId)}>Open</Link>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Action</dt>
            <dd>
              <code>{entry.action}</code>
            </dd>
          </div>
          {entry.reason ? (
            <div>
              <dt>Reason</dt>
              <dd>{entry.reason}</dd>
            </div>
          ) : null}
        </dl>
        <section>
          <h3 className="section-title">Before</h3>
          <pre className="prewrap code-block">{pretty(entry.before)}</pre>
        </section>
        <section>
          <h3 className="section-title">After</h3>
          <pre className="prewrap code-block">{pretty(entry.after)}</pre>
        </section>
      </div>
    </Drawer>
  );
}

/**
 * Change history of one record (audit trail). Shown to the Super Admin and to
 * all-cluster admins who can view the module; the server enforces the same rule.
 */
export function RecordHistory({ targetType, targetId }: { targetType: string; targetId: string }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const allowed = me.isSuperAdmin || me.scope.type === 'GLOBAL';
  const q = useInfiniteQuery({
    queryKey: ['audit', targetType, targetId],
    enabled: open && allowed,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: AuditEntry[]; nextCursor: string | null }>(`/v1/admin/audit/records/${targetType}/${targetId}${qs({ limit: 20, cursor: pageParam })}`),
    getNextPageParam: (p) => p.nextCursor,
    retry: false,
  });
  if (!allowed) return null;
  const forbidden = q.error instanceof ApiError && q.error.status === 403;
  const rows = q.data?.pages.flatMap((p) => p.items);
  return (
    <Panel
      title="History"
      subtitle={open ? 'Every recorded change, newest first.' : undefined}
      actions={
        <Button variant="ghost" size="sm" icon={History} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show changes'}
        </Button>
      }
      flush
    >
      {open && !forbidden ? (
        <DataTable
          flush
          caption="Change history"
          loading={q.isLoading}
          error={q.error}
          rows={rows}
          rowKey={(e) => e.id}
          onRowClick={(e) => (e.before || e.after ? setDetail(e) : undefined)}
          emptyTitle="No recorded changes"
          columns={[
            {
              header: 'Change',
              cell: (e) => (
                <span className="primary-cell">
                  {actionLabel(e.action)}
                  <span className="sub">
                    {formatDateTime(e.at)} · {actorLabel(e.actor)}
                  </span>
                  {e.reason ? <span className="sub">{e.reason}</span> : null}
                </span>
              ),
            },
            {
              header: 'Details',
              className: 'actions',
              cell: (e) =>
                e.before || e.after ? (
                  <Button variant="ghost" size="sm" onClick={() => setDetail(e)}>
                    Details
                  </Button>
                ) : null,
            },
          ]}
          footer={
            q.hasNextPage ? (
              <Button variant="ghost" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load more
              </Button>
            ) : null
          }
        />
      ) : null}
      {forbidden ? (
        <p className="muted panel-body" style={{ margin: 0 }}>
          You do not have access to this record’s history.
        </p>
      ) : null}
      {detail ? <Details entry={detail} onClose={() => setDetail(null)} /> : null}
    </Panel>
  );
}

/** Super Admin: full audit log with filters. */
export function AuditLogPage() {
  const me = useMe();
  const [targetType, setTargetType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const actionOk = action === '' || /^[a-z_.]{1,60}$/.test(action);
  const q = useInfiniteQuery({
    queryKey: ['audit-log', targetType, action, from, to],
    enabled: me.isSuperAdmin && actionOk,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: AuditEntry[]; nextCursor: string | null }>(
        `/v1/admin/audit/events${qs({ targetType: targetType || undefined, action: action || undefined, from, to, limit: 50, cursor: pageParam })}`,
      ),
    getNextPageParam: (p) => p.nextCursor,
  });
  if (!me.isSuperAdmin) return <ErrorBanner error={new Error('Only the Super Admin can browse the full audit log.')} />;
  const filtered = Boolean(targetType || action || from || to);
  return (
    <>
      <PageHeader title="Audit log" description="Every change made in Nestovin, who made it and when. Entries can never be edited or deleted." />
      <div className="stack">
        <Toolbar>
          <select className="input input-compact" aria-label="Record type" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="">All record types</option>
            {RECORD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="input input-compact"
            placeholder="Action starts with, e.g. refund."
            aria-label="Action starts with"
            value={action}
            onChange={(e) => setAction(e.target.value.trim().toLowerCase())}
          />
          <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input className="input input-compact" type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted" aria-hidden>
              –
            </span>
            <input className="input input-compact" type="date" aria-label="To date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTargetType('');
                setAction('');
                setFrom('');
                setTo('');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </Toolbar>
        {!actionOk ? <p className="field-error">Action can contain only lowercase letters, dots and underscores.</p> : null}
        <Panel flush>
          <DataTable
            flush
            caption="Audit log"
            loading={q.isLoading}
            error={q.error}
            rows={q.data?.pages.flatMap((p) => p.items)}
            rowKey={(e) => e.id}
            onRowClick={setDetail}
            emptyTitle={filtered ? 'No entries match' : 'No entries'}
            emptyBody={filtered ? 'Widen the dates or clear the filters.' : undefined}
            columns={[
              { header: 'When', cell: (e) => formatDateTime(e.at) },
              {
                header: 'What',
                cell: (e) => (
                  <span className="primary-cell">
                    {actionLabel(e.action)}
                    {e.reason ? <span className="sub">{e.reason}</span> : null}
                  </span>
                ),
              },
              { header: 'Record', cell: (e) => <RecordCell e={e} /> },
              { header: 'By', cell: (e) => actorLabel(e.actor) },
              {
                header: 'Details',
                className: 'actions',
                cell: (e) => (
                  <Button variant="ghost" size="sm" onClick={() => setDetail(e)}>
                    Details
                  </Button>
                ),
              },
            ]}
            footer={
              q.hasNextPage ? (
                <Button variant="ghost" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  Load more
                </Button>
              ) : null
            }
          />
        </Panel>
      </div>
      {detail ? <Details entry={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}
