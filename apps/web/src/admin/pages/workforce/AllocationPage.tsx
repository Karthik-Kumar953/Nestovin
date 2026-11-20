'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationNeed, Candidates, Occurrence } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, InfoBanner, Modal, PageHeader, Spinner, TextArea, Toolbar } from '../../components/ui';
import { CommunityPicker, daysLabel, Pill, useSelectedCommunity } from '../demand/shared';
import { OfferOvertimeDialog } from './OvertimePage';

/** ADM-11: give every paid service a standing worker. No ranking (OPEN): pick from the eligible list. */
export function AllocationPage() {
  const me = useMe();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const [unassigned, setUnassigned] = useState(true);
  const needs = useQuery({
    queryKey: ['allocation-needs', communityId, unassigned],
    queryFn: () => api<{ items: AllocationNeed[] }>(`/v1/admin/allocation/needs${qs({ communityId, unassigned: String(unassigned) })}`),
    enabled: Boolean(communityId),
  });
  const [choosing, setChoosing] = useState<AllocationNeed | null>(null);
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Allocation" description="Each paid service needs a standing worker. The service becomes active once every part of it is staffed. Only eligible workers are offered." />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <label className="checkbox">
          <input type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} />
          <span>Only services without a worker</span>
        </label>
      </Toolbar>
      <DataTable
        caption="Services to staff"
        loading={needs.isLoading}
        error={needs.error}
        rows={needs.data?.items}
        rowKey={(n) => n.componentId}
        emptyTitle={unassigned ? 'Every service has a worker' : 'No current services'}
        columns={[
          { header: 'Household', cell: (n) => <><strong>{n.residentName ?? 'Resident'}</strong><div className="muted">{n.flat.towerName} · {n.flat.flatNumber}</div></> },
          { header: 'Service', cell: (n) => <>{n.serviceName}<div className="muted">{n.startTime} · {n.durationMinutes} min · {daysLabel(n.daysOfWeek)}</div></> },
          { header: 'Period', cell: (n) => `${n.periodStart} → ${n.periodEnd}` },
          { header: 'Standing worker', cell: (n) => (n.standing ? <>{n.standing.employeeName}<div className="muted">{n.standing.employeeCode} · from {n.standing.effectiveFrom}</div></> : <Pill status="OPEN" label="Needs a worker" />) },
          {
            header: 'Actions',
            className: 'actions',
            cell: (n) => (can(me, 'allocation', 'approve') ? <Button variant={n.standing ? 'secondary' : 'primary'} onClick={() => setChoosing(n)}>{n.standing ? 'Replace' : 'Assign'}</Button> : null),
          },
        ]}
      />
      {choosing ? <CandidatesDialog need={choosing} onClose={() => setChoosing(null)} /> : null}
    </>
  );
}

