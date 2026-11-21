'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import { DataTable, ErrorBanner, formatDateTime, InfoBanner, PageHeader, Panel, StatusBadge, Tabs } from '../../components/ui';
import { actionLabel } from '../../components/RecordHistory';

/** The API masks the recipient (email, phone or device) so it identifies without exposing it. */
interface OutboxRow {
  id: string;
  eventType: string;
  channel: string;
  recipient?: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

const TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'SENT', label: 'Sent' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'DEAD', label: 'Dead' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const STATUS: Record<string, { label: string; tone: string }> = {
  SENT: { label: 'Sent', tone: 'success' },
  PENDING: { label: 'Waiting', tone: 'warning' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
  DEAD: { label: 'Dead', tone: 'error' },
};

const channelText = (c: string) => (c === 'PUSH' ? 'In-app + push' : c === 'EMAIL' ? 'Email' : c === 'SMS' ? 'SMS' : c.toLowerCase());

/** Super Admin: are notifications being delivered? */
export function NotificationLogPage() {
  const me = useMe();
  const [status, setStatus] = useState<Tab>('');
  const list = useQuery({
    queryKey: ['outbox', status],
    queryFn: () => api<{ items: OutboxRow[] }>(`/v1/admin/notifications/outbox${qs({ status: status || undefined })}`),
    enabled: me.isSuperAdmin,
  });
  if (!me.isSuperAdmin) return <ErrorBanner error={new Error('Only the Super Admin can view notification delivery.')} />;
  return (
    <>
      <PageHeader
        title="Notification delivery"
        description="Every notification is saved to the resident’s or worker’s in-app inbox. Push (Firebase) and email (Resend) are sent when their keys are configured; otherwise they show as skipped or in-app only."
      />
      <div className="stack">
        <InfoBanner>Failed deliveries are retried with increasing delays and stop after 6 attempts (dead).</InfoBanner>
        <Tabs label="Delivery status" value={status} onChange={setStatus} items={TABS.map((t) => ({ ...t, count: t.value === status ? list.data?.items.length : undefined }))} />
        <Panel flush>
          <DataTable
            flush
            caption="Notification delivery"
            loading={list.isLoading}
            error={list.error}
            rows={list.data?.items}
            rowKey={(r) => r.id}
            emptyTitle={status ? 'Nothing with this status' : 'Nothing queued'}
            emptyBody="Notifications appear here as residents and workers are notified."
            columns={[
              {
                header: 'Event',
                cell: (r) => (
                  <span className="primary-cell">
                    {actionLabel(r.eventType)}
                    <span className="sub">Queued {formatDateTime(r.createdAt)}</span>
                  </span>
                ),
              },
              {
                header: 'Recipient',
                cell: (r) => (
                  <span className="primary-cell">
                    {r.recipient ?? '—'}
                    <span className="sub">{channelText(r.channel)}</span>
                  </span>
                ),
              },
              {
                header: 'Status',
                cell: (r) => (
                  <span>
                    <StatusBadge status={STATUS[r.status]?.label ?? r.status} tone={STATUS[r.status]?.tone ?? 'neutral'} />
                    {r.lastError ? (
                      <span className="sub muted clamp" title={r.lastError}>
                        {r.lastError}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              { header: 'Attempts', className: 'num', cell: (r) => r.attempts },
              { header: 'Sent', cell: (r) => (r.sentAt ? formatDateTime(r.sentAt) : <span className="muted">—</span>) },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
