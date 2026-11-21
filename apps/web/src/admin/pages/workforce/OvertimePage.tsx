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
  ErrorBanner,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Skeleton,
  StatusBadge,
  Tabs,
  TextArea,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CalendarClock, Send } from '../../components/icons';
import { dayLabel, istTime } from './visits';

interface Offer {
  id: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  visit: { occurrenceId: string; scheduledDate: string; startsAt: string | null; serviceName: string; flat: { flatNumber: string; towerName: string; communityName: string } };
  responses: { employeeId: string; employeeCode: string; fullName: string; response: 'PENDING' | 'ACCEPTED' | 'REJECTED'; respondedAt: string | null }[];
  confirmedEmployeeId: string | null;
}

const RESPONSE: Record<Offer['responses'][number]['response'], { label: string; tone: string }> = {
  PENDING: { label: 'No reply yet', tone: 'neutral' },
  ACCEPTED: { label: 'Accepted', tone: 'teal' },
  REJECTED: { label: 'Declined', tone: 'neutral' },
};

const TABS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FILLED', label: 'Confirmed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const visitWhen = (o: Offer) => `${dayLabel(o.visit.scheduledDate)}${o.visit.startsAt ? `, ${istTime(o.visit.startsAt)}` : ''}`;

/** EMP-08: additional work offers. Acceptance alone is not an assignment; an admin confirms one worker. */
export function OvertimePage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<Tab>('OPEN');
  const list = useQuery({ queryKey: ['overtime', status], queryFn: () => api<{ items: Offer[] }>(`/v1/admin/overtime-offers${qs({ status })}`) });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['overtime'] });
    await qc.invalidateQueries({ queryKey: ['visits'] });
  };
  const confirm = useMutation({
    mutationFn: (v: { id: string; employeeId: string; name: string }) => api(`/v1/admin/overtime-offers/${v.id}/confirm`, { method: 'POST', body: { employeeId: v.employeeId } }),
    onSuccess: async (_r, v) => {
      toast(`${v.name} confirmed for the visit`);
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/overtime-offers/${id}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      toast('Offer cancelled');
      await refresh();
    },
  });

  async function confirmWorker(o: Offer, r: Offer['responses'][number]) {
    const res = await confirmDialog({
      title: `Confirm ${r.fullName} for this visit?`,
      body: `${o.visit.serviceName} at ${o.visit.flat.towerName} ${o.visit.flat.flatNumber}, ${visitWhen(o)}. The visit goes into ${r.fullName}’s schedule and the offer closes for everyone else. Pay is added in payroll manually.`,
      confirmLabel: 'Confirm worker',
    });
    if (res.ok) confirm.mutate({ id: o.id, employeeId: r.employeeId, name: r.fullName });
  }
  async function cancelOffer(o: Offer) {
    const res = await confirmDialog({
      title: 'Cancel this overtime offer?',
      body: `The offer for ${o.visit.serviceName} at ${o.visit.flat.towerName} ${o.visit.flat.flatNumber}, ${visitWhen(o)} is withdrawn from every worker it was sent to, including any who accepted. The visit stays without a worker. This can’t be undone; send a new offer if needed.`,
      confirmLabel: 'Cancel offer',
      tone: 'danger',
    });
    if (res.ok) cancel.mutate(o.id);
  }

  return (
    <>
      <PageHeader
        title="Overtime offers"
        description="Additional visits offered to workers. Confirm one worker who accepted to put the visit in their schedule."
        actions={
          <ButtonLink to="/allocation/visits?gaps=1" icon={CalendarClock}>
            Visits without a worker
          </ButtonLink>
        }
      />
      <div className="stack">
        <InfoBanner tone="warning">
          <strong>Manual — rates not decided yet.</strong> Overtime has no approved rate, so nothing is calculated here. Pay for confirmed overtime is
          added in payroll as an authorised entry.
        </InfoBanner>
        <Tabs label="Offer status" value={status} onChange={setStatus} items={TABS.map((t) => ({ ...t, count: t.value === status ? list.data?.items.length : undefined }))} />
        <ErrorBanner error={confirm.error ?? cancel.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Overtime offers"
            loading={list.isLoading}
            error={list.error}
            rows={list.data?.items}
            rowKey={(o) => o.id}
            emptyTitle={status === 'OPEN' ? 'No open offers' : 'No offers'}
            emptyBody="Offer overtime from Visits, on a visit without a worker."
            columns={[
              {
                header: 'Visit',
                cell: (o) => (
                  <span className="primary-cell">
                    {visitWhen(o)}
                    <span className="sub">
                      {o.visit.serviceName} · {o.visit.flat.towerName} {o.visit.flat.flatNumber} · {o.visit.flat.communityName}
                    </span>
                    {o.note ? <span className="sub">Note: {o.note}</span> : null}
                  </span>
                ),
              },
              {
                header: 'Workers',
                cell: (o) => (
                  <div className="stack-sm">
                    {o.responses.map((r) => {
                      const confirmed = o.confirmedEmployeeId === r.employeeId;
                      return (
                        <div key={r.employeeId} className="row" style={{ gap: 8 }}>
                          <span>
                            {r.fullName} <span className="muted">{r.employeeCode}</span>
                          </span>
                          <StatusBadge status={confirmed ? 'Confirmed' : RESPONSE[r.response].label} tone={confirmed ? 'success' : RESPONSE[r.response].tone} />
                          {o.status === 'OPEN' && r.response === 'ACCEPTED' && can(me, 'allocation', 'approve') ? (
                            <Button size="sm" busy={confirm.isPending && confirm.variables?.employeeId === r.employeeId && confirm.variables.id === o.id} onClick={() => void confirmWorker(o, r)}>
                              Confirm
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ),
              },
              { header: 'Offered', cell: (o) => formatDateTime(o.createdAt) },
              {
                header: 'Actions',
                className: 'actions',
                cell: (o) =>
                  o.status === 'OPEN' && can(me, 'allocation', 'edit') ? (
                    <Button variant="ghost" size="sm" busy={cancel.isPending && cancel.variables === o.id} onClick={() => void cancelOffer(o)}>
                      Cancel offer
                    </Button>
                  ) : (
                    <StatusBadge status={o.status === 'FILLED' ? 'Confirmed' : 'Cancelled'} tone={o.status === 'FILLED' ? 'success' : 'neutral'} />
                  ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

/** Dialog used from Visits: choose eligible workers to offer an uncovered visit to. */
export function OfferOvertimeDialog({ occurrenceId, title, onClose }: { occurrenceId: string; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const cands = useQuery({
    queryKey: ['overtime-candidates', occurrenceId],
    queryFn: () =>
      api<{ eligible: { employeeId: string; employeeCode: string; fullName: string }[]; excluded: { employeeId: string; fullName: string; reasons: string[] }[] }>(
        `/v1/admin/visits/${occurrenceId}/overtime-candidates`,
      ),
  });
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const offer = useMutation({
    mutationFn: () => api(`/v1/admin/visits/${occurrenceId}/overtime-offers`, { method: 'POST', body: { employeeIds: chosen, note: note.trim() || undefined } }),
    onSuccess: async () => {
      toast(`Offer sent to ${chosen.length} ${chosen.length === 1 ? 'worker' : 'workers'}`);
      await qc.invalidateQueries({ queryKey: ['overtime'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      wide
      title={`Offer overtime · ${title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Send} disabled={chosen.length === 0} busy={offer.isPending} onClick={() => offer.mutate()}>
            Send offer ({chosen.length})
          </Button>
        </>
      }
    >
      <div className="stack">
        <InfoBanner>
          Workers accept or decline in the Worker app; you then confirm one of those who accepted. Manual — rates not decided yet: pay is added in
          payroll.
        </InfoBanner>
        {cands.isLoading ? (
          <div className="stack-sm" aria-busy>
            <Skeleton height={18} />
            <Skeleton height={18} />
          </div>
        ) : null}
        <ErrorBanner error={cands.error ?? offer.error} />
        {cands.data?.eligible.length ? (
          <fieldset className="field">
            <legend className="field-label">Send to</legend>
            <div className="row">
              {cands.data.eligible.map((c) => (
                <label key={c.employeeId} className="checkbox chip">
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.employeeId)}
                    onChange={(e) => setChosen(e.target.checked ? [...chosen, c.employeeId] : chosen.filter((x) => x !== c.employeeId))}
                  />
                  <span>
                    {c.fullName} <span className="muted">{c.employeeCode}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {cands.data && cands.data.eligible.length === 0 ? <InfoBanner tone="warning">Nobody can take this visit.</InfoBanner> : null}
        {cands.data?.excluded.length ? (
          <details>
            <summary className="muted">Not eligible ({cands.data.excluded.length})</summary>
            <ul className="issue-list">
              {cands.data.excluded.map((x) => (
                <li key={x.employeeId}>
                  {x.fullName}: <span className="muted">{x.reasons.join(', ')}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <TextArea label="Note to workers (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </div>
    </Modal>
  );
}
