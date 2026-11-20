'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttendanceRecord, Correction } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, formatDateTime, InfoBanner, Modal, PageHeader, Spinner, TextArea, TextInput, Toolbar } from '../../components/ui';
import { CommunityPicker, Pill, useSelectedCommunity } from '../demand/shared';

const FLAG: Record<string, string> = {
  OUTSIDE_RADIUS: 'Outside the community radius',
  LOW_ACCURACY: 'Low GPS accuracy',
  NO_LOCATION: 'No location shared',
  NO_REFERENCE_PIN: 'Community has no map pin',
};

/** ADM-12: attendance outcomes, completion, no-shows and feedback. GPS flags are reviewed, never auto-rejected. */
export function AttendancePage() {
  const me = useMe();
  const qc = useQueryClient();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [flagged, setFlagged] = useState(true);
  const records = useQuery({
    queryKey: ['attendance', communityId, from, to, flagged],
    queryFn: () => api<{ items: AttendanceRecord[] }>(`/v1/admin/attendance${qs({ communityId, from, to, flagged: String(flagged) })}`),
    enabled: Boolean(communityId),
  });
  const [reviewing, setReviewing] = useState<AttendanceRecord | null>(null);
  const [noShow, setNoShow] = useState<AttendanceRecord | null>(null);
  const approve = can(me, 'attendance', 'approve');
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="Attendance" description="Check-ins verified with the resident’s code or QR. Location is supporting evidence only: flagged check-ins need a review." />
      <Toolbar>
        <ExportButton path={`/v1/admin/exports/attendance?from=${from}&to=${to}${communityId ? `&communityId=${communityId}` : ''}`} module="attendance" fileName="attendance.csv" />
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <input className="input input-compact" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input input-compact" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <label className="checkbox">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          <span>Only items needing attention</span>
        </label>
      </Toolbar>
      {approve && communityId ? <GeofenceSetting communityId={communityId} /> : null}
      <DataTable
        caption="Attendance records"
        loading={records.isLoading}
        error={records.error}
        rows={records.data?.items}
        rowKey={(r) => r.occurrenceId}
        emptyTitle={flagged ? 'Nothing needs attention' : 'No visits in this period'}
        columns={[
          { header: 'Visit', cell: (r) => <>{r.scheduledDate}<div className="muted">{r.startsAt ? new Date(r.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'} · {r.serviceName}</div></> },
          { header: 'Household', cell: (r) => `${r.flat.towerName} · ${r.flat.flatNumber}` },
          { header: 'Worker', cell: (r) => (r.worker ? <>{r.worker.fullName}<div className="muted">{r.worker.employeeCode}</div></> : <span className="muted">None</span>) },
          {
            header: 'Check-in',
            cell: (r) =>
              r.checkIn ? (
                <>
                  {formatDateTime(r.checkIn.at)} <span className="muted">({r.checkIn.method})</span>
                  {r.checkIn.flags.map((f) => (
                    <div key={f}><span className="badge badge-warning">{FLAG[f] ?? f}</span>{r.checkIn!.distanceM !== null && f === 'OUTSIDE_RADIUS' ? <span className="muted"> {r.checkIn!.distanceM} m</span> : null}</div>
                  ))}
                  {r.checkIn.reviewStatus !== 'NONE' && r.checkIn.reviewStatus !== 'OPEN' ? <div className="muted">Review: {r.checkIn.reviewStatus.toLowerCase()} – {r.checkIn.reviewNote}</div> : null}
                </>
              ) : (
                <span className="muted">{r.rejectedAttempts ? `${r.rejectedAttempts} rejected attempt(s)` : 'Not checked in'}</span>
              ),
          },
          { header: 'Outcome', cell: (r) => <>{r.noShow ? <Pill status="REVIEW_REQUIRED" label={r.noShow.kind === 'RESIDENT_ABSENT' ? 'Resident not available' : 'Worker did not come'} /> : <Pill status={r.status} />}{r.feedback ? <div className="muted">Rated {r.feedback.rating}/5</div> : null}</> },
          {
            header: '',
            className: 'actions',
            cell: (r) => (
              <div className="row">
                {approve && r.checkIn?.reviewStatus === 'OPEN' ? <Button variant="secondary" onClick={() => setReviewing(r)}>Review</Button> : null}
                {approve && !r.checkIn && !r.noShow && ['ASSIGNED', 'SCHEDULED'].includes(r.status) ? <Button variant="ghost" onClick={() => setNoShow(r)}>Worker no-show</Button> : null}
              </div>
            ),
          },
        ]}
      />
      {reviewing ? <ReviewDialog record={reviewing} onClose={() => setReviewing(null)} onDone={() => qc.invalidateQueries({ queryKey: ['attendance'] })} /> : null}
      {noShow ? <NoShowDialog record={noShow} onClose={() => setNoShow(null)} onDone={() => qc.invalidateQueries({ queryKey: ['attendance'] })} /> : null}
    </>
  );
}

function GeofenceSetting({ communityId }: { communityId: string }) {
  const [radius, setRadius] = useState('');
  const save = useMutation({ mutationFn: () => api(`/v1/admin/communities/${communityId}/geofence`, { method: 'PUT', body: { radiusM: Number(radius) } }), onSuccess: () => setRadius('') });
  return (
    <InfoBanner>
      Check-ins farther than the community radius (default 200 m) from its map pin are flagged for review.
      <span className="row">
        <input className="input input-compact" type="number" min={25} max={5000} placeholder="Radius (m)" aria-label="Geofence radius in metres" value={radius} onChange={(e) => setRadius(e.target.value)} />
        <Button variant="secondary" disabled={!radius} busy={save.isPending} onClick={() => save.mutate()}>Set radius</Button>
        {save.isSuccess ? <span className="muted">Saved</span> : null}
      </span>
      <ErrorBanner error={save.error} />
    </InfoBanner>
  );
}

function ReviewDialog({ record, onClose, onDone }: { record: AttendanceRecord; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: (decision: 'ACCEPTED' | 'REJECTED') => api(`/v1/admin/attendance/events/${record.checkIn!.eventId}/review`, { method: 'POST', body: { decision, note } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Review flagged check-in"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={note.trim().length < 3} busy={save.isPending} onClick={() => save.mutate('REJECTED')}>Reject</Button>
          <Button disabled={note.trim().length < 3} busy={save.isPending} onClick={() => save.mutate('ACCEPTED')}>Accept</Button>
        </>
      }
    >
      <p>
        {record.worker?.fullName} checked in at {record.flat.towerName} {record.flat.flatNumber} with the resident’s {record.checkIn!.method}.{' '}
        {record.checkIn!.distanceM !== null ? `The phone was ${record.checkIn!.distanceM} m from the community pin` : 'No location was shared'}
        {record.checkIn!.accuracyM !== null ? ` (accuracy ${record.checkIn!.accuracyM} m).` : '.'}
      </p>
      <InfoBanner>The resident’s code proves presence at the flat; GPS is supporting evidence. Rejecting marks the visit as an exception.</InfoBanner>
      <TextArea label="Note" required value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBanner error={save.error} />
    </Modal>
  );
}

function NoShowDialog({ record, onClose, onDone }: { record: AttendanceRecord; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/v1/admin/visits/${record.occurrenceId}/worker-no-show`, { method: 'POST', body: { note } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Record worker no-show"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={note.trim().length < 3} busy={save.isPending} onClick={() => save.mutate()}>Record no-show</Button>
        </>
      }
    >
      <InfoBanner tone="warning">Records that {record.worker?.fullName ?? 'the worker'} did not come. Service-day deduction rules are not applied yet (pending approval).</InfoBanner>
      <TextInput label="Visit" value={`${record.scheduledDate} · ${record.flat.towerName} ${record.flat.flatNumber}`} readOnly />
      <TextArea label="What happened" required value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBanner error={save.error} />
    </Modal>
  );
}

/** ADM-12A: worker correction requests. The original evidence is never changed. */
export function CorrectionsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const list = useQuery({ queryKey: ['corrections', status], queryFn: () => api<{ items: Correction[] }>(`/v1/admin/attendance-corrections?status=${status}`) });
  const [deciding, setDeciding] = useState<{ c: Correction; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const decide = useMutation({
    mutationFn: () => api(`/v1/admin/attendance-corrections/${deciding!.c.id}/decide`, { method: 'POST', body: { decision: deciding!.decision, note } }),
    onSuccess: async () => {
      setDeciding(null);
      setNote('');
      await qc.invalidateQueries({ queryKey: ['corrections'] });
    },
  });
  return (
    <>
      <PageHeader title="Attendance corrections" description="Workers ask for a correction when a check-in or completion could not be recorded. The original record stays; your decision is added to the history." />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="PENDING">Waiting for review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </Toolbar>
      <DataTable
        caption="Correction requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(c) => c.id}
        emptyTitle="No correction requests"
        columns={[
          { header: 'Worker', cell: (c) => <>{c.worker.fullName}<div className="muted">{c.worker.employeeCode}</div></> },
          { header: 'Visit', cell: (c) => <>{c.scheduledDate}<div className="muted">{c.flat.towerName} · {c.flat.flatNumber}</div></> },
          { header: 'Asks to', cell: (c) => (c.requestedChange === 'MARK_ATTENDED' ? 'Mark as attended' : 'Mark as completed') },
          { header: 'Explanation', cell: (c) => <span className="prewrap">{c.explanation}</span> },
          { header: 'Original record', cell: (c) => (c.originalEvent ? <>{c.originalEvent.result.toLowerCase()} {c.originalEvent.flags.join(', ')}<div className="muted">{formatDateTime(c.originalEvent.at)}</div></> : <span className="muted">No check-in attempt</span>) },
          {
            header: '',
            className: 'actions',
            cell: (c) =>
              c.status === 'PENDING' && can(me, 'attendance', 'approve') ? (
                <div className="row">
                  <Button onClick={() => setDeciding({ c, decision: 'APPROVED' })}>Approve</Button>
                  <Button variant="ghost" onClick={() => setDeciding({ c, decision: 'REJECTED' })}>Reject</Button>
                </div>
              ) : (
                <span className="muted">{c.reviewNote}</span>
              ),
          },
        ]}
      />
      {deciding ? (
        <Modal
          open
          title={deciding.decision === 'APPROVED' ? 'Approve correction' : 'Reject correction'}
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
          <TextArea label="Note (sent to the worker)" required value={note} onChange={(e) => setNote(e.target.value)} />
          <ErrorBanner error={decide.error} />
        </Modal>
      ) : null}
    </>
  );
}
