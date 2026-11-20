'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, ApiError, qs } from '../lib/api';
import { useMe } from '../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, Modal, PageHeader, Toolbar } from './ui';

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

function Details({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const pretty = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));
  return (
    <Modal open wide title={actionLabel(entry.action)} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      <dl className="details">
        <div><dt>When</dt><dd>{formatDateTime(entry.at)}</dd></div>
        <div><dt>By</dt><dd>{actorLabel(entry.actor)}</dd></div>
        <div><dt>Record</dt><dd>{entry.targetType.replace(/_/g, ' ')}</dd></div>
        {entry.reason ? <div><dt>Reason</dt><dd>{entry.reason}</dd></div> : null}
      </dl>
      <div className="split">
        <div><h3 className="section-title">Before</h3><pre className="prewrap code-block">{pretty(entry.before)}</pre></div>
        <div><h3 className="section-title">After</h3><pre className="prewrap code-block">{pretty(entry.after)}</pre></div>
      </div>
    </Modal>
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
    queryFn: ({ pageParam }) => api<{ items: AuditEntry[]; nextCursor: string | null }>(`/v1/admin/audit/records/${targetType}/${targetId}${qs({ limit: 20, cursor: pageParam })}`),
    getNextPageParam: (p) => p.nextCursor,
    retry: false,
  });
  if (!allowed) return null;
  const forbidden = q.error instanceof ApiError && q.error.status === 403;
  const rows = q.data?.pages.flatMap((p) => p.items);
  return (
    <div className="card">
      <div className="page-header">
        <h2 className="section-title">History</h2>
        <Button variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show change history'}</Button>
      </div>
      {open && !forbidden ? (
        <DataTable
          caption="Change history"
          loading={q.isLoading}
          error={q.error}
          rows={rows}
          rowKey={(e) => e.id}
          emptyTitle="No recorded changes"
          columns={[
            { header: 'When', cell: (e) => formatDateTime(e.at) },
            { header: 'What', cell: (e) => <>{actionLabel(e.action)}{e.reason ? <div className="muted">{e.reason}</div> : null}</> },
            { header: 'By', cell: (e) => actorLabel(e.actor) },
            { header: '', className: 'actions', cell: (e) => (e.before || e.after ? <Button variant="ghost" onClick={() => setDetail(e)}>Details</Button> : null) },
          ]}
          footer={q.hasNextPage ? <Button variant="ghost" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button> : null}
        />
      ) : null}
      {forbidden ? <p className="muted">You do not have access to this record’s history.</p> : null}
      {detail ? <Details entry={detail} onClose={() => setDetail(null)} /> : null}
    </div>
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
  const q = useInfiniteQuery({
    queryKey: ['audit-log', targetType, action, from, to],
    enabled: me.isSuperAdmin,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: AuditEntry[]; nextCursor: string | null }>(`/v1/admin/audit/events${qs({ targetType: targetType || undefined, action: action || undefined, from, to, limit: 50, cursor: pageParam })}`),
    getNextPageParam: (p) => p.nextCursor,
  });
  if (!me.isSuperAdmin) return <ErrorBanner error={new Error('Only the Super Admin can browse the full audit log.')} />;
  return (
    <>
      <PageHeader title="Audit log" description="Every change made in Nestovin, who made it and when. Entries can never be edited or deleted." />
      <Toolbar>
        <input className="input input-compact" placeholder="Record type, e.g. payroll_run" aria-label="Record type" value={targetType} onChange={(e) => setTargetType(e.target.value.trim().toLowerCase())} />
        <input className="input input-compact" placeholder="Action starts with, e.g. refund." aria-label="Action" value={action} onChange={(e) => setAction(e.target.value.trim().toLowerCase())} />
        <input className="input input-compact" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input input-compact" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
      </Toolbar>
      <DataTable
        caption="Audit log"
        loading={q.isLoading}
        error={q.error}
        rows={q.data?.pages.flatMap((p) => p.items)}
        rowKey={(e) => e.id}
        emptyTitle="No entries"
        columns={[
          { header: 'When', cell: (e) => formatDateTime(e.at) },
          { header: 'What', cell: (e) => <>{actionLabel(e.action)}{e.reason ? <div className="muted">{e.reason}</div> : null}</> },
          { header: 'Record', cell: (e) => <span className="muted">{e.targetType.replace(/_/g, ' ')}</span> },
          { header: 'By', cell: (e) => actorLabel(e.actor) },
          { header: '', className: 'actions', cell: (e) => <Button variant="ghost" onClick={() => setDetail(e)}>Details</Button> },
        ]}
        footer={q.hasNextPage ? <Button variant="ghost" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button> : null}
      />
      {detail ? <Details entry={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}
