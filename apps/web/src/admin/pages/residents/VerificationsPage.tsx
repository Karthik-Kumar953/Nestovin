'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RESIDENCE_DOC_LABELS, type VerificationRequest } from '@nestovin/contracts';
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
import { CircleCheck, CircleX, Clock, ExternalLink, FileText, Hourglass, ShieldAlert, User } from '../../components/icons';
import { flatLabel, occupancyLabel, QUEUE_LIMIT, useOpenDocument, usePendingQueue, waitingFor } from './shared';

type Decision = 'PENDING' | 'APPROVED' | 'REJECTED';
const PRIMARY_TAKEN = 'This flat already has a Primary Resident. Ask them to add you as a family member.';

/**
 * ADM-05 residence verification queue. One document, reviewed manually
 * (ADR-012). Registrations appear once the resident has uploaded the document.
 */
export function VerificationsPage() {
  const [decision, setDecision] = useState<Decision>('PENDING');
  const list = useQuery({
    queryKey: ['verifications', decision],
    queryFn: () => api<{ items: VerificationRequest[] }>(`/v1/admin/residence-verifications${qs({ decision, limit: QUEUE_LIMIT })}`),
  });
  const pending = usePendingQueue<VerificationRequest>('verifications', `/v1/admin/residence-verifications${qs({ decision: 'PENDING', limit: QUEUE_LIMIT })}`);
  const blocked = pending.items?.filter((v) => v.flatHasPrimary).length ?? 0;
  const [openId, setOpenId] = useState<string | null>(null);
  const open = list.data?.items.find((v) => v.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Residence verification"
        description="Check the uploaded document against the flat. The first verified resident of a flat becomes its Primary Resident."
      />
      <Facts
        items={[
          { label: 'Waiting for review', value: pending.count, tone: pending.n > 0 ? 'amber' : undefined, icon: Hourglass },
          { label: 'Oldest waiting', value: waitingFor(pending.oldest), note: pending.oldest ? `Since ${formatDate(pending.oldest)}` : undefined, icon: Clock },
          {
            label: 'Flat already has a Primary',
            value: blocked,
            note: blocked ? 'Cannot be approved' : undefined,
            tone: blocked ? 'red' : undefined,
            icon: ShieldAlert,
          },
        ]}
      />
      <Tabs
        label="Decision"
        value={decision}
        onChange={setDecision}
        items={[
          { value: 'PENDING', label: 'Waiting for review', count: pending.items ? pending.n : undefined },
          { value: 'APPROVED', label: 'Approved' },
          { value: 'REJECTED', label: 'Rejected' },
        ]}
      />
      <Panel flush>
        <DataTable
          flush
          caption="Residence verification requests"
          loading={list.isLoading}
          error={list.error}
          rows={list.data?.items}
          rowKey={(v) => v.id}
          onRowClick={(v) => setOpenId(v.id)}
          emptyTitle={decision === 'PENDING' ? 'Nothing to review' : decision === 'APPROVED' ? 'No approved registrations' : 'No rejected registrations'}
          emptyBody={decision === 'PENDING' ? 'New registrations appear here once the resident uploads their document.' : undefined}
          columns={[
            {
              header: 'Resident',
              cell: (v) => (
                <span className="primary-cell">
                  {v.resident.fullName ?? <span className="muted">Name not added</span>}
                  <span className="sub">{v.resident.phone}</span>
                </span>
              ),
            },
            {
              header: 'Flat',
              cell: (v) => (
                <span className="primary-cell">
                  {flatLabel(v.membership)}
                  <span className="sub">{occupancyLabel(v.membership.occupancy)}</span>
                </span>
              ),
            },
            { header: 'Document', cell: (v) => RESIDENCE_DOC_LABELS[v.document.docType] },
            { header: decision === 'PENDING' ? 'Submitted' : 'Reviewed', cell: (v) => formatDate(decision === 'PENDING' ? v.createdAt : v.reviewedAt) },
            {
              header: 'Status',
              cell: (v) =>
                v.decision === 'PENDING' && v.flatHasPrimary ? (
                  <span className="badge badge-error">Flat has a Primary</span>
                ) : (
                  <StatusBadge status={v.decision} />
                ),
            },
          ]}
        />
      </Panel>
      <VerificationDrawer request={open} onClose={() => setOpenId(null)} />
    </>
  );
}