function CandidatesDialog({ need, onClose }: { need: AllocationNeed; onClose: () => void }) {
  const qc = useQueryClient();
  const cands = useQuery({ queryKey: ['candidates', need.componentId], queryFn: () => api<Candidates>(`/v1/admin/allocation/components/${need.componentId}/candidates`) });
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ assignedVisits: number; gaps: string[] } | null>(null);
  const confirm = useMutation({
    mutationFn: (employeeId: string) =>
      api<{ assignedVisits: number; gaps: string[] }>(`/v1/admin/allocation/components/${need.componentId}/standing`, { method: 'POST', body: { employeeId, reason: reason || undefined } }),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: ['allocation-needs'] });
      await qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  return (
    <Modal open wide title={`${need.standing ? 'Replace' : 'Assign'} worker – ${need.serviceName}, ${need.flat.towerName} ${need.flat.flatNumber}`} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {result ? (
        <InfoBanner tone={result.gaps.length ? 'warning' : 'success'}>
          Assigned to {result.assignedVisits} upcoming visit(s).
          {result.gaps.length ? ` Some days could not be assigned and are shown as gaps under Visits: ${result.gaps.join('; ')}.` : ''}
        </InfoBanner>
      ) : null}
      {need.standing ? <TextArea label="Reason for the permanent replacement" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
      {cands.isLoading ? <Spinner /> : null}
      <ErrorBanner error={cands.error ?? confirm.error} />
      {cands.data ? (
        <>
          <h3 className="section-title">Eligible</h3>
          <DataTable
            caption="Eligible workers"
            rows={cands.data.eligible}
            rowKey={(c) => c.employeeId}
            emptyTitle="No eligible workers"
            emptyBody="Check readiness, qualifications, availability and cluster under Employees."
            columns={[
              { header: 'Worker', cell: (c) => <><strong>{c.fullName}</strong><div className="muted">{c.employeeCode}</div></> },
              { header: 'Current services', className: 'num', cell: (c) => c.currentStandingCount },
              { header: 'Date conflicts', cell: (c) => (c.conflicts.length ? <span className="muted">{c.conflicts.join('; ')}</span> : 'None') },
              {
                header: '',
                className: 'actions',
                cell: (c) =>
                  c.employeeId === need.standing?.employeeId ? <span className="muted">Current</span> : (
                    <Button busy={confirm.isPending && confirm.variables === c.employeeId} disabled={Boolean(result)} onClick={() => confirm.mutate(c.employeeId)}>
                      Confirm
                    </Button>
                  ),
              },
            ]}
          />
          {cands.data.excluded.length ? (
            <>
              <h3 className="section-title">Not eligible</h3>
              <DataTable
                caption="Workers not eligible"
                rows={cands.data.excluded}
                rowKey={(c) => c.employeeId}
                columns={[
                  { header: 'Worker', cell: (c) => <>{c.fullName}<div className="muted">{c.employeeCode}</div></> },
                  { header: 'Why', cell: (c) => c.reasons.join('; ') },
                ]}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

/** Upcoming visits with gaps and one-day replacement. */
export function VisitsPage() {
  const me = useMe();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [gapsOnly, setGapsOnly] = useState(false);
  const visits = useQuery({
    queryKey: ['visits', communityId, from, gapsOnly],
    queryFn: () => api<{ items: Occurrence[] }>(`/v1/admin/visits${qs({ communityId, from, unassigned: String(gapsOnly) })}`),
    enabled: Boolean(communityId),
  });
  const [replacing, setReplacing] = useState<Occurrence | null>(null);
  const [offering, setOffering] = useState<Occurrence | null>(null);
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Visits" description="The next 7 days of visits. Gaps (no worker) need a one-day cover; permanent changes are made under Allocation." />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <input className="input input-compact" type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="checkbox">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
          <span>Only gaps</span>
        </label>
      </Toolbar>
      <DataTable
        caption="Visits"
        loading={visits.isLoading}
        error={visits.error}
        rows={visits.data?.items}
        rowKey={(v) => v.id}
        emptyTitle={gapsOnly ? 'No gaps' : 'No visits in this period'}
        columns={[
          { header: 'When', cell: (v) => <>{v.scheduledDate}<div className="muted">{v.startsAt ? new Date(v.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : `Visit ${v.visitNo}: time to be set`}</div></> },
          { header: 'Household', cell: (v) => <>{v.residentName ?? 'Resident'}<div className="muted">{v.flat.towerName} · {v.flat.flatNumber}</div></> },
          { header: 'Service', cell: (v) => v.serviceName },
          { header: 'Worker', cell: (v) => (v.assignment ? <>{v.assignment.employeeName}<div className="muted">{v.assignment.employeeCode} · {v.assignment.source.toLowerCase()}</div></> : <Pill status="REVIEW_REQUIRED" label="No worker" />) },
          { header: 'Status', cell: (v) => <Pill status={v.status} /> },
          {
            header: '',
            className: 'actions',
            cell: (v) =>
              can(me, 'allocation', 'edit') && ['SCHEDULED', 'ASSIGNED'].includes(v.status) && v.startsAt ? (
                <div className="row">
                  <Button variant="secondary" onClick={() => setReplacing(v)}>{v.assignment ? 'Replace' : 'Cover'}</Button>
                  {!v.assignment && can(me, 'allocation', 'create') ? <Button variant="ghost" onClick={() => setOffering(v)}>Offer overtime</Button> : null}
                </div>
              ) : null,
          },
        ]}
      />
      {replacing ? <ReplaceDialog visit={replacing} onClose={() => setReplacing(null)} /> : null}
      {offering ? <OfferOvertimeDialog occurrenceId={offering.id} title={`${offering.scheduledDate}, ${offering.flat.towerName} ${offering.flat.flatNumber}`} onClose={() => setOffering(null)} /> : null}
    </>
  );
}

function ReplaceDialog({ visit, onClose }: { visit: Occurrence; onClose: () => void }) {
  const qc = useQueryClient();
  const cands = useQuery({ queryKey: ['visit-candidates', visit.id], queryFn: () => api<Candidates>(`/v1/admin/visits/${visit.id}/candidates`) });
  const [reason, setReason] = useState('');
  const assign = useMutation({
    mutationFn: (employeeId: string) => api(`/v1/admin/visits/${visit.id}/assign`, { method: 'POST', body: { employeeId, reason } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['visits'] });
      onClose();
    },
  });
  return (
    <Modal open wide title={`${visit.assignment ? 'Replace' : 'Cover'} visit – ${visit.scheduledDate}, ${visit.flat.towerName} ${visit.flat.flatNumber}`} onClose={onClose} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the audit history." />
      {cands.isLoading ? <Spinner /> : null}
      <ErrorBanner error={cands.error ?? assign.error} />
      {cands.data ? (
        <DataTable
          caption="Eligible workers for this visit"
          rows={cands.data.eligible}
          rowKey={(c) => c.employeeId}
          emptyTitle="Nobody is free for this visit"
          emptyBody={cands.data.excluded.length ? cands.data.excluded.map((x) => `${x.fullName}: ${x.reasons.join(', ')}`).join(' · ') : undefined}
          columns={[
            { header: 'Worker', cell: (c) => <>{c.fullName}<div className="muted">{c.employeeCode}</div></> },
            { header: '', className: 'actions', cell: (c) => <Button disabled={reason.trim().length < 3} busy={assign.isPending && assign.variables === c.employeeId} onClick={() => assign.mutate(c.employeeId)}>Assign</Button> },
          ]}
        />
      ) : null}
    </Modal>
  );
}
