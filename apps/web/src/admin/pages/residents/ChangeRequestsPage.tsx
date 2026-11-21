'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  ErrorBanner,
  Facts,
  formatDate,
  formatDateTime,
  InfoBanner,
  PageHeader,
  Panel,
  StatusBadge,
  Tabs,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CircleCheck, CircleX, Clock, Hourglass, LogOut, Repeat, User } from '../../components/icons';
import { occupancyLabel, roleLabel, usePendingQueue, waitingFor } from './shared';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

interface ChangeRequest {
  id: string;
  kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT';
  requested: { occupancy?: string; moveOutDate?: string };
  reason: string | null;
  status: Status;
  reviewNote: string | null;
  createdAt: string;
  resident: { id: string; fullName: string | null; phone: string };
  flat: { flatNumber: string; towerName: string; communityName: string };
  currentOccupancy: string;
  membershipKind: string;
}

const describe = (c: ChangeRequest) =>
  c.kind === 'OCCUPANCY_CHANGE'
    ? `Change occupancy from ${occupancyLabel(c.currentOccupancy).toLowerCase()} to ${occupancyLabel(c.requested.occupancy).toLowerCase()}`
    : `Move out on ${formatDate(c.requested.moveOutDate)}${c.membershipKind === 'PRIMARY' ? ' (family access ends too)' : ''}`;
const flatOf = (c: ChangeRequest) => `${c.flat.communityName} · ${c.flat.towerName} · ${c.flat.flatNumber}`;

