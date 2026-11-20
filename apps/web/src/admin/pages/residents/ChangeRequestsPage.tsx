'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, StatusBadge, TextArea, Toolbar } from '../../components/ui';

interface ChangeRequest {
  id: string;
  kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT';
  requested: { occupancy?: string; moveOutDate?: string };
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewNote: string | null;
  createdAt: string;
  resident: { id: string; fullName: string | null; phone: string };
  flat: { flatNumber: string; towerName: string; communityName: string };
  currentOccupancy: string;
  membershipKind: string;
}

const describe = (c: ChangeRequest) =>
  c.kind === 'OCCUPANCY_CHANGE'
    ? `Change occupancy from ${c.currentOccupancy.toLowerCase()} to ${String(c.requested.occupancy).toLowerCase()}`
    : `Move out on ${c.requested.moveOutDate}${c.membershipKind === 'PRIMARY' ? ' (family access ends too)' : ''}`;

/** RES-14: verified residence data changes only through these reviewed requests. */
export function ChangeRequestsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const list = useQuery({ queryKey: ['change-requests', status], queryFn: () => api<{ items: ChangeRequest[] }>(`/v1/admin/change-requests${qs({ status })}`) });
  const [deciding, setDeciding] = useState<{ c: ChangeRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: () => api(`/v1/admin/change-requests/${deciding!.c.id}/decide`, { method: 'POST', body: { decision: deciding!.decision, note } }),
    onSuccess: async () => {
      setDeciding(null);
      setNote('');
      await qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
  });
  return (
    <>
      <PageHeader title="Residence change requests" description="Residents ask to change their occupancy or to move out. Verified residence data changes only when you approve." />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Waiting for review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled by resident</option>
        </select>
      </Toolbar>
      <DataTable
        caption="Residence change requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(c) => c.id}
        emptyTitle="No requests"
        columns={[
          { header: 'Resident', cell: (c) => <><strong>{c.resident.fullName ?? c.resident.phone}</strong><div className="muted">{c.resident.phone}</div></> },
          { header: 'Flat', cell: (c) => `${c.flat.communityName} · ${c.flat.towerName} · ${c.flat.flatNumber}` },
          { header: 'Request', cell: (c) => <>{describe(c)}{c.reason ? <div className="muted">{c.reason}</div> : null}</> },
          { header: 'Received', cell: (c) => formatDateTime(c.createdAt) },
          {
            header: '',
            className: 'actions',
            cell: (c) =>
              c.status === 'PENDING' && can(me, 'residents', 'approve') ? (
                <div className="row">
                  <Button onClick={() => setDeciding({ c, decision: 'APPROVED' })}>Approve</Button>
                  <Button variant="ghost" onClick={() => setDeciding({ c, decision: 'REJECTED' })}>Reject</Button>
                </div>
              ) : (
                <>
                  <StatusBadge status={c.status} />
                  {c.reviewNote ? <div className="muted">{c.reviewNote}</div> : null}
                </>
              ),
          },
        ]}
      />
      {deciding ? (
        <Modal
          open
          title={deciding.decision === 'APPROVED' ? 'Approve request' : 'Reject request'}
          onClose={() => setDeciding(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeciding(null)}>Cancel</Button>
              <Button variant={deciding.decision === 'APPROVED' ? 'primary' : 'danger'} disabled={note.trim().length < 3} busy={decide.isPending} onClick={() => decide.mutate()}>
                {deciding.decision === 'APPROVED' ? 'Approve' : 'Reject'}
              </Button>
            </>
          }
        >
          <p>{describe(deciding.c)}</p>
          {deciding.decision === 'APPROVED' && deciding.c.kind === 'MOVE_OUT' ? (
            <InfoBanner tone="warning">Approving ends this residence{deciding.c.membershipKind === 'PRIMARY' ? ' and the family members’ access' : ''}. It is refused while the household has a current subscription.</InfoBanner>
          ) : null}
          <TextArea label="Note (shown to the resident)" required value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorBanner error={decide.error} />
        </Modal>
      ) : null}
    </>
  );
}
