'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttendanceRecord, Community, Correction } from '@nestovin/contracts';
import { api, qs } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  ButtonLink,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Facts,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  Segmented,
  Spinner,
  StatusBadge,
  Tabs,
  TextArea,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import { CircleAlert, ClipboardCheck, LocateFixed, MapPin, Pencil, Star, UserX } from '../../components/icons';
import { CommunityPicker, useSelectedCommunity } from '../demand/shared';
import type { AuditEntry } from '../../components/RecordHistory';
import { addDays, dayLabel, istDate, istTime, Stars } from './visits';

const FLAG: Record<string, string> = {
  OUTSIDE_RADIUS: 'Outside the community radius',
  LOW_ACCURACY: 'Low GPS accuracy',
  NO_LOCATION: 'No location shared',
  NO_REFERENCE_PIN: 'Community has no map pin',
};

const DEFAULT_RADIUS_M = 200;

function outcome(r: AttendanceRecord): { label: string; tone: string } {
  if (r.noShow) return { label: r.noShow.kind === 'RESIDENT_ABSENT' ? 'Resident not available' : 'Worker did not come', tone: 'error' };
  if (r.checkIn?.reviewStatus === 'OPEN') return { label: 'Needs review', tone: 'warning' };
  if (r.completedAt || r.status === 'COMPLETED') return { label: 'Completed', tone: 'success' };
  if (r.checkIn) return { label: 'Checked in', tone: 'teal' };
  return { label: r.status.charAt(0) + r.status.slice(1).toLowerCase().replace(/_/g, ' '), tone: 'neutral' };
}

