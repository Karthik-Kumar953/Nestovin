'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminEnquiry } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, FilterSelect, formatDateTime, PageHeader, Toolbar } from '../../components/ui';

const LABEL: Record<AdminEnquiry['status'], string> = { NEW: 'New', IN_PROGRESS: 'In progress', CLOSED: 'Closed' };
const OPTIONS = Object.entries(LABEL).map(([value, label]) => ({ value, label }));

/** WEB-10 / ADM-13: enquiries from the public website. They never create accounts or bookings. */
export function EnquiriesPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState('NEW');
  const list = usePagedList<AdminEnquiry>(['enquiries'], `/v1/admin/enquiries${qs({ status, limit: 50 })}`);
  const update = useMutation({
    mutationFn: (v: { id: string; status: AdminEnquiry['status'] }) => api(`/v1/admin/enquiries/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enquiries'] }),
  });
  const edit = can(me, 'support', 'edit');

  return (
    <>
      <PageHeader title="Website enquiries" description="Messages sent through the contact form on the Nestovin website." />
      <Toolbar>
        <FilterSelect value={status} onChange={setStatus} label="Status" options={OPTIONS} />
      </Toolbar>
      <ErrorBanner error={update.error} />
      <DataTable
        caption="Website enquiries"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(e) => e.id}
        emptyTitle="No enquiries"
        columns={[
          {
            header: 'From',
            cell: (e) => (
              <>
                <strong>{e.name}</strong>
                <div className="muted">{[e.phone, e.email].filter(Boolean).join(' · ')}</div>
                <div className="muted">{[e.community, e.city].filter(Boolean).join(', ') || '—'}</div>
              </>
            ),
          },
          { header: 'Message', cell: (e) => <p className="prewrap clamp">{e.message}</p> },
          { header: 'Received', cell: (e) => <>{formatDateTime(e.createdAt)}<div className="muted">{e.reference}</div></> },
          {
            header: 'Status',
            cell: (e) =>
              edit ? (
                <select
                  className="input input-compact"
                  aria-label={`Status of enquiry ${e.reference}`}
                  value={e.status}
                  onChange={(ev) => update.mutate({ id: e.id, status: ev.target.value as AdminEnquiry['status'] })}
                >
                  {OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                LABEL[e.status]
              ),
          },
        ]}
        footer={
          list.hasMore ? (
            <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
              Load more
            </Button>
          ) : null
        }
      />
    </>
  );
}
