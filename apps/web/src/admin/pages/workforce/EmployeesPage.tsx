'use client';

import { useState } from 'react';
import { ExportButton } from '../../components/ExportButton';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Applicant, Employee, EmployeeDetail, LeaveRequest, TemporaryPassword } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useNavigate, useParams } from '../../lib/router';
import {
  Button,
  ButtonLink,
  DataTable,
  ErrorBanner,
  FilterSelect,
  formatDate,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SearchBox,
  SelectInput,
  Spinner,
  StatusBadge,
  Tabs,
  TextInput,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import {
  CalendarX,
  Check,
  CircleCheck,
  Clock,
  ExternalLink,
  GraduationCap,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from '../../components/icons';
import { DaysInput, daysLabel } from '../demand/shared';
import { CompensationPanel } from '../finance/PayrollPage';
import { RecordHistory } from '../../components/RecordHistory';

export function useClusterOptions() {
  return useQuery({ queryKey: ['cluster-options'], queryFn: () => api<{ items: { id: string; name: string; code: string }[] }>('/v1/admin/cluster-options') });
}
export function useServiceOptions() {
  return useQuery({ queryKey: ['service-options'], queryFn: () => api<{ items: { id: string; code: string; name: string }[] }>('/v1/admin/service-options') });
}

function ReadinessBadge({ readiness }: { readiness: Employee['readiness'] }) {
  return <StatusBadge status={readiness} tone={readiness === 'READY' ? 'success' : 'warning'} />;
}

/** ADM-09 employee list. */
export function EmployeesPage() {
  const me = useMe();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [readiness, setReadiness] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<Employee>(['employees'], `/v1/admin/employees${qs({ q, readiness, limit: 50 })}`);
  const [creating, setCreating] = useState(false);
  const filtered = Boolean(q || readiness);
  return (
    <>
      <PageHeader
        title="Employees"
        description="Workers, their verification, qualifications and readiness. Only ready employees can be assigned to visits."
        actions={
          <>
            <ExportButton path="/v1/admin/exports/employees" module="employees" fileName="employees.csv" />
            {can(me, 'employees', 'create') ? (
              <Button icon={UserPlus} onClick={() => setCreating(true)}>
                Add employee
              </Button>
            ) : null}
          </>
        }
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name, ID or phone" />
        <FilterSelect
          value={readiness}
          onChange={setReadiness}
          label="Readiness"
          options={[
            { value: 'READY', label: 'Ready' },
            { value: 'NOT_READY', label: 'Not ready' },
          ]}
        />
      </Toolbar>
      <Panel flush>
        <DataTable
          flush
          caption="Employees"
          loading={list.isLoading}
          error={list.error}
          rows={list.rows}
          rowKey={(e) => e.id}
          onRowClick={(e) => navigate(`/workforce/employees/${e.id}`)}
          emptyTitle={filtered ? 'No employees match' : 'No employees yet'}
          emptyBody={filtered ? 'Clear the search or readiness filter.' : 'Add an employee here, or make one from an applicant under Applicants.'}
          columns={[
            {
              header: 'Employee',
              cell: (e) => (
                <span className="primary-cell">
                  <Link to={`/workforce/employees/${e.id}`}>{e.fullName}</Link>
                  <span className="sub">
                    {e.employeeCode} · {e.phone}
                  </span>
                </span>
              ),
            },
            { header: 'Home cluster', cell: (e) => e.homeClusterName },
            {
              header: 'Services',
              cell: (e) =>
                e.services.length ? (
                  e.services.map((s) => (
                    <span key={s.serviceId} className="chip">
                      {s.name}
                    </span>
                  ))
                ) : (
                  <span className="muted">None yet</span>
                ),
            },
            {
              header: 'Readiness',
              cell: (e) => (
                <span>
                  <ReadinessBadge readiness={e.readiness} />
                  {e.readiness === 'NOT_READY' && e.readinessNote ? <span className="sub muted clamp">{e.readinessNote}</span> : null}
                </span>
              ),
            },
            { header: 'Worker app', cell: (e) => (e.loginEnabled ? 'Login enabled' : <span className="muted">No login yet</span>) },
          ]}
          footer={
            list.hasMore ? (
              <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>
                Load more
              </Button>
            ) : null
          }
        />
      </Panel>
      {creating ? <CreateEmployee onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateEmployee({ onClose, applicant }: { onClose: () => void; applicant?: Applicant }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const clusters = useClusterOptions();
  const [fullName, setFullName] = useState(applicant?.fullName ?? '');
  const [phone, setPhone] = useState(applicant?.phone ?? '');
  const [clusterId, setClusterId] = useState(applicant?.preferredClusterId ?? '');
  const [joinedOn, setJoinedOn] = useState('');
  const save = useMutation({
    mutationFn: () =>
      applicant
        ? api<EmployeeDetail>(`/v1/admin/applicants/${applicant.id}/convert`, {
            method: 'POST',
            body: { homeClusterId: clusterId, joinedOn: joinedOn || undefined, version: applicant.version },
          })
        : api<EmployeeDetail>('/v1/admin/employees', { method: 'POST', body: { fullName, phone, homeClusterId: clusterId, joinedOn: joinedOn || undefined } }),
    onSuccess: async (e) => {
      await qc.invalidateQueries({ queryKey: ['employees'] });
      await qc.invalidateQueries({ queryKey: ['applicants'] });
      toast(applicant ? `${e.fullName} is now employee ${e.employeeCode}` : `Employee ${e.employeeCode} created`);
      navigate(`/workforce/employees/${e.id}`);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={applicant ? `Make ${applicant.fullName} an employee?` : 'Add employee'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} disabled={!clusterId || (!applicant && (!fullName.trim() || !phone.trim()))} onClick={() => save.mutate()}>
            {applicant ? 'Make employee' : 'Create employee'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {applicant ? (
          <InfoBanner>
            This creates an employee record for {applicant.fullName} ({applicant.phone}) with a new Employee ID, and closes the application as
            converted. It can’t be undone from here. Login is enabled later, once verification and readiness are complete.
          </InfoBanner>
        ) : (
          <InfoBanner>An Employee ID (NV-…) is generated. Login is enabled later, once verification and readiness are complete.</InfoBanner>
        )}
        {!applicant ? (
          <>
            <TextInput label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} />
            <TextInput label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} error={err?.field('phone')} hint="10-digit mobile or +91…" />
          </>
        ) : null}
        <SelectInput
          label="Home cluster"
          required
          value={clusterId}
          onChange={(e) => setClusterId(e.target.value)}
          placeholder={clusters.isLoading ? 'Loading clusters…' : 'Choose a cluster'}
          options={(clusters.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          error={err?.field('homeClusterId')}
        />
        <TextInput label="Joined on (optional)" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const key = ['employee', id];
  const emp = useQuery({ queryKey: key, queryFn: () => api<EmployeeDetail>(`/v1/admin/employees/${id}`) });
  const services = useServiceOptions();
  const [error, setError] = useState<unknown>(null);
  const [password, setPassword] = useState<TemporaryPassword | null>(null);
  const [editingAvailability, setEditingAvailability] = useState(false);
  const onSaved = (d: EmployeeDetail) => {
    qc.setQueryData(key, d);
    void qc.invalidateQueries({ queryKey: ['employees'] });
  };
  const call = useMutation({
    mutationFn: (v: { path: string; method: string; body?: unknown; done?: string }) =>
      api<EmployeeDetail>(`/v1/admin/employees/${id}${v.path}`, { method: v.method, body: v.body }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: (d, v) => {
      onSaved(d);
      if (v.done) toast(v.done);
    },
  });
  const login = useMutation({
    mutationFn: () => api<TemporaryPassword>(`/v1/admin/employees/${id}/login`, { method: 'POST' }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: async (p) => {
      setPassword(p);
      await qc.invalidateQueries({ queryKey: key });
    },
  });
  if (emp.isLoading) return <Spinner />;
  if (emp.error || !emp.data) return <ErrorBanner error={emp.error ?? new Error('Employee not found')} />;
  const e = emp.data;
  const approve = can(me, 'employees', 'approve');
  const qualified = new Set(e.services.map((s) => s.serviceId));
  const required = e.verifications.filter((v) => v.required);
  const requiredOk = required.filter((v) => v.status === 'VERIFIED').length;
  const trainingDone = e.training.filter((t) => t.completedAt).length;

  async function markReady() {
    const r = await confirm({
      title: `Mark ${e.fullName} ready?`,
      body: 'Ready employees appear as candidates in Allocation and can be given visits. You can mark them not ready again later.',
      confirmLabel: 'Mark ready',
    });
    if (r.ok) call.mutate({ path: '/readiness', method: 'PUT', body: { readiness: 'READY', version: e.version }, done: `${e.fullName} is ready for allocation` });
  }
  async function markNotReady() {
    const r = await confirm({
      title: `Mark ${e.fullName} not ready?`,
      body: 'They stop appearing as a candidate for new allocations. Visits already assigned to them are not changed; replace those under Visits if needed.',
      confirmLabel: 'Mark not ready',
      tone: 'warning',
      reason: { label: 'Reason (recorded and shown on the employee)', required: true, minLength: 3 },
    });
    if (r.ok) call.mutate({ path: '/readiness', method: 'PUT', body: { readiness: 'NOT_READY', note: r.reason, version: e.version }, done: `${e.fullName} marked not ready` });
  }
  async function enableLogin() {
    const r = await confirm({
      title: e.loginEnabled ? `Reset ${e.fullName}’s password?` : `Enable Worker app login for ${e.fullName}?`,
      body: e.loginEnabled
        ? 'Their current password stops working immediately. A new temporary password is shown once; they must change it at first sign-in.'
        : 'A temporary password is generated and shown once. Share it with the worker in person; they must change it at first sign-in.',
      confirmLabel: e.loginEnabled ? 'Reset password' : 'Enable login',
      tone: e.loginEnabled ? 'warning' : 'default',
    });
    if (r.ok) login.mutate();
  }
  async function setVerification(itemId: string, name: string, status: string) {
    if (status === 'REJECTED') {
      const r = await confirm({
        title: `Record “${name}” as rejected?`,
        body: 'A rejected required check keeps this employee from being marked ready until it is verified.',
        confirmLabel: 'Record rejected',
        tone: 'warning',
        reason: { label: 'Note (optional)' },
      });
      if (!r.ok) return;
      call.mutate({ path: `/verifications/${itemId}`, method: 'PUT', body: { status, note: r.reason || undefined }, done: `${name}: rejected` });
      return;
    }
    call.mutate({ path: `/verifications/${itemId}`, method: 'PUT', body: { status }, done: `${name}: ${status === 'VERIFIED' ? 'verified' : 'pending'}` });
  }

  const checklist: { ok: boolean; label: string; note?: string }[] = [
    { ok: e.status === 'ACTIVE', label: 'Employment is active', note: e.status !== 'ACTIVE' ? `Status is ${e.status.toLowerCase()}` : undefined },
    {
      ok: required.length > 0 ? requiredOk === required.length : true,
      label: 'Required checks verified',
      note: required.length ? `${requiredOk} of ${required.length}` : 'No required checks configured',
    },
    { ok: e.services.length > 0, label: 'Qualified for at least one service', note: e.services.map((s) => s.name).join(', ') || undefined },
    { ok: e.readiness === 'READY', label: 'Marked ready by HR', note: e.readiness === 'NOT_READY' && e.readinessNote ? e.readinessNote : undefined },
    { ok: e.loginEnabled, label: 'Worker app login enabled', note: e.loginEnabled ? undefined : 'Enabled after the employee is ready' },
  ];

  return (
    <>
      <PageHeader
        crumb={{ to: '/workforce/employees', label: 'Employees' }}
        title={e.fullName}
        description={
          <>
            {e.employeeCode} · {e.phone} · {e.homeClusterName} <ReadinessBadge readiness={e.readiness} />
          </>
        }
        actions={
          approve && e.status === 'ACTIVE' ? (
            <>
              {e.readiness === 'READY' ? (
                <Button variant="secondary" icon={KeyRound} busy={login.isPending} onClick={() => void enableLogin()}>
                  {e.loginEnabled ? 'Reset password' : 'Enable login'}
                </Button>
              ) : null}
              {e.readiness === 'NOT_READY' ? (
                <Button icon={UserCheck} disabled={e.readinessGaps.length > 0} busy={call.isPending} onClick={() => void markReady()}>
                  Mark ready
                </Button>
              ) : (
                <Button variant="ghost" icon={UserX} busy={call.isPending} onClick={() => void markNotReady()}>
                  Mark not ready
                </Button>
              )}
            </>
          ) : null
        }
      />
      <div className="stack">
        <ErrorBanner error={error} />
        <div className="split">
          <div className="stack" style={{ minWidth: 0 }}>
            <Panel
              title="Readiness"
              subtitle={e.readiness === 'READY' ? 'Ready: offered as a candidate in Allocation.' : 'Not ready: not offered for allocation yet.'}
            >
              <div className="stack-sm">
                <ul className="checklist">
                  {checklist.map((c) => (
                    <li key={c.label} className={c.ok ? 'ok' : 'todo'}>
                      <span aria-hidden>{c.ok ? <Check size={14} /> : <Clock size={14} />}</span>
                      <span>
                        {c.label}
                        <span className="sr-only">{c.ok ? ' (done)' : ' (not yet)'}</span>
                        {c.note ? <span className="muted"> · {c.note}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {e.readiness === 'NOT_READY' && e.readinessGaps.length ? (
                  <InfoBanner tone="warning">
                    Before this employee can be marked ready: {e.readinessGaps.join('; ')}.
                  </InfoBanner>
                ) : null}
              </div>
            </Panel>
            <Panel title="Verification checklist" subtitle="Nestovin’s own checks, set under HR settings." flush>
              <DataTable
                flush
                caption="Verification checklist"
                rows={e.verifications}
                rowKey={(v) => v.itemId}
                emptyTitle="No checklist items configured"
                emptyBody={
                  <ButtonLink to="/workforce/settings" size="sm">
                    Open HR settings
                  </ButtonLink>
                }
                columns={[
                  {
                    header: 'Check',
                    cell: (v) => (
                      <span className="primary-cell">
                        {v.name}
                        <span className="sub">
                          {v.required ? 'Required' : 'Optional'}
                          {v.reviewedAt ? ` · ${formatDateTime(v.reviewedAt)}` : ''}
                          {v.note ? ` · ${v.note}` : ''}
                        </span>
                      </span>
                    ),
                  },
                  { header: 'Status', cell: (v) => (v.status ? <StatusBadge status={v.status} /> : <span className="muted">Not recorded</span>) },
                  {
                    header: 'Record',
                    className: 'actions',
                    cell: (v) =>
                      approve ? (
                        <select
                          className="input input-compact"
                          aria-label={`Outcome for ${v.name}`}
                          value={v.status ?? ''}
                          disabled={call.isPending}
                          onChange={(ev) => ev.target.value && void setVerification(v.itemId, v.name, ev.target.value)}
                        >
                          <option value="">Choose…</option>
                          <option value="VERIFIED">Verified</option>
                          <option value="PENDING">Pending</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                      ) : null,
                  },
                ]}
              />
            </Panel>
            <Panel title="Qualified services" subtitle="Allocation only offers services the employee is qualified for.">
              {services.isLoading ? <Spinner /> : null}
              <ErrorBanner error={services.error} />
              <div className="row">
                {(services.data?.items ?? []).map((s) => (
                  <label key={s.id} className="checkbox chip">
                    <input
                      type="checkbox"
                      disabled={!approve || call.isPending}
                      checked={qualified.has(s.id)}
                      onChange={(ev) => {
                        const next = new Set(qualified);
                        if (ev.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        call.mutate({ path: '/qualifications', method: 'PUT', body: { serviceIds: [...next] }, done: 'Qualifications saved' });
                      }}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </Panel>
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            <Panel title="Account">
              <dl className="kv">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={e.status} />
                </dd>
                <dt>Employee ID</dt>
                <dd>{e.employeeCode}</dd>
                <dt>Home cluster</dt>
                <dd>{e.homeClusterName}</dd>
                <dt>Worker app</dt>
                <dd>{e.loginEnabled ? 'Login enabled' : 'No login yet'}</dd>
                <dt>Joined</dt>
                <dd>{formatDate(e.joinedOn)}</dd>
              </dl>
            </Panel>
            <Panel
              title="Availability"
              actions={
                can(me, 'employees', 'edit') ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditingAvailability(true)}>
                    Edit
                  </Button>
                ) : null
              }
            >
              {e.availability.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No windows set: availability is not restricted.
                </p>
              ) : (
                <ul className="checklist">
                  {e.availability.map((a) => (
                    <li key={a.id}>
                      <span aria-hidden>
                        <Clock size={14} />
                      </span>
                      <span>
                        {daysLabel(a.daysOfWeek)} · {a.startTime}–{a.endTime}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Training" subtitle={e.training.length ? `${trainingDone} of ${e.training.length} completed` : undefined}>
              {e.training.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No training links configured.
                </p>
              ) : (
                <ul className="checklist">
                  {e.training.map((t) => (
                    <li key={t.itemId} className={t.completedAt ? 'ok' : 'todo'}>
                      <span aria-hidden>{t.completedAt ? <CircleCheck size={14} /> : <GraduationCap size={14} />}</span>
                      <span>
                        {t.title}
                        <span className="muted"> · {t.completedAt ? `completed ${formatDate(t.completedAt)}` : 'not completed'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {can(me, 'finance_payroll', 'view') ? <CompensationPanel employeeId={e.id} /> : null}
            <RecordHistory targetType="employee" targetId={e.id} />
          </div>
        </div>
      </div>
      {password ? (
        <Modal open title="Temporary password" onClose={() => setPassword(null)} footer={<Button onClick={() => setPassword(null)}>I have shared it</Button>}>
          <div className="stack">
            <InfoBanner tone="warning">This password is shown only once. Share it with the worker in person; they must change it at first login.</InfoBanner>
            <dl className="details">
              <div>
                <dt>Employee ID</dt>
                <dd>
                  <strong>{password.employeeCode}</strong>
                </dd>
              </div>
              <div>
                <dt>Temporary password</dt>
                <dd>
                  <code>{password.temporaryPassword}</code>
                </dd>
              </div>
            </dl>
          </div>
        </Modal>
      ) : null}
      {editingAvailability ? <AvailabilityEditor employee={e} onClose={() => setEditingAvailability(false)} onSaved={onSaved} /> : null}
    </>
  );
}

function AvailabilityEditor({ employee, onClose, onSaved }: { employee: EmployeeDetail; onClose: () => void; onSaved: (d: EmployeeDetail) => void }) {
  const toast = useToast();
  const [windows, setWindows] = useState(employee.availability.map((a) => ({ daysOfWeek: a.daysOfWeek, startTime: a.startTime, endTime: a.endTime })));
  const save = useMutation({
    mutationFn: () => api<EmployeeDetail>(`/v1/admin/employees/${employee.id}/availability`, { method: 'PUT', body: { windows } }),
    onSuccess: (d) => {
      onSaved(d);
      toast('Availability saved');
      onClose();
    },
  });
  return (
    <Modal
      open
      wide
      title={`Availability · ${employee.fullName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()}>
            Save availability
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Leave empty for no restriction. Allocation only offers visits that fit inside a window.
        </p>
        {windows.map((w, i) => (
          <div key={i} className="card stack-sm">
            <DaysInput value={w.daysOfWeek} onChange={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, daysOfWeek: v } : x)))} />
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <TextInput label="From" type="time" value={w.startTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
              <TextInput label="To" type="time" value={w.endTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} />
              <Button variant="ghost" icon={Trash2} onClick={() => setWindows(windows.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button variant="secondary" icon={Plus} onClick={() => setWindows([...windows, { daysOfWeek: 63, startTime: '06:00', endTime: '14:00' }])}>
            Add window
          </Button>
        </div>
        <ErrorBanner error={save.error} />
      </div>
    </Modal>
  );
}

const APPLICANT_TABS = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CONVERTED', label: 'Became employees' },
] as const;
type ApplicantTab = (typeof APPLICANT_TABS)[number]['value'];

/** EMP-01 applicants. */
export function ApplicantsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<ApplicantTab>('NEW');
  const list = useQuery({ queryKey: ['applicants', status], queryFn: () => api<{ items: Applicant[] }>(`/v1/admin/applicants${qs({ status })}`) });
  const [converting, setConverting] = useState<Applicant | null>(null);
  const review = useMutation({
    mutationFn: (v: { a: Applicant; status: 'IN_REVIEW' | 'REJECTED'; note?: string }) =>
      api(`/v1/admin/applicants/${v.a.id}`, { method: 'PATCH', body: { status: v.status, note: v.note, version: v.a.version } }),
    onSuccess: async (_r, v) => {
      toast(v.status === 'REJECTED' ? `${v.a.fullName}’s application rejected` : `${v.a.fullName} moved to In review`);
      await qc.invalidateQueries({ queryKey: ['applicants'] });
    },
  });
  async function reject(a: Applicant) {
    const r = await confirm({
      title: `Reject ${a.fullName}’s application?`,
      body: 'The application moves to Rejected. No account was ever created for them, so nothing else changes.',
      confirmLabel: 'Reject application',
      tone: 'danger',
      reason: { label: 'Note (optional, kept with the application)' },
    });
    if (r.ok) review.mutate({ a, status: 'REJECTED', note: r.reason || undefined });
  }
  const edit = can(me, 'employees', 'edit');
  const create = can(me, 'employees', 'create');
  return (
    <>
      <PageHeader
        title="Applicants"
        description="People who registered interest in working with Nestovin from the Worker app. Submitting the form never creates a login."
      />
      <Tabs label="Application status" value={status} onChange={setStatus} items={APPLICANT_TABS.map((t) => ({ ...t, count: t.value === status ? list.data?.items.length : undefined }))} />
      <div className="stack" style={{ marginTop: 16 }}>
        <ErrorBanner error={review.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Applicants"
            loading={list.isLoading}
            error={list.error}
            rows={list.data?.items}
            rowKey={(a) => a.id}
            emptyTitle={status === 'NEW' ? 'No new applicants' : 'Nothing here'}
            emptyBody={status === 'NEW' ? 'New sign-ups from the Worker app appear here.' : undefined}
            columns={[
              {
                header: 'Applicant',
                cell: (a) => (
                  <span className="primary-cell">
                    {a.fullName}
                    <span className="sub">
                      {a.phone}
                      {a.city ? ` · ${a.city}` : ''}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Services',
                cell: (a) =>
                  a.services.length ? (
                    a.services.map((s) => (
                      <span key={s} className="chip">
                        {s.charAt(0) + s.slice(1).toLowerCase()}
                      </span>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                header: 'Experience',
                cell: (a) => (
                  <span className="clamp prewrap">
                    {a.experienceNote ?? <span className="muted">—</span>}
                    {a.reviewNote ? <span className="sub muted">Note: {a.reviewNote}</span> : null}
                  </span>
                ),
              },
              { header: 'Received', cell: (a) => formatDate(a.createdAt) },
              {
                header: 'Actions',
                className: 'actions',
                cell: (a) =>
                  a.status === 'NEW' || a.status === 'IN_REVIEW' ? (
                    <div className="row">
                      {a.status === 'NEW' && edit ? (
                        <Button variant="secondary" size="sm" busy={review.isPending && review.variables?.a.id === a.id && review.variables.status === 'IN_REVIEW'} onClick={() => review.mutate({ a, status: 'IN_REVIEW' })}>
                          Start review
                        </Button>
                      ) : null}
                      {create ? (
                        <Button size="sm" icon={UserPlus} onClick={() => setConverting(a)}>
                          Make employee
                        </Button>
                      ) : null}
                      {edit ? (
                        <Button variant="ghost" size="sm" onClick={() => void reject(a)}>
                          Reject
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <StatusBadge status={a.status} />
                  ),
              },
            ]}
          />
        </Panel>
      </div>
      {converting ? <CreateEmployee applicant={converting} onClose={() => setConverting(null)} /> : null}
    </>
  );
}

const LEAVE_TABS = [
  { value: 'PENDING', label: 'Waiting for decision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;
type LeaveTab = (typeof LEAVE_TABS)[number]['value'];

const leaveDays = (l: LeaveRequest) =>
  Math.round((new Date(`${l.endDate}T12:00:00Z`).getTime() - new Date(`${l.startDate}T12:00:00Z`).getTime()) / 86_400_000) + 1;
const leaveRange = (l: LeaveRequest) => (l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`);

/** EMP-09 leave approvals. */
export function LeavePage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveTab>('PENDING');
  const list = useQuery({ queryKey: ['leave', status], queryFn: () => api<{ items: LeaveRequest[] }>(`/v1/admin/leave-requests${qs({ status })}`) });
  const [released, setReleased] = useState<{ count: number; l: LeaveRequest } | null>(null);
  const decide = useMutation({
    mutationFn: (v: { l: LeaveRequest; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      api<{ releasedAssignments: number }>(`/v1/admin/leave-requests/${v.l.id}/decide`, { method: 'POST', body: { decision: v.decision, note: v.note, version: v.l.version } }),
    onSuccess: async (r, v) => {
      setReleased(v.decision === 'APPROVED' && r.releasedAssignments ? { count: r.releasedAssignments, l: v.l } : null);
      toast(v.decision === 'APPROVED' ? `Leave approved for ${v.l.employee.fullName}` : `Leave rejected for ${v.l.employee.fullName}`);
      await qc.invalidateQueries({ queryKey: ['leave'] });
      await qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });
  async function approve(l: LeaveRequest) {
    const n = l.affectedAssignments;
    const r = await confirm({
      title: `Approve leave for ${l.employee.fullName}?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {leaveRange(l)} ({leaveDays(l)} {leaveDays(l) === 1 ? 'day' : 'days'}). They are removed from allocation on these days.
          </p>
          <p style={{ margin: 0 }}>
            {n > 0 ? (
              <strong>
                This releases {n} assigned {n === 1 ? 'visit' : 'visits'}. They become gaps under Visits and each needs a one-day cover.
              </strong>
            ) : (
              'No assigned visits fall in this period.'
            )}{' '}
            Approval can’t be undone from here.
          </p>
        </div>
      ),
      confirmLabel: n > 0 ? `Approve and release ${n} ${n === 1 ? 'visit' : 'visits'}` : 'Approve leave',
      tone: n > 0 ? 'warning' : 'default',
      reason: { label: 'Note to the worker (optional)' },
    });
    if (r.ok) decide.mutate({ l, decision: 'APPROVED', note: r.reason || undefined });
  }
  async function reject(l: LeaveRequest) {
    const r = await confirm({
      title: `Reject leave for ${l.employee.fullName}?`,
      body: `${leaveRange(l)}. The worker keeps their assigned visits on these days.`,
      confirmLabel: 'Reject leave',
      tone: 'danger',
      reason: { label: 'Note to the worker (optional)' },
    });
    if (r.ok) decide.mutate({ l, decision: 'REJECTED', note: r.reason || undefined });
  }
  return (
    <>
      <PageHeader
        title="Leave requests"
        description="Approved leave removes the worker from allocation on those days. Visits already assigned in that period are released for a one-day cover."
      />
      <Tabs label="Leave status" value={status} onChange={setStatus} items={LEAVE_TABS.map((t) => ({ ...t, count: t.value === status ? list.data?.items.length : undefined }))} />
      <div className="stack" style={{ marginTop: 16 }}>
        {released ? (
          <InfoBanner tone="warning">
            {released.count} {released.count === 1 ? 'visit was' : 'visits were'} released and need a one-day cover.{' '}
            <Link to={`/allocation/visits?from=${released.l.startDate}&to=${released.l.endDate}&gaps=1`}>Open those days in Visits</Link>
          </InfoBanner>
        ) : null}
        <ErrorBanner error={decide.error} />
        <Panel flush>
          <DataTable
            flush
            caption="Leave requests"
            loading={list.isLoading}
            error={list.error}
            rows={list.data?.items}
            rowKey={(l) => l.id}
            emptyTitle={status === 'PENDING' ? 'No leave waiting for a decision' : 'No leave requests'}
            emptyBody={status === 'PENDING' ? 'Workers request leave from the Worker app.' : undefined}
            columns={[
              {
                header: 'Employee',
                cell: (l) => (
                  <span className="primary-cell">
                    <Link to={`/workforce/employees/${l.employee.id}`}>{l.employee.fullName}</Link>
                    <span className="sub">
                      {l.employee.employeeCode} · requested {formatDate(l.createdAt)}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Dates',
                cell: (l) => (
                  <span className="primary-cell" style={{ fontWeight: 400 }}>
                    {leaveRange(l)}
                    <span className="sub">
                      {leaveDays(l)} {leaveDays(l) === 1 ? 'day' : 'days'}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Reason',
                cell: (l) => (
                  <span className="clamp">
                    {l.reason ?? <span className="muted">—</span>}
                    {l.reviewNote ? <span className="sub muted">Note: {l.reviewNote}</span> : null}
                  </span>
                ),
              },
              {
                header: 'Visits affected',
                className: 'num',
                cell: (l) => (l.affectedAssignments ? <strong style={{ color: 'var(--amber)' }}>{l.affectedAssignments}</strong> : <span className="muted">0</span>),
              },
              {
                header: 'Actions',
                className: 'actions',
                cell: (l) =>
                  l.status === 'PENDING' && can(me, 'employees', 'approve') ? (
                    <div className="row">
                      <Button size="sm" busy={decide.isPending && decide.variables?.l.id === l.id} onClick={() => void approve(l)}>
                        Approve
                      </Button>
                      <Button variant="ghost" size="sm" icon={CalendarX} onClick={() => void reject(l)}>
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <StatusBadge status={l.status} />
                  ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}

/** HR settings: verification checklist and training links (client-owned standards). */
export function HrSettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const items = useQuery({
    queryKey: ['verification-items'],
    queryFn: () => api<{ items: { id: string; name: string; required: boolean; status: 'ACTIVE' | 'INACTIVE' }[] }>('/v1/admin/verification-items'),
  });
  const training = useQuery({
    queryKey: ['training-items'],
    queryFn: () => api<{ items: { id: string; title: string; url: string; status: 'ACTIVE' | 'INACTIVE' }[] }>('/v1/admin/training-items'),
  });
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const saveItem = useMutation({
    mutationFn: (v: { id?: string; name: string; required: boolean; status?: 'ACTIVE' | 'INACTIVE' }) =>
      api(v.id ? `/v1/admin/verification-items/${v.id}` : '/v1/admin/verification-items', {
        method: v.id ? 'PATCH' : 'POST',
        body: { name: v.name, required: v.required, status: v.status },
      }),
    onSuccess: async (_r, v) => {
      if (!v.id) setName('');
      toast(v.id ? 'Checklist item updated' : 'Checklist item added');
      await qc.invalidateQueries({ queryKey: ['verification-items'] });
    },
  });
  const saveTraining = useMutation({
    mutationFn: (v: { id?: string; title: string; url: string; status?: 'ACTIVE' | 'INACTIVE' }) =>
      api(v.id ? `/v1/admin/training-items/${v.id}` : '/v1/admin/training-items', {
        method: v.id ? 'PATCH' : 'POST',
        body: { title: v.title, url: v.url, status: v.status },
      }),
    onSuccess: async (_r, v) => {
      if (!v.id) {
        setTitle('');
        setUrl('');
      }
      toast(v.id ? 'Training link updated' : 'Training link added');
      await qc.invalidateQueries({ queryKey: ['training-items'] });
    },
  });
  const edit = can(me, 'employees', 'edit');
  const itemErr = saveItem.error instanceof ApiError ? saveItem.error : null;
  const trErr = saveTraining.error instanceof ApiError ? saveTraining.error : null;

  async function toggleItem(i: { id: string; name: string; required: boolean; status: 'ACTIVE' | 'INACTIVE' }) {
    if (i.status === 'ACTIVE') {
      const r = await confirm({
        title: `Deactivate “${i.name}”?`,
        body: 'It stops appearing on employee checklists and no longer counts towards readiness. Recorded outcomes are kept, and you can activate it again.',
        confirmLabel: 'Deactivate',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    saveItem.mutate({ id: i.id, name: i.name, required: i.required, status: i.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  }
  async function toggleRequired(i: { id: string; name: string; required: boolean }, required: boolean) {
    if (required) {
      const r = await confirm({
        title: `Make “${i.name}” required?`,
        body: 'Employees who have not had this check verified can’t be marked ready until it is.',
        confirmLabel: 'Make required',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    saveItem.mutate({ id: i.id, name: i.name, required });
  }
  async function toggleTraining(t: { id: string; title: string; url: string; status: 'ACTIVE' | 'INACTIVE' }) {
    if (t.status === 'ACTIVE') {
      const r = await confirm({
        title: `Deactivate “${t.title}”?`,
        body: 'Workers stop seeing this link in the Worker app. Completion records are kept.',
        confirmLabel: 'Deactivate',
        tone: 'warning',
      });
      if (!r.ok) return;
    }
    saveTraining.mutate({ id: t.id, title: t.title, url: t.url, status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  }

  return (
    <>
      <PageHeader title="HR settings" description="The verification checklist and training links are Nestovin’s own standards; set them here." />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Panel title="Verification checklist" subtitle="Required checks must be verified before an employee can be marked ready." flush>
          <DataTable
            flush
            caption="Verification checklist"
            loading={items.isLoading}
            error={items.error}
            rows={items.data?.items}
            rowKey={(i) => i.id}
            emptyTitle="No checklist items"
            emptyBody="Add the checks every worker must pass, such as Aadhaar or police verification."
            columns={[
              { header: 'Check', cell: (i) => <span className="primary-cell">{i.name}</span> },
              {
                header: 'Required',
                cell: (i) =>
                  edit ? (
                    <label className="checkbox">
                      <input type="checkbox" aria-label={`${i.name} required`} checked={i.required} onChange={(e) => void toggleRequired(i, e.target.checked)} />
                      <span>{i.required ? 'Required' : 'Optional'}</span>
                    </label>
                  ) : i.required ? (
                    'Required'
                  ) : (
                    'Optional'
                  ),
              },
              { header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
              {
                header: 'Actions',
                className: 'actions',
                cell: (i) =>
                  edit ? (
                    <Button variant="ghost" size="sm" onClick={() => void toggleItem(i)}>
                      {i.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null,
              },
            ]}
          />
          {edit ? (
            <form
              className="panel-body stack-sm"
              style={{ borderTop: '1px solid var(--rule)' }}
              onSubmit={(e) => {
                e.preventDefault();
                saveItem.mutate({ name, required: true });
              }}
            >
              <TextInput label="New check" value={name} onChange={(e) => setName(e.target.value)} error={itemErr?.field('name')} hint="e.g. “Aadhaar verified”, “Police verification”. Added as required." />
              <div>
                <Button type="submit" icon={ShieldCheck} disabled={name.trim().length < 2} busy={saveItem.isPending && !saveItem.variables?.id}>
                  Add check
                </Button>
              </div>
              <ErrorBanner error={itemErr?.fields.length ? null : saveItem.error} />
            </form>
          ) : null}
        </Panel>
        <Panel title="Training links" subtitle="Videos workers watch in the Worker app." flush>
          <DataTable
            flush
            caption="Training links"
            loading={training.isLoading}
            error={training.error}
            rows={training.data?.items}
            rowKey={(t) => t.id}
            emptyTitle="No training links"
            emptyBody="Add https links to training videos."
            columns={[
              {
                header: 'Title',
                cell: (t) => (
                  <a href={t.url} target="_blank" rel="noreferrer noopener" className="primary-cell">
                    {t.title} <ExternalLink size={12} aria-hidden />
                  </a>
                ),
              },
              { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
              {
                header: 'Actions',
                className: 'actions',
                cell: (t) =>
                  edit ? (
                    <Button variant="ghost" size="sm" onClick={() => void toggleTraining(t)}>
                      {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null,
              },
            ]}
          />
          {edit ? (
            <form
              className="panel-body stack-sm"
              style={{ borderTop: '1px solid var(--rule)' }}
              onSubmit={(e) => {
                e.preventDefault();
                saveTraining.mutate({ title, url });
              }}
            >
              <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={trErr?.field('title')} />
              <TextInput label="Video link (https)" value={url} onChange={(e) => setUrl(e.target.value)} error={trErr?.field('url')} />
              <div>
                <Button type="submit" icon={GraduationCap} disabled={!title.trim() || !url.trim()} busy={saveTraining.isPending && !saveTraining.variables?.id}>
                  Add link
                </Button>
              </div>
              <ErrorBanner error={trErr?.fields.length ? null : saveTraining.error} />
            </form>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