/** ADM-12: attendance outcomes, completion, no-shows and feedback. GPS flags are reviewed, never auto-rejected. */
export function AttendancePage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [communityId, setCommunityId, communities, loading] = useSelectedCommunity();
  const today = istDate(0);
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(today);
  const [show, setShow] = useState<'attention' | 'all'>('attention');
  const flagged = show === 'attention';
  const rangeOk = Boolean(from && to && to >= from);
  const records = useQuery({
    queryKey: ['attendance', communityId, from, to, flagged],
    queryFn: () => api<{ items: AttendanceRecord[] }>(`/v1/admin/attendance${qs({ communityId, from, to, flagged: String(flagged) })}`),
    enabled: Boolean(communityId) && rangeOk,
  });
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [reviewing, setReviewing] = useState<AttendanceRecord | null>(null);
  const approve = can(me, 'attendance', 'approve');
  const refresh = () => qc.invalidateQueries({ queryKey: ['attendance'] });
  const noShow = useMutation({
    mutationFn: (v: { r: AttendanceRecord; note: string }) => api(`/v1/admin/visits/${v.r.occurrenceId}/worker-no-show`, { method: 'POST', body: { note: v.note } }),
    onSuccess: async (_x, v) => {
      toast(`No-show recorded for ${v.r.worker?.fullName ?? 'the worker'}`);
      setSelected(null);
      await refresh();
    },
  });
  async function recordNoShow(r: AttendanceRecord) {
    const res = await confirm({
      title: `Record that ${r.worker?.fullName ?? 'the worker'} did not come?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {r.serviceName} at {r.flat.towerName} {r.flat.flatNumber}, {dayLabel(r.scheduledDate)}
            {r.startsAt ? ` at ${istTime(r.startsAt)}` : ''}. The visit is closed as a worker no-show and can’t be checked in afterwards.
          </p>
          <p style={{ margin: 0 }} className="muted">
            Service-day deduction rules are not applied yet (pending approval).
          </p>
        </div>
      ),
      confirmLabel: 'Record no-show',
      tone: 'danger',
      reason: { label: 'What happened', required: true, minLength: 3 },
    });
    if (res.ok) noShow.mutate({ r, note: res.reason });
  }
  const canNoShow = (r: AttendanceRecord) => approve && !r.checkIn && !r.noShow && ['ASSIGNED', 'SCHEDULED'].includes(r.status);

  if (loading) return <Spinner />;
  const rows = records.data?.items;
  const openReviews = rows?.filter((r) => r.checkIn?.reviewStatus === 'OPEN').length ?? 0;
  const noShows = rows?.filter((r) => r.noShow).length ?? 0;
  const rejected = rows?.reduce((n, r) => n + r.rejectedAttempts, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check-ins verified with the resident’s code or QR. Location is supporting evidence only: flagged check-ins need a review."
        actions={
          <>
            <ExportButton
              path={`/v1/admin/exports/attendance?from=${from}&to=${to}${communityId ? `&communityId=${communityId}` : ''}`}
              module="attendance"
              fileName="attendance.csv"
            />
            <ButtonLink to="/attendance/corrections" icon={ClipboardCheck}>
              Corrections
            </ButtonLink>
            <ButtonLink to={`/attendance/feedback${communityId ? `?communityId=${communityId}` : ''}`} icon={Star}>
              Feedback
            </ButtonLink>
          </>
        }
      />
      {!communities?.length ? (
        <EmptyState title="No communities yet" icon={MapPin}>
          Add a community under Locations first.
        </EmptyState>
      ) : (
        <div className="stack">
          <Toolbar>
            <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <input className="input input-compact" type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="muted" aria-hidden>
                –
              </span>
              <input className="input input-compact" type="date" aria-label="To date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
            </span>
            <Segmented
              label="Which records"
              value={show}
              onChange={setShow}
              items={[
                { value: 'attention', label: 'Needs attention' },
                { value: 'all', label: 'All visits' },
              ]}
            />
          </Toolbar>
          {!rangeOk ? <InfoBanner tone="warning">The To date must be on or after the From date.</InfoBanner> : null}
          {communityId ? <GeofencePanel communityId={communityId} canEdit={approve} /> : null}
          {rows ? (
            <Facts
              items={[
                { label: flagged ? 'Need attention' : 'Visits', value: rows.length, icon: ClipboardCheck },
                { label: 'Flagged check-ins', value: openReviews, note: 'Waiting for review', tone: openReviews ? 'amber' : undefined, icon: CircleAlert },
                { label: 'No-shows', value: noShows, tone: noShows ? 'red' : undefined, icon: UserX },
                { label: 'Rejected attempts', value: rejected, note: 'Wrong or expired code', icon: LocateFixed },
              ]}
            />
          ) : null}
          <ErrorBanner error={noShow.error} />
          <Panel flush>
            <DataTable
              flush
              caption="Attendance records"
              loading={records.isLoading && rangeOk}
              error={records.error}
              rows={rows}
              rowKey={(r) => r.occurrenceId}
              onRowClick={setSelected}
              emptyTitle={flagged ? 'Nothing needs attention' : 'No visits in this period'}
              emptyBody={flagged ? 'Flagged check-ins, rejected attempts and no-shows appear here.' : 'Try a wider date range.'}
              columns={[
                {
                  header: 'Visit',
                  cell: (r) => (
                    <span className="primary-cell">
                      {dayLabel(r.scheduledDate)}
                      {r.startsAt ? `, ${istTime(r.startsAt)}` : ''}
                      <span className="sub">
                        {r.serviceName} · {r.flat.towerName} {r.flat.flatNumber}
                      </span>
                    </span>
                  ),
                },
                {
                  header: 'Worker',
                  cell: (r) =>
                    r.worker ? (
                      <span className="primary-cell" style={{ fontWeight: 400 }}>
                        {r.worker.fullName}
                        <span className="sub">{r.worker.employeeCode}</span>
                      </span>
                    ) : (
                      <span className="muted">None</span>
                    ),
                },
                {
                  header: 'Check-in',
                  cell: (r) =>
                    r.checkIn ? (
                      <span className="primary-cell" style={{ fontWeight: 400 }}>
                        {istTime(r.checkIn.at)} <span className="muted">· {r.checkIn.method}</span>
                        {r.checkIn.flags.map((f) => (
                          <span key={f} className="sub">
                            <span className="badge badge-warning">
                              {FLAG[f] ?? f}
                              {f === 'OUTSIDE_RADIUS' && r.checkIn!.distanceM !== null ? ` · ${r.checkIn!.distanceM} m` : ''}
                            </span>
                          </span>
                        ))}
                        {r.checkIn.reviewStatus !== 'NONE' && r.checkIn.reviewStatus !== 'OPEN' ? (
                          <span className="sub">Review: {r.checkIn.reviewStatus.toLowerCase()}</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="muted">{r.rejectedAttempts ? `${r.rejectedAttempts} rejected ${r.rejectedAttempts === 1 ? 'attempt' : 'attempts'}` : 'Not checked in'}</span>
                    ),
                },
                {
                  header: 'Outcome',
                  cell: (r) => (
                    <span>
                      <StatusBadge status={outcome(r).label} tone={outcome(r).tone} />
                      {r.feedback ? (
                        <span className="sub">
                          <Stars rating={r.feedback.rating} />
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                {
                  header: 'Actions',
                  className: 'actions',
                  cell: (r) => (
                    <div className="row">
                      {approve && r.checkIn?.reviewStatus === 'OPEN' ? (
                        <Button size="sm" onClick={() => setReviewing(r)}>
                          Review
                        </Button>
                      ) : null}
                      {canNoShow(r) ? (
                        <Button variant="ghost" size="sm" busy={noShow.isPending && noShow.variables?.r.occurrenceId === r.occurrenceId} onClick={() => void recordNoShow(r)}>
                          Worker no-show
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          </Panel>
        </div>
      )}
      {selected ? (
        <RecordDrawer
          record={selected}
          onClose={() => setSelected(null)}
          onReview={approve && selected.checkIn?.reviewStatus === 'OPEN' ? () => setReviewing(selected) : undefined}
          onNoShow={canNoShow(selected) ? () => void recordNoShow(selected) : undefined}
        />
      ) : null}
      {reviewing ? (
        <ReviewDialog
          record={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setSelected(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

function RecordDrawer({ record: r, onClose, onReview, onNoShow }: { record: AttendanceRecord; onClose: () => void; onReview?: (() => void) | undefined; onNoShow?: (() => void) | undefined }) {
  return (
    <Drawer
      open
      title={`${r.serviceName} · ${r.flat.towerName} ${r.flat.flatNumber}`}
      subtitle={`${dayLabel(r.scheduledDate)}${r.startsAt ? `, ${istTime(r.startsAt)}` : ''} · ${r.flat.communityName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onNoShow ? (
            <Button variant="danger" icon={UserX} onClick={onNoShow}>
              Worker no-show
            </Button>
          ) : null}
          {onReview ? <Button onClick={onReview}>Review check-in</Button> : null}
        </>
      }
    >
      <div className="stack">
        <dl className="details" style={{ margin: 0 }}>
          <div>
            <dt>Outcome</dt>
            <dd>
              <StatusBadge status={outcome(r).label} tone={outcome(r).tone} />
            </dd>
          </div>
          <div>
            <dt>Worker</dt>
            <dd>{r.worker ? `${r.worker.fullName} (${r.worker.employeeCode})` : '—'}</dd>
          </div>
          <div>
            <dt>Checked in</dt>
            <dd>{r.checkIn ? `${formatDateTime(r.checkIn.at)} · ${r.checkIn.method}` : 'Not checked in'}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{formatDateTime(r.completedAt)}</dd>
          </div>
          <div>
            <dt>Rejected attempts</dt>
            <dd>{r.rejectedAttempts}</dd>
          </div>
        </dl>
        {r.checkIn ? (
          <Panel title="Location evidence">
            <div className="stack-sm">
              <p style={{ margin: 0 }}>
                {r.checkIn.distanceM !== null ? `${r.checkIn.distanceM} m from the community pin` : 'No distance recorded'}
                {r.checkIn.accuracyM !== null ? ` · accuracy ${r.checkIn.accuracyM} m` : ''}
              </p>
              {r.checkIn.flags.length ? (
                <div>
                  {r.checkIn.flags.map((f) => (
                    <span key={f} className="badge badge-warning" style={{ marginRight: 6 }}>
                      {FLAG[f] ?? f}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted">No flags</span>
              )}
              {r.checkIn.reviewStatus !== 'NONE' ? (
                <p style={{ margin: 0 }}>
                  Review: <StatusBadge status={r.checkIn.reviewStatus === 'OPEN' ? 'PENDING' : r.checkIn.reviewStatus} />
                  {r.checkIn.reviewNote ? <span className="muted"> · {r.checkIn.reviewNote}</span> : null}
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}
        {r.noShow ? (
          <InfoBanner tone="warning">
            {r.noShow.kind === 'RESIDENT_ABSENT' ? 'Resident not available' : 'Worker did not come'}
            {r.noShow.note ? `: ${r.noShow.note}` : ''}
          </InfoBanner>
        ) : null}
        {r.feedback ? (
          <Panel title="Resident feedback">
            <div className="stack-sm">
              <Stars rating={r.feedback.rating} />
              {r.feedback.comment ? <p className="prewrap" style={{ margin: 0 }}>{r.feedback.comment}</p> : <span className="muted">No comment</span>}
            </div>
          </Panel>
        ) : null}
      </div>
    </Drawer>
  );
}

/**
 * The radius is not returned by the community API, so the current value is read
 * from the latest "geofence set" entry in the community's change history (DB default 200 m).
 */
function useCurrentRadius(communityId: string) {
  const me = useMe();
  const allowed = (me.isSuperAdmin || me.scope.type === 'GLOBAL') && can(me, 'locations', 'view');
  const q = useQuery({
    queryKey: ['geofence-radius', communityId],
    enabled: allowed,
    retry: false,
    queryFn: async () => {
      const page = await api<{ items: AuditEntry[]; nextCursor: string | null }>(`/v1/admin/audit/records/community/${communityId}?limit=100`);
      const hit = page.items.find((e) => e.action === 'community.geofence_set');
      const after = hit?.after as { radiusM?: number } | null | undefined;
      if (hit && typeof after?.radiusM === 'number') return { radiusM: after.radiusM, setAt: hit.at, by: hit.actor.name, known: true as const };
      if (!page.nextCursor) return { radiusM: DEFAULT_RADIUS_M, setAt: null, by: null, known: true as const };
      return { radiusM: null, setAt: null, by: null, known: false as const };
    },
  });
  const pin = useQuery({
    queryKey: ['community-pin', communityId],
    enabled: can(me, 'locations', 'view'),
    queryFn: () => api<Community>(`/v1/admin/communities/${communityId}`),
  });
  return { allowed, q, pin };
}

function GeofencePanel({ communityId, canEdit }: { communityId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { q, pin } = useCurrentRadius(communityId);
  const [editing, setEditing] = useState(false);
  const [radius, setRadius] = useState('');
  const [saved, setSaved] = useState<{ communityId: string; radiusM: number } | null>(null);
  const current = saved?.communityId === communityId ? saved.radiusM : (pin.data?.geofenceRadiusM ?? q.data?.radiusM ?? null);
  const save = useMutation({
    mutationFn: (radiusM: number) => api<{ radiusM: number }>(`/v1/admin/communities/${communityId}/geofence`, { method: 'PUT', body: { radiusM } }),
    onSuccess: async (r) => {
      setSaved({ communityId, radiusM: r.radiusM });
      setEditing(false);
      toast(`Check-in radius set to ${r.radiusM} m`);
      await qc.invalidateQueries({ queryKey: ['geofence-radius', communityId] });
      await qc.invalidateQueries({ queryKey: ['community-pin', communityId] });
    },
  });
  const n = Number(radius);
  const valid = Number.isInteger(n) && n >= 25 && n <= 5000;
  async function submit() {
    const r = await confirm({
      title: `Change the check-in radius to ${n} m?`,
      body: `${current !== null ? `Currently ${current} m. ` : ''}From now on, check-ins farther than ${n} m from the community’s map pin are flagged for review. Check-ins already recorded keep their flags.`,
      confirmLabel: 'Change radius',
      tone: 'warning',
    });
    if (r.ok) save.mutate(n);
  }
  const noPin = pin.data && !pin.data.location;
  return (
    <Panel
      title="Check-in radius"
      subtitle="Check-ins farther than this from the community’s map pin are flagged for review, never rejected."
      actions={
        canEdit && !editing ? (
          <Button
            variant="secondary"
            size="sm"
            icon={Pencil}
            onClick={() => {
              setRadius(current !== null ? String(current) : '');
              setEditing(true);
            }}
          >
            Change
          </Button>
        ) : null
      }
    >
      <div className="stack-sm">
        <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
          <span>
            Current radius:{' '}
            {q.isLoading && current === null ? (
              <span className="muted">loading…</span>
            ) : current !== null ? (
              <strong className="num">{current} m</strong>
            ) : (
              <span className="muted">not shown to your account (default {DEFAULT_RADIUS_M} m unless changed)</span>
            )}
          </span>
          {saved?.communityId !== communityId && q.data?.setAt ? (
            <span className="muted">
              set {formatDateTime(q.data.setAt)}
              {q.data.by ? ` by ${q.data.by}` : ''}
            </span>
          ) : saved?.communityId !== communityId && q.data?.known && current === DEFAULT_RADIUS_M ? (
            <span className="muted">default</span>
          ) : null}
        </div>
        {noPin ? <InfoBanner tone="warning">This community has no map pin, so every check-in is flagged. Set the pin under Locations.</InfoBanner> : null}
        {editing ? (
          <form
            className="row"
            style={{ alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void submit();
            }}
          >
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">New radius (metres, 25–5000)</span>
              <input className="input input-compact" type="number" min={25} max={5000} step={1} value={radius} onChange={(e) => setRadius(e.target.value)} />
            </label>
            <Button type="submit" disabled={!valid || n === current} busy={save.isPending}>
              Save radius
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        ) : null}
        <ErrorBanner error={save.error} />
      </div>
    </Panel>
  );
}

function ReviewDialog({ record, onClose, onDone }: { record: AttendanceRecord; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: (decision: 'ACCEPTED' | 'REJECTED') => api(`/v1/admin/attendance/events/${record.checkIn!.eventId}/review`, { method: 'POST', body: { decision, note: note.trim() } }),
    onSuccess: (_r, decision) => {
      toast(decision === 'ACCEPTED' ? 'Check-in accepted' : 'Check-in rejected');
      onDone();
      onClose();
    },
  });
  const c = record.checkIn!;
  return (
    <Modal
      open
      title="Review flagged check-in"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={note.trim().length < 3} busy={save.isPending && save.variables === 'REJECTED'} onClick={() => save.mutate('REJECTED')}>
            Reject check-in
          </Button>
          <Button disabled={note.trim().length < 3} busy={save.isPending && save.variables === 'ACCEPTED'} onClick={() => save.mutate('ACCEPTED')}>
            Accept check-in
          </Button>
        </>
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>
          {record.worker?.fullName ?? 'The worker'} checked in at {record.flat.towerName} {record.flat.flatNumber} on {dayLabel(record.scheduledDate)} at {istTime(c.at)} with
          the resident’s {c.method}. {c.distanceM !== null ? `The phone was ${c.distanceM} m from the community pin` : 'No location was shared'}
          {c.accuracyM !== null ? ` (accuracy ${c.accuracyM} m).` : '.'}
        </p>
        <div>
          {c.flags.map((f) => (
            <span key={f} className="badge badge-warning" style={{ marginRight: 6 }}>
              {FLAG[f] ?? f}
            </span>
          ))}
        </div>
        <InfoBanner>
          The resident’s code proves presence at the flat; GPS is supporting evidence. Accepting keeps the check-in as verified attendance. Rejecting marks
          the visit as an exception. The decision can’t be changed afterwards.
        </InfoBanner>
        <TextArea label="Note (recorded with the decision)" required value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        <ErrorBanner error={save.error} />
      </div>
    </Modal>
  );
}

const CORRECTION_TABS = [
  { value: 'PENDING', label: 'Waiting for review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;
type CorrectionTab = (typeof CORRECTION_TABS)[number]['value'];

const askLabel = (c: Correction) => (c.requestedChange === 'MARK_ATTENDED' ? 'Mark as attended' : 'Mark as completed');

/** ADM-12A: worker correction requests. The original evidence is never changed. */
export function CorrectionsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<CorrectionTab>('PENDING');
  const list = useQuery({ queryKey: ['corrections', status], queryFn: () => api<{ items: Correction[] }>(`/v1/admin/attendance-corrections?status=${status}`) });
  const decide = useMutation({
    mutationFn: (v: { c: Correction; decision: 'APPROVED' | 'REJECTED'; note: string }) =>
      api(`/v1/admin/attendance-corrections/${v.c.id}/decide`, { method: 'POST', body: { decision: v.decision, note: v.note } }),
    onSuccess: async (_r, v) => {
      toast(v.decision === 'APPROVED' ? 'Correction approved' : 'Correction rejected');
      await qc.invalidateQueries({ queryKey: ['corrections'] });
      await qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
  async function run(c: Correction, decision: 'APPROVED' | 'REJECTED') {
    const r = await confirm({
      title: decision === 'APPROVED' ? `Approve: ${askLabel(c).toLowerCase()}?` : 'Reject this correction?',
      body:
        decision === 'APPROVED'
          ? `${c.worker.fullName}’s visit at ${c.flat.towerName} ${c.flat.flatNumber} on ${dayLabel(c.scheduledDate)} will be ${c.requestedChange === 'MARK_ATTENDED' ? 'marked as attended' : 'marked as completed'}. The original record stays; your decision is added to the history and sent to the worker.`
          : `The visit stays as recorded. Your note is sent to ${c.worker.fullName}.`,
      confirmLabel: decision === 'APPROVED' ? 'Approve correction' : 'Reject correction',
      tone: decision === 'APPROVED' ? 'default' : 'danger',
      reason: { label: 'Note (sent to the worker)', required: true, minLength: 3 },
    });
    if (r.ok) decide.mutate({ c, decision, note: r.reason });
  }
  return (
    <>
      <PageHeader
        crumb={{ to: '/attendance', label: 'Attendance' }}
        title="Attendance corrections"
        description="Workers ask for a correction when a check-in or completion could not be recorded. The original record stays; your decision is added to the history."
      />
      <Tabs label="Correction status" value={status} onChange={setStatus} items={CORRECTION_TABS.map((t) => ({ ...t, count: t.value === status ? list.data?.items.length : undefined }))} />
      <div className="stack" style={{ marginTop: 16 }}>
        <ErrorBanner error={decide.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Correction requests"
            loading={list.isLoading}
            error={list.error}
            rows={list.data?.items}
            rowKey={(c) => c.id}
            emptyTitle={status === 'PENDING' ? 'No corrections waiting' : 'No correction requests'}
            emptyBody={status === 'PENDING' ? 'Workers request corrections from the Worker app.' : undefined}
            columns={[
              {
                header: 'Worker',
                cell: (c) => (
                  <span className="primary-cell">
                    {c.worker.fullName}
                    <span className="sub">
                      {c.worker.employeeCode} · asked {formatDateTime(c.createdAt)}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Visit',
                cell: (c) => (
                  <span className="primary-cell" style={{ fontWeight: 400 }}>
                    {dayLabel(c.scheduledDate)}
                    <span className="sub">
                      {c.flat.towerName} · {c.flat.flatNumber} · {c.flat.communityName}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Request',
                cell: (c) => (
                  <span className="primary-cell" style={{ fontWeight: 400 }}>
                    <strong>{askLabel(c)}</strong>
                    <span className="sub prewrap">{c.explanation}</span>
                  </span>
                ),
              },
              {
                header: 'Original record',
                cell: (c) =>
                  c.originalEvent ? (
                    <span className="primary-cell" style={{ fontWeight: 400 }}>
                      {c.originalEvent.result.charAt(0) + c.originalEvent.result.slice(1).toLowerCase()}
                      {c.originalEvent.flags.length ? ` · ${c.originalEvent.flags.map((f) => FLAG[f] ?? f).join(', ')}` : ''}
                      <span className="sub">{formatDateTime(c.originalEvent.at)}</span>
                    </span>
                  ) : (
                    <span className="muted">No check-in attempt</span>
                  ),
              },
              {
                header: 'Actions',
                className: 'actions',
                cell: (c) =>
                  c.status === 'PENDING' && can(me, 'attendance', 'approve') ? (
                    <div className="row">
                      <Button size="sm" busy={decide.isPending && decide.variables?.c.id === c.id && decide.variables.decision === 'APPROVED'} onClick={() => void run(c, 'APPROVED')}>
                        Approve
                      </Button>
                      <Button variant="ghost" size="sm" busy={decide.isPending && decide.variables?.c.id === c.id && decide.variables.decision === 'REJECTED'} onClick={() => void run(c, 'REJECTED')}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'normal' }}>
                      <StatusBadge status={c.status} />
                      {c.reviewNote ? <span className="sub muted">{c.reviewNote}</span> : null}
                    </span>
                  ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
