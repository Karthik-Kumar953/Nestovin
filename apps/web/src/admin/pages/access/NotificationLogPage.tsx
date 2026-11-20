'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { useMe } from '../../auth/AuthProvider';
import { DataTable, ErrorBanner, formatDateTime, InfoBanner, PageHeader, Toolbar } from '../../components/ui';
import { actionLabel } from '../../components/RecordHistory';
import { Pill } from '../demand/shared';

interface OutboxRow { id: string; eventType: string; channel: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null }

/** Super Admin: are notifications being delivered? */
export function NotificationLogPage() {
  const me = useMe();
  const [status, setStatus] = useState('');
  const list = useQuery({ queryKey: ['outbox', status], queryFn: () => api<{ items: OutboxRow[] }>(`/v1/admin/notifications/outbox${qs({ status: status || undefined })}`), enabled: me.isSuperAdmin });
  if (!me.isSuperAdmin) return <ErrorBanner error={new Error('Only the Super Admin can view notification delivery.')} />;
  return (
    <>
      <PageHeader title="Notification delivery" description="Every notification is saved to the resident’s or worker’s in-app inbox. Push (Firebase) and email (Resend) are sent when their keys are configured; otherwise they show as skipped or in-app only." />
      <InfoBanner>Failed deliveries are retried with increasing delays and stop after 6 attempts (dead).</InfoBanner>
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Waiting</option>
          <option value="SENT">Sent</option>
          <option value="SKIPPED">Skipped</option>
          <option value="DEAD">Dead</option>
        </select>
      </Toolbar>
      <DataTable
        caption="Notification delivery"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        emptyTitle="Nothing queued"
        columns={[
          { header: 'Queued', cell: (r) => formatDateTime(r.createdAt) },
          { header: 'Event', cell: (r) => actionLabel(r.eventType) },
          { header: 'Channel', cell: (r) => (r.channel === 'PUSH' ? 'In-app + push' : r.channel.toLowerCase()) },
          { header: 'Status', cell: (r) => <><Pill status={r.status === 'SENT' ? 'ACTIVE' : r.status === 'DEAD' ? 'REVIEW_REQUIRED' : r.status === 'PENDING' ? 'AWAITING_PAYMENT' : 'DRAFT'} label={r.status.toLowerCase()} />{r.lastError ? <div className="muted">{r.lastError}</div> : null}</> },
          { header: 'Attempts', className: 'num', cell: (r) => r.attempts },
          { header: 'Sent', cell: (r) => formatDateTime(r.sentAt) },
        ]}
      />
    </>
  );
}
