'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, Spinner, TextArea, Toolbar } from '../../components/ui';
import { Pill } from '../demand/shared';

interface Offer {
  id: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  visit: { occurrenceId: string; scheduledDate: string; startsAt: string | null; serviceName: string; flat: { flatNumber: string; towerName: string; communityName: string } };
  responses: { employeeId: string; employeeCode: string; fullName: string; response: 'PENDING' | 'ACCEPTED' | 'REJECTED'; respondedAt: string | null }[];
  confirmedEmployeeId: string | null;
}

const RESPONSE: Record<string, string> = { PENDING: 'No reply yet', ACCEPTED: 'Accepted', REJECTED: 'Declined' };

/** EMP-08: additional work offers. Acceptance alone is not an assignment; an admin confirms one worker. */
export function OvertimePage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const list = useQuery({ queryKey: ['overtime', status], queryFn: () => api<{ items: Offer[] }>(`/v1/admin/overtime-offers${qs({ status })}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['overtime'] });
  const confirm = useMutation({ mutationFn: (v: { id: string; employeeId: string }) => api(`/v1/admin/overtime-offers/${v.id}/confirm`, { method: 'POST', body: { employeeId: v.employeeId } }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => api(`/v1/admin/overtime-offers/${id}/cancel`, { method: 'POST' }), onSuccess: refresh });
  return (
    <>
      <PageHeader title="Overtime offers" description="Additional visits offered to workers. Confirm one worker who accepted to put the visit in their schedule. Pay for overtime is added in payroll as an authorised entry until a rate is approved." />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Open</option>
          <option value="FILLED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </Toolbar>
      <ErrorBanner error={confirm.error ?? cancel.error} />
      <DataTable
        caption="Overtime offers"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(o) => o.id}
        emptyTitle="No offers"
        emptyBody="Offer overtime from Visits, on a visit without a worker."
        columns={[
          { header: 'Visit', cell: (o) => <>{o.visit.scheduledDate} {o.visit.startsAt ? new Date(o.visit.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}<div className="muted">{o.visit.serviceName} · {o.visit.flat.towerName} {o.visit.flat.flatNumber}</div>{o.note ? <div className="muted">{o.note}</div> : null}</> },
          {
            header: 'Workers',
            cell: (o) =>
              o.responses.map((r) => (
                <div key={r.employeeId} className="row">
                  <span>{r.fullName} <span className="muted">{r.employeeCode}</span></span>
                  <Pill status={r.response === 'ACCEPTED' ? 'ACTIVE' : r.response === 'REJECTED' ? 'CANCELLED' : 'AWAITING_PAYMENT'} label={o.confirmedEmployeeId === r.employeeId ? 'Confirmed' : RESPONSE[r.response]} />
                  {o.status === 'OPEN' && r.response === 'ACCEPTED' && can(me, 'allocation', 'approve') ? (
                    <Button busy={confirm.isPending && confirm.variables?.employeeId === r.employeeId} onClick={() => confirm.mutate({ id: o.id, employeeId: r.employeeId })}>Confirm</Button>
                  ) : null}
                </div>
              )),
          },
          { header: 'Offered', cell: (o) => formatDateTime(o.createdAt) },
          { header: '', className: 'actions', cell: (o) => (o.status === 'OPEN' && can(me, 'allocation', 'edit') ? <Button variant="ghost" onClick={() => cancel.mutate(o.id)}>Cancel offer</Button> : <Pill status={o.status === 'FILLED' ? 'ACTIVE' : 'CANCELLED'} label={o.status === 'FILLED' ? 'Confirmed' : 'Cancelled'} />) },
        ]}
      />
    </>
  );
}

/** Dialog used from Visits: choose eligible workers to offer an uncovered visit to. */
export function OfferOvertimeDialog({ occurrenceId, title, onClose }: { occurrenceId: string; title: string; onClose: () => void }) {
  const qc = useQueryClient();
  const cands = useQuery({
    queryKey: ['overtime-candidates', occurrenceId],
    queryFn: () => api<{ eligible: { employeeId: string; employeeCode: string; fullName: string }[]; excluded: { employeeId: string; fullName: string; reasons: string[] }[] }>(`/v1/admin/visits/${occurrenceId}/overtime-candidates`),
  });
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const offer = useMutation({
    mutationFn: () => api(`/v1/admin/visits/${occurrenceId}/overtime-offers`, { method: 'POST', body: { employeeIds: chosen, note: note.trim() || undefined } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['overtime'] });
      onClose();
    },
  });
  return (
    <Modal
      open
      wide
      title={`Offer overtime – ${title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={chosen.length === 0} busy={offer.isPending} onClick={() => offer.mutate()}>Send offer ({chosen.length})</Button>
        </>
      }
    >
      <InfoBanner>Workers can accept or decline in the Worker app. You then confirm one of those who accepted.</InfoBanner>
      {cands.isLoading ? <Spinner /> : null}
      <ErrorBanner error={cands.error ?? offer.error} />
      {(cands.data?.eligible ?? []).map((c) => (
        <label key={c.employeeId} className="checkbox">
          <input type="checkbox" checked={chosen.includes(c.employeeId)} onChange={(e) => setChosen(e.target.checked ? [...chosen, c.employeeId] : chosen.filter((x) => x !== c.employeeId))} />
          <span>{c.fullName} <span className="muted">{c.employeeCode}</span></span>
        </label>
      ))}
      {cands.data && cands.data.eligible.length === 0 ? <p className="muted">Nobody can take this visit: {cands.data.excluded.map((x) => `${x.fullName} (${x.reasons.join(', ')})`).join('; ')}</p> : null}
      <TextArea label="Note to workers (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}
