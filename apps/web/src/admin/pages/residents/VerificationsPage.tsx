'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RESIDENCE_DOC_LABELS, type DocumentUrl, type VerificationRequest } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, StatusBadge, TextArea, Toolbar } from '../../components/ui';
import { flatLabel } from './ResidentsPage';

/**
 * ADM-05 residence verification queue. One document, reviewed manually
 * (ADR-012). Registrations appear once the resident has uploaded the document.
 */
export function VerificationsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [decision, setDecision] = useState('PENDING');
  const list = useQuery({
    queryKey: ['verifications', decision],
    queryFn: () => api<{ items: VerificationRequest[] }>(`/v1/admin/residence-verifications${qs({ decision, limit: 100 })}`),
  });
  const [rejecting, setRejecting] = useState<VerificationRequest | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const approve = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/residence-verifications/${id}/approve`, { method: 'POST' }),
    onMutate: () => setActionError(null),
    onError: (e) => setActionError(e),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verifications'] }),
  });
  const openDoc = useMutation({
    mutationFn: (documentId: string) => api<DocumentUrl>(`/v1/admin/documents/${documentId}/url`, { method: 'POST' }),
    onMutate: () => setActionError(null),
    onError: (e) => setActionError(e),
    onSuccess: (d) => window.open(d.url, '_blank', 'noopener,noreferrer'),
  });
  const decide = can(me, 'residents', 'approve');

  return (
    <>
      <PageHeader
        title="Residence verification"
        description="Check the uploaded document against the flat. The first verified resident of a flat becomes its Primary Resident."
      />
      <Toolbar>
        <select className="input input-compact" aria-label="Decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
          {[
            { value: 'PENDING', label: 'Waiting for review' },
            { value: 'APPROVED', label: 'Approved' },
            { value: 'REJECTED', label: 'Rejected' },
          ].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Toolbar>
      <ErrorBanner error={actionError} />
      <DataTable
        caption="Residence verification requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(v) => v.id}
        emptyTitle={decision === 'PENDING' ? 'Nothing to review' : 'No requests'}
        emptyBody={decision === 'PENDING' ? 'New registrations appear here once the resident uploads their document.' : undefined}
        columns={[
          {
            header: 'Resident',
            cell: (v) => (
              <>
                <strong>{v.resident.fullName ?? 'Name not added'}</strong>
                <div className="muted">{v.resident.phone}</div>
              </>
            ),
          },
          {
            header: 'Flat',
            cell: (v) => (
              <>
                <div>{flatLabel(v.membership)}</div>
                <div className="muted">{v.membership.occupancy === 'OWNER' ? 'Owner' : 'Tenant'}</div>
                {v.flatHasPrimary && v.decision === 'PENDING' ? <span className="badge badge-warning">Flat already has a Primary Resident</span> : null}
              </>
            ),
          },
          {
            header: 'Document',
            cell: (v) => (
              <>
                <div>{RESIDENCE_DOC_LABELS[v.document.docType]}</div>
                <Button variant="ghost" onClick={() => openDoc.mutate(v.document.id)} busy={openDoc.isPending && openDoc.variables === v.document.id}>
                  Open {v.document.fileName}
                </Button>
              </>
            ),
          },
          { header: 'Submitted', cell: (v) => formatDateTime(v.createdAt) },
          {
            header: decision === 'PENDING' ? 'Actions' : 'Decision',
            className: 'actions',
            cell: (v) =>
              v.decision === 'PENDING' ? (
                decide ? (
                  <div className="row">
                    <Button onClick={() => approve.mutate(v.id)} busy={approve.isPending && approve.variables === v.id} disabled={v.flatHasPrimary}>
                      Approve
                    </Button>
                    <Button variant="secondary" onClick={() => setRejecting(v)}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="muted">View only</span>
                )
              ) : (
                <>
                  <StatusBadge status={v.decision} />
                  {v.reason ? <div className="muted">{v.reason}</div> : null}
                  <div className="muted">{formatDateTime(v.reviewedAt)}</div>
                </>
              ),
          },
        ]}
      />
      {rejecting ? <RejectDialog request={rejecting} onClose={() => setRejecting(null)} /> : null}
    </>
  );
}

function RejectDialog({ request, onClose }: { request: VerificationRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(
    request.flatHasPrimary ? 'This flat already has a Primary Resident. Ask them to add you as a family member.' : '',
  );
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/residence-verifications/${request.id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['verifications'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title="Reject registration"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={save.isPending} onClick={() => save.mutate()} disabled={reason.trim().length < 3}>
            Reject
          </Button>
        </>
      }
    >
      <InfoBanner>The resident sees this reason in the app and can register again with a new document.</InfoBanner>
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={err?.field('reason')} />
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}