/** RES-14: verified residence data changes only through these reviewed requests. */
export function ChangeRequestsPage() {
  const [status, setStatus] = useState<Status>('PENDING');
  const list = useQuery({
    queryKey: ['change-requests', status],
    queryFn: () => api<{ items: ChangeRequest[] }>(`/v1/admin/change-requests${qs({ status })}`),
  });
  const pending = usePendingQueue<ChangeRequest>('change-requests', `/v1/admin/change-requests${qs({ status: 'PENDING' })}`);
  const moveOuts = pending.items?.filter((c) => c.kind === 'MOVE_OUT').length ?? 0;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.data?.items.find((c) => c.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Residence change requests"
        description="Residents ask to change their occupancy or to move out. Verified residence data changes only when you approve."
      />
      <Facts
        items={[
          { label: 'Waiting for review', value: pending.count, tone: pending.n > 0 ? 'amber' : undefined, icon: Hourglass },
          { label: 'Move-outs', value: moveOuts, icon: LogOut },
          { label: 'Occupancy changes', value: pending.n - moveOuts, icon: Repeat },
          { label: 'Oldest waiting', value: waitingFor(pending.oldest), note: pending.oldest ? `Since ${formatDate(pending.oldest)}` : undefined, icon: Clock },
        ]}
      />
      <Tabs
        label="Status"
        value={status}
        onChange={setStatus}
        items={[
          { value: 'PENDING', label: 'Waiting for review', count: pending.items ? pending.n : undefined },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
          { value: 'CANCELLED', label: 'Cancelled by resident' },
        ]}
      />
      <Panel flush>
        <DataTable
          flush
          caption="Residence change requests"
          loading={list.isLoading}
          error={list.error}
          rows={list.data?.items}
          rowKey={(c) => c.id}
          onRowClick={(c) => setOpenId(c.id)}
          emptyTitle={status === 'PENDING' ? 'Nothing to review' : 'No requests'}
          emptyBody={status === 'PENDING' ? 'Requests appear here when a verified resident asks to change occupancy or move out.' : undefined}
          columns={[
            {
              header: 'Resident',
              cell: (c) => (
                <span className="primary-cell">
                  {c.resident.fullName ?? c.resident.phone}
                  <span className="sub">{flatOf(c)}</span>
                </span>
              ),
            },
            {
              header: 'Request',
              cell: (c) => (
                <span className="primary-cell">
                  {c.kind === 'MOVE_OUT' ? 'Move out' : 'Occupancy change'}
                  <span className="sub">{describe(c)}</span>
                </span>
              ),
            },
            { header: 'Received', cell: (c) => formatDate(c.createdAt) },
            { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Panel>
      <ChangeDrawer request={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function ChangeDrawer({ request: c, onClose }: { request: ChangeRequest | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const allowed = can(me, 'residents', 'approve');
  const decide = useMutation({
    mutationFn: (p: { id: string; decision: 'APPROVED' | 'REJECTED'; note: string }) =>
      api(`/v1/admin/change-requests/${p.id}/decide`, { method: 'POST', body: { decision: p.decision, note: p.note } }),
    onSuccess: async (_d, p) => {
      toast(p.decision === 'APPROVED' ? 'Request approved' : 'Request rejected');
      await qc.invalidateQueries({ queryKey: ['change-requests'] });
      onClose();
    },
  });

  const run = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!c) return;
    const approving = decision === 'APPROVED';
    const moveOut = c.kind === 'MOVE_OUT';
    const r = await confirm({
      title: approving ? 'Approve this request?' : 'Reject this request?',
      body: approving ? (
        moveOut ? (
          <>
            {describe(c)}. Approving ends this residence{c.membershipKind === 'PRIMARY' ? ' and the family members’ access' : ''}. It is refused while the household has a current subscription, and it cannot be undone here.
          </>
        ) : (
          <>{describe(c)}. The verified residence record is updated straight away.</>
        )
      ) : (
        'The residence stays as it is. The resident sees your note in the app.'
      ),
      confirmLabel: approving ? 'Approve' : 'Reject request',
      tone: approving ? (moveOut ? 'warning' : 'default') : 'danger',
      reason: { label: 'Note (shown to the resident)', required: true, minLength: 3 },
    });
    if (r.ok) decide.mutate({ id: c.id, decision, note: r.reason });
  };

  return (
    <Drawer
      open={Boolean(c)}
      onClose={onClose}
      title={c ? (c.kind === 'MOVE_OUT' ? 'Move-out request' : 'Occupancy change request') : 'Request'}
      subtitle={c ? `${c.resident.fullName ?? c.resident.phone} · ${flatOf(c)}` : undefined}
      footer={
        c && c.status === 'PENDING' && allowed ? (
          <>
            <Button variant="danger" icon={CircleX} busy={decide.isPending && decide.variables?.decision === 'REJECTED'} onClick={() => run('REJECTED')}>
              Reject
            </Button>
            <Button icon={CircleCheck} busy={decide.isPending && decide.variables?.decision === 'APPROVED'} onClick={() => run('APPROVED')}>
              Approve
            </Button>
          </>
        ) : undefined
      }
    >
      {c ? (
        <div className="stack">
          <ErrorBanner error={decide.error} />
          {c.status === 'PENDING' && c.kind === 'MOVE_OUT' ? (
            <InfoBanner tone="warning">
              Approving ends this residence{c.membershipKind === 'PRIMARY' ? ' and the family members’ access' : ''}. It is refused while the household has a current subscription.
            </InfoBanner>
          ) : null}
          <dl className="details">
            <div>
              <dt>Request</dt>
              <dd>{describe(c)}</dd>
            </div>
            <div>
              <dt>Resident</dt>
              <dd>
                {c.resident.fullName ?? 'Name not added'}
                <div className="muted">{c.resident.phone}</div>
              </dd>
            </div>
            <div>
              <dt>Flat</dt>
              <dd>{flatOf(c)}</dd>
            </div>
            <div>
              <dt>Current role</dt>
              <dd>
                {roleLabel(c.membershipKind === 'PRIMARY' ? 'PRIMARY' : 'FAMILY')} · {occupancyLabel(c.currentOccupancy)}
              </dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDateTime(c.createdAt)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={c.status} />
              </dd>
            </div>
          </dl>
          <section>
            <h3 className="section-title">Resident’s reason</h3>
            {c.reason ? <p className="prewrap">{c.reason}</p> : <p className="muted">No reason given.</p>}
          </section>
          {c.reviewNote ? (
            <section>
              <h3 className="section-title">Review note</h3>
              <p className="prewrap">{c.reviewNote}</p>
            </section>
          ) : null}
          {c.status === 'PENDING' && !allowed ? <InfoBanner>You can view this request. Deciding needs the residents approve permission.</InfoBanner> : null}
          {can(me, 'residents') ? (
            <div>
              <ButtonLink to={`/residents?open=${c.resident.id}`} variant="ghost" size="sm" icon={User}>
                View resident
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