function VerificationDrawer({ request: v, onClose }: { request: VerificationRequest | null; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const openDoc = useOpenDocument();
  const decide = can(me, 'residents', 'approve');
  const done = async (msg: string) => {
    toast(msg);
    await qc.invalidateQueries({ queryKey: ['verifications'] });
    onClose();
  };
  const approve = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/residence-verifications/${id}/approve`, { method: 'POST' }),
    onSuccess: () => done('Residence verified'),
  });
  const reject = useMutation({
    mutationFn: (p: { id: string; reason: string }) => api(`/v1/admin/residence-verifications/${p.id}/reject`, { method: 'POST', body: { reason: p.reason } }),
    onSuccess: () => done('Registration rejected'),
  });

  const name = v ? (v.resident.fullName ?? v.resident.phone) : '';
  const onApprove = async () => {
    if (!v) return;
    const r = await confirm({
      title: `Verify ${name}?`,
      body: `${name} becomes a verified ${occupancyLabel(v.membership.occupancy).toLowerCase()} at ${flatLabel(v.membership)}. As the first verified resident of this flat they become its Primary Resident.`,
      confirmLabel: 'Approve',
    });
    if (r.ok) approve.mutate(v.id);
  };
  const onReject = async () => {
    if (!v) return;
    const r = await confirm({
      title: `Reject ${name}'s registration?`,
      body: (
        <>
          The resident sees this reason in the app and can register again with a new document.
          {v.flatHasPrimary ? <p className="muted">Suggested reason: “{PRIMARY_TAKEN}”</p> : null}
        </>
      ),
      confirmLabel: 'Reject registration',
      tone: 'danger',
      reason: { label: 'Reason (shown to the resident)', required: true, minLength: 3 },
    });
    if (r.ok) reject.mutate({ id: v.id, reason: r.reason });
  };

  return (
    <Drawer
      open={Boolean(v)}
      onClose={onClose}
      title={v ? name : 'Registration'}
      subtitle={v ? flatLabel(v.membership) : undefined}
      footer={
        v && v.decision === 'PENDING' && decide ? (
          <>
            <Button variant="danger" icon={CircleX} busy={reject.isPending} onClick={onReject}>
              Reject
            </Button>
            <Button icon={CircleCheck} busy={approve.isPending} disabled={v.flatHasPrimary} onClick={onApprove}>
              Approve
            </Button>
          </>
        ) : undefined
      }
    >
      {v ? (
        <div className="stack">
          <ErrorBanner error={approve.error ?? reject.error} />
          {v.decision === 'PENDING' && v.flatHasPrimary ? (
            <InfoBanner tone="warning">This flat already has a verified Primary Resident, so this registration cannot be approved. Reject it and ask the resident to be added as a family member.</InfoBanner>
          ) : null}
          {v.decision === 'PENDING' && !decide ? <InfoBanner>You can view this request. Approving or rejecting needs the residents approve permission.</InfoBanner> : null}
          <dl className="details">
            <div>
              <dt>Resident</dt>
              <dd>
                {v.resident.fullName ?? 'Name not added'}
                <div className="muted">{v.resident.phone}</div>
              </dd>
            </div>
            <div>
              <dt>Flat</dt>
              <dd>{flatLabel(v.membership)}</dd>
            </div>
            <div>
              <dt>Occupancy</dt>
              <dd>{occupancyLabel(v.membership.occupancy)}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{formatDateTime(v.createdAt)}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>
                <StatusBadge status={v.decision} />
                {v.reviewedAt ? <div className="muted">{formatDateTime(v.reviewedAt)}</div> : null}
              </dd>
            </div>
            {v.reason ? (
              <div>
                <dt>Reason given</dt>
                <dd>{v.reason}</dd>
              </div>
            ) : null}
          </dl>

          <section>
            <h3 className="section-title">Document</h3>
            <div className="card row-between">
              <div className="row" style={{ minWidth: 0 }}>
                <FileText size={18} aria-hidden />
                <span className="primary-cell" style={{ minWidth: 0 }}>
                  <strong>{RESIDENCE_DOC_LABELS[v.document.docType]}</strong>
                  <div className="muted" style={{ overflowWrap: 'anywhere' }}>
                    {v.document.fileName}
                  </div>
                </span>
              </div>
              <Button variant="secondary" size="sm" icon={ExternalLink} busy={openDoc.isPending} onClick={() => openDoc.mutate(v.document.id)}>
                Open
              </Button>
            </div>
            <p className="faint">Opens a private link that expires after a few minutes. Opening is recorded.</p>
          </section>

          {can(me, 'residents') ? (
            <div>
              <ButtonLink to={`/residents?open=${v.resident.id}`} variant="ghost" size="sm" icon={User}>
                View resident
              </ButtonLink>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
