'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminFamilyRequest } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, StatusBadge, TextArea, Toolbar } from '../../components/ui';

/**
 * ADM-06: a Primary Resident asks to add a family member. Approval requires
 * the reviewer to confirm an in-person (physical) verification. The member
 * gets their own login with the same household access (ADR-012).
 */
export function FamilyRequestsPage() {
  const me = useMe();
  const [status, setStatus] = useState('PENDING');
  const list = useQuery({
    queryKey: ['family-requests', status],
    queryFn: () => api<{ items: AdminFamilyRequest[] }>(`/v1/admin/family-requests${qs({ status, limit: 100 })}`),
  });
  const [deciding, setDeciding] = useState<{ req: AdminFamilyRequest; mode: 'approve' | 'reject' } | null>(null);
  const decide = can(me, 'family_requests', 'approve');

  return (
    <>
      <PageHeader
        title="Family requests"
        description="Requests from Primary Residents to give family members access to their household."
      />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {[
            { value: 'PENDING', label: 'Waiting for review' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
            { value: 'CANCELLED', label: 'Cancelled by resident' },
          ].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Toolbar>
      <DataTable
        caption="Family requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(r) => r.id}
        emptyTitle={status === 'PENDING' ? 'Nothing to review' : 'No requests'}
        columns={[
          {
            header: 'Family member',
            cell: (r) => (
              <>
                <strong>{r.fullName}</strong>
                <div className="muted">
                  {r.phone} · {r.relationship}
                </div>
              </>
            ),
          },
          {
            header: 'Requested by',
            cell: (r) => (
              <>
                <div>{r.primary.fullName ?? r.primary.phone}</div>
                <div className="muted">
                  {r.flat.communityName} · {r.flat.towerName} · {r.flat.flatNumber}
                </div>
              </>
            ),
          },
          { header: 'Requested', cell: (r) => formatDateTime(r.createdAt) },
          {
            header: status === 'PENDING' ? 'Actions' : 'Decision',
            className: 'actions',
            cell: (r) =>
              r.status === 'PENDING' ? (
                decide ? (
                  <div className="row">
                    <Button onClick={() => setDeciding({ req: r, mode: 'approve' })}>Approve</Button>
                    <Button variant="secondary" onClick={() => setDeciding({ req: r, mode: 'reject' })}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="muted">View only</span>
                )
              ) : (
                <>
                  <StatusBadge status={r.status} />
                  {r.reason ? <div className="muted">{r.reason}</div> : null}
                  {r.physicalVerificationAt ? <div className="muted">Verified in person {formatDateTime(r.physicalVerificationAt)}</div> : null}
                </>
              ),
          },
        ]}
      />
      {deciding ? <DecisionDialog req={deciding.req} mode={deciding.mode} onClose={() => setDeciding(null)} /> : null}
    </>
  );
}

function DecisionDialog({ req, mode, onClose }: { req: AdminFamilyRequest; mode: 'approve' | 'reject'; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      mode === 'approve'
        ? api(`/v1/admin/family-requests/${req.id}/approve`, {
            method: 'POST',
            body: { physicalVerificationDone: true, ...(text.trim() ? { note: text.trim() } : {}) },
          })
        : api(`/v1/admin/family-requests/${req.id}/reject`, { method: 'POST', body: { reason: text } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['family-requests'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={mode === 'approve' ? `Approve ${req.fullName}` : `Reject ${req.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={mode === 'approve' ? 'primary' : 'danger'}
            busy={save.isPending}
            onClick={() => save.mutate()}
            disabled={mode === 'approve' ? !confirmed : text.trim().length < 3}
          >
            {mode === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      {mode === 'approve' ? (
        <>
          <InfoBanner>
            {req.fullName} ({req.phone}) will get access to the household at {req.flat.towerName} {req.flat.flatNumber} when they sign in with this number.
          </InfoBanner>
          <label className="checkbox">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm the in-person verification of this family member was done.</span>
          </label>
          <TextArea label="Note (optional)" value={text} onChange={(e) => setText(e.target.value)} error={err?.field('note')} />
        </>
      ) : (
        <TextArea label="Reason" required hint="The Primary Resident sees this reason." value={text} onChange={(e) => setText(e.target.value)} error={err?.field('reason')} />
      )}
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}
