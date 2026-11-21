'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminEnquiry } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, Drawer, ErrorBanner, formatDate, formatDateTime, PageHeader, Panel, Segmented, Tabs, useToast } from '../../components/ui';
import { Mail, Phone } from '../../components/icons';

type Status = AdminEnquiry['status'];
const LABEL: Record<Status, string> = { NEW: 'New', IN_PROGRESS: 'In progress', CLOSED: 'Closed' };
const TONE: Record<Status, string> = { NEW: 'warning', IN_PROGRESS: 'teal', CLOSED: 'neutral' };
const ROUTING: Record<AdminEnquiry['routingStatus'], string> = { PENDING: 'Waiting to be forwarded', ROUTED: 'Forwarded to the team', FAILED: 'Forwarding failed' };

function EnquiryBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${TONE[status]}`}>{LABEL[status]}</span>;
}

/** WEB-10 / ADM-13: enquiries from the public website. They never create accounts or bookings. */
export function EnquiriesPage() {
  const [status, setStatus] = useState<Status | 'ALL'>('NEW');
  const list = usePagedList<AdminEnquiry>(['enquiries'], `/v1/admin/enquiries${qs({ status: status === 'ALL' ? undefined : status, limit: 50 })}`);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.rows?.find((e) => e.id === openId) ?? null;

  return (
    <>
      <PageHeader title="Website enquiries" description="Messages sent through the contact form on the Nestovin website. They never create accounts or bookings." />
      <Tabs
        label="Status"
        value={status}
        onChange={setStatus}
        items={[
          { value: 'NEW', label: 'New' },
          { value: 'IN_PROGRESS', label: 'In progress' },
          { value: 'CLOSED', label: 'Closed' },
          { value: 'ALL', label: 'All' },
        ]}
      />
      <Panel flush>
        <DataTable
          flush
          caption="Website enquiries"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(e) => e.id}
          onRowClick={(e) => setOpenId(e.id)}
          emptyTitle={status === 'NEW' ? 'No new enquiries' : 'No enquiries'}
          emptyBody={status === 'NEW' ? 'New messages from the website contact form appear here.' : undefined}
          columns={[
            {
              header: 'From',
              cell: (e) => (
                <span className="primary-cell">
                  {e.name}
                  <span className="sub">{[e.phone, e.email].filter(Boolean).join(' · ')}</span>
                </span>
              ),
            },
            { header: 'Message', cell: (e) => <span className="clamp">{e.message}</span> },
            { header: 'Location', cell: (e) => [e.community, e.city].filter(Boolean).join(', ') || <span className="faint">—</span> },
            {
              header: 'Received',
              cell: (e) => (
                <span className="primary-cell">
                  {formatDate(e.createdAt)}
                  <span className="sub">{e.reference}</span>
                </span>
              ),
            },
            { header: 'Status', cell: (e) => <EnquiryBadge status={e.status} /> },
          ]}
          footer={
            list.hasMore ? (
              <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                Load more
              </Button>
            ) : null
          }
        />
      </Panel>
      <EnquiryDrawer enquiry={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function EnquiryDrawer({ enquiry: e, onClose }: { enquiry: AdminEnquiry | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const edit = can(me, 'support', 'edit');
  const update = useMutation({
    mutationFn: (v: { id: string; status: Status }) => api(`/v1/admin/enquiries/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: async (_d, v) => {
      toast(`Marked ${LABEL[v.status].toLowerCase()}`);
      await qc.invalidateQueries({ queryKey: ['enquiries'] });
    },
  });

  return (
    <Drawer open={Boolean(e)} onClose={onClose} title={e ? e.name : 'Enquiry'} subtitle={e ? `${e.reference} · received ${formatDateTime(e.createdAt)}` : undefined}>
      {e ? (
        <div className="stack">
          <ErrorBanner error={update.error} />
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <a className="btn btn-secondary btn-sm" href={`tel:${e.phone}`}>
              <Phone size={14} /> {e.phone}
            </a>
            {e.email ? (
              <a className="btn btn-secondary btn-sm" href={`mailto:${e.email}`}>
                <Mail size={14} /> {e.email}
              </a>
            ) : null}
          </div>
          <dl className="details">
            <div>
              <dt>Community</dt>
              <dd>{e.community ?? '—'}</dd>
            </div>
            <div>
              <dt>City</dt>
              <dd>{e.city ?? '—'}</dd>
            </div>
            <div>
              <dt>Forwarding</dt>
              <dd>{ROUTING[e.routingStatus]}</dd>
            </div>
          </dl>
          <section>
            <h3 className="section-title">Message</h3>
            <p className="prewrap">{e.message}</p>
          </section>
          <section className="stack-sm">
            <h3 className="section-title">Status</h3>
            {edit ? (
              <Segmented
                label="Enquiry status"
                value={e.status}
                onChange={(s) => {
                  if (s !== e.status) update.mutate({ id: e.id, status: s });
                }}
                items={(Object.keys(LABEL) as Status[]).map((s) => ({ value: s, label: LABEL[s] }))}
              />
            ) : (
              <EnquiryBadge status={e.status} />
            )}
            {update.isPending ? <span className="faint">Saving…</span> : null}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
