'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminFamilyRequest } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
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
  TextArea,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CircleCheck, CircleX, Clock, Hourglass, User, UserCheck } from '../../components/icons';
import { QUEUE_LIMIT, usePendingQueue, waitingFor } from './shared';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
const flatOf = (r: AdminFamilyRequest) => `${r.flat.communityName} · ${r.flat.towerName} · ${r.flat.flatNumber}`;

/**
 * ADM-06: a Primary Resident asks to add a family member. Approval requires
 * the reviewer to confirm an in-person (physical) verification. The member
 * gets their own login with the same household access (ADR-012).
 */
export function FamilyRequestsPage() {
  const [status, setStatus] = useState<Status>('PENDING');
  const list = useQuery({
    queryKey: ['family-requests', status],
    queryFn: () => api<{ items: AdminFamilyRequest[] }>(`/v1/admin/family-requests${qs({ status, limit: QUEUE_LIMIT })}`),
  });
  const pending = usePendingQueue<AdminFamilyRequest>('family-requests', `/v1/admin/family-requests${qs({ status: 'PENDING', limit: QUEUE_LIMIT })}`);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.data?.items.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Family requests"
        description="Requests from Primary Residents to give family members access to their household. Approve only after an in-person verification."
      />
      <Facts
        items={[
          { label: 'Waiting for review', value: pending.count, tone: pending.n > 0 ? 'amber' : undefined, icon: Hourglass },
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
          caption="Family requests"
          loading={list.isLoading}
          error={list.error}
          rows={list.data?.items}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          emptyTitle={status === 'PENDING' ? 'Nothing to review' : 'No requests'}
          emptyBody={status === 'PENDING' ? 'Requests appear here when a Primary Resident adds a family member in the app.' : undefined}
          columns={[
            {
              header: 'Family member',
              cell: (r) => (
                <span className="primary-cell">
                  {r.fullName}
                  <span className="sub">
                    {r.phone} · {r.relationship}
                  </span>
                </span>
              ),
            },
            {
              header: 'Requested by',
              cell: (r) => (
                <span className="primary-cell">
                  {r.primary.fullName ?? r.primary.phone}
                  <span className="sub">{flatOf(r)}</span>
                </span>
              ),
            },
            { header: 'Requested', cell: (r) => formatDate(r.createdAt) },
            { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Panel>
      {/* Remount per request so the checkbox and note start empty each time. */}
      <FamilyDrawer key={open?.id ?? 'none'} request={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function FamilyDrawer({ request: r, onClose }: { request: AdminFamilyRequest | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [verified, setVerified] = useState(false);
  const [note, setNote] = useState('');
  const decide = can(me, 'family_requests', 'approve');

  const done = async (msg: string) => {
    toast(msg);
    await qc.invalidateQueries({ queryKey: ['family-requests'] });
    onClose();
  };
  const approve = useMutation({
    mutationFn: (id: string) =>
      api(`/v1/admin/family-requests/${id}/approve`, {
        method: 'POST',
        body: { physicalVerificationDone: true, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: () => done('Family member approved'),
  });
  const reject = useMutation({
    mutationFn: (p: { id: string; reason: string }) => api(`/v1/admin/family-requests/${p.id}/reject`, { method: 'POST', body: { reason: p.reason } }),
    onSuccess: () => done('Family request rejected'),
  });
  const err = approve.error instanceof ApiError ? approve.error : null;

  const onApprove = async () => {
    if (!r || !verified) return;
    const res = await confirm({
      title: `Approve ${r.fullName}?`,
      body: `${r.fullName} (${r.phone}) gets access to the household at ${r.flat.towerName} ${r.flat.flatNumber} when they sign in with this number. You are confirming the in-person verification was done.`,
      confirmLabel: 'Approve',
    });
    if (res.ok) approve.mutate(r.id);
  };
  const onReject = async () => {
    if (!r) return;
    const res = await confirm({
      title: `Reject ${r.fullName}?`,
      body: 'The Primary Resident sees this reason in the app. They can send a new request later.',
      confirmLabel: 'Reject request',
      tone: 'danger',
      reason: { label: 'Reason (shown to the Primary Resident)', required: true, minLength: 3 },
    });
    if (res.ok) reject.mutate({ id: r.id, reason: res.reason });
  };

  const pending = r?.status === 'PENDING';
  return (
    <Drawer
      open={Boolean(r)}
      onClose={onClose}
      title={r ? r.fullName : 'Family request'}
      subtitle={r ? `${r.relationship} of ${r.primary.fullName ?? r.primary.phone}` : undefined}
      footer={
        r && pending && decide ? (
          <>
            <Button variant="danger" icon={CircleX} busy={reject.isPending} onClick={onReject}>
              Reject
            </Button>
            <Button icon={CircleCheck} busy={approve.isPending} disabled={!verified} onClick={onApprove}>
              Approve
            </Button>
          </>
        ) : undefined
      }
    >
      {r ? (
        <div className="stack">
          <ErrorBanner error={err?.fields.length ? null : (approve.error ?? reject.error)} />
          <dl className="details">
            <div>
              <dt>Family member</dt>
              <dd>
                {r.fullName}
                <div className="muted">{r.phone}</div>
              </dd>
            </div>
            <div>
              <dt>Relationship</dt>
              <dd>{r.relationship}</dd>
            </div>
            <div>
              <dt>Requested by</dt>
              <dd>
                {r.primary.fullName ?? 'Name not added'}
                <div className="muted">{r.primary.phone}</div>
              </dd>
            </div>
            <div>
              <dt>Flat</dt>
              <dd>{flatOf(r)}</dd>
            </div>
            <div>
              <dt>Requested</dt>
              <dd>{formatDateTime(r.createdAt)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={r.status} />
                {r.reviewedAt ? <div className="muted">{formatDateTime(r.reviewedAt)}</div> : null}
              </dd>
            </div>
            {r.reason ? (
              <div>
                <dt>{r.status === 'REJECTED' ? 'Reason given' : 'Note'}</dt>
                <dd>{r.reason}</dd>
              </div>
            ) : null}
            {r.physicalVerificationAt ? (
              <div>
                <dt>Verified in person</dt>
                <dd>{formatDateTime(r.physicalVerificationAt)}</dd>
              </div>
            ) : null}
          </dl>

          <section>
            <h3 className="section-title">Evidence</h3>
            <p className="muted">Family requests carry no uploaded documents. Approval rests on the in-person check of the family member at the flat.</p>
          </section>

          {pending && decide ? (
            <section className="card stack">
              <h3 className="section-title" style={{ margin: 0 }}>
                <UserCheck size={16} aria-hidden /> Before approving
              </h3>
              <label className="checkbox">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
                <span>I confirm the in-person verification of this family member was done.</span>
              </label>
              <TextArea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} error={err?.field('note')} rows={2} />
              {!verified ? <p className="faint">Approve stays off until the in-person verification is confirmed.</p> : null}
            </section>
          ) : null}
          {pending && !decide ? <InfoBanner>You can view this request. Approving or rejecting needs the family requests approve permission.</InfoBanner> : null}

          {can(me, 'residents') ? (
            <div>
              <ButtonLink to={`/residents?open=${r.primary.residentId}`} variant="ghost" size="sm" icon={User}>
                View Primary Resident
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
