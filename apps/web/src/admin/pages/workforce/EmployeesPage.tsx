'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Applicant, Employee, EmployeeDetail, LeaveRequest, TemporaryPassword } from '@nestovin/contracts';
import { api, ApiError, qs } from '../../lib/api';
import { useDebounced, usePagedList } from '../../lib/hooks';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Link, useNavigate, useParams } from '../../lib/router';
import {
  Button,
  DataTable,
  ErrorBanner,
  FilterSelect,
  formatDateTime,
  InfoBanner,
  Modal,
  PageHeader,
  SearchBox,
  SelectInput,
  Spinner,
  StatusBadge,
  TextInput,
  Toolbar,
} from '../../components/ui';
import { DaysInput, daysLabel, Pill } from '../demand/shared';

export function useClusterOptions() {
  return useQuery({ queryKey: ['cluster-options'], queryFn: () => api<{ items: { id: string; name: string; code: string }[] }>('/v1/admin/cluster-options') });
}
export function useServiceOptions() {
  return useQuery({ queryKey: ['service-options'], queryFn: () => api<{ items: { id: string; code: string; name: string }[] }>('/v1/admin/service-options') });
}

/** ADM-09 employee list. */
export function EmployeesPage() {
  const me = useMe();
  const [search, setSearch] = useState('');
  const [readiness, setReadiness] = useState('');
  const q = useDebounced(search);
  const list = usePagedList<Employee>(['employees'], `/v1/admin/employees${qs({ q, readiness, limit: 50 })}`);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHeader
        title="Employees"
        description="Workers, their verification, qualifications and readiness. Only ready employees can be assigned."
        actions={can(me, 'employees', 'create') ? <Button onClick={() => setCreating(true)}>Add employee</Button> : null}
      />
      <Toolbar>
        <SearchBox value={search} onChange={setSearch} label="Search name, ID or phone" />
        <FilterSelect value={readiness} onChange={setReadiness} label="Readiness" options={[{ value: 'READY', label: 'Ready' }, { value: 'NOT_READY', label: 'Not ready' }]} />
      </Toolbar>
      <DataTable
        caption="Employees"
        loading={list.isLoading}
        error={list.error}
        rows={list.rows}
        rowKey={(e) => e.id}
        emptyTitle="No employees"
        emptyBody="Add employees here or convert applicants."
        columns={[
          { header: 'Employee', cell: (e) => <><Link to={`/workforce/employees/${e.id}`}><strong>{e.fullName}</strong></Link><div className="muted">{e.employeeCode} · {e.phone}</div></> },
          { header: 'Home cluster', cell: (e) => e.homeClusterName },
          { header: 'Services', cell: (e) => e.services.map((s) => s.name).join(', ') || <span className="muted">None</span> },
          { header: 'Readiness', cell: (e) => <Pill status={e.readiness === 'READY' ? 'ACTIVE' : 'DRAFT'} label={e.readiness === 'READY' ? 'Ready' : 'Not ready'} /> },
          { header: 'Login', cell: (e) => (e.loginEnabled ? 'Enabled' : <span className="muted">Not enabled</span>) },
        ]}
        footer={list.hasMore ? <Button variant="ghost" onClick={list.loadMore} busy={list.loadingMore}>Load more</Button> : null}
      />
      {creating ? <CreateEmployee onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function CreateEmployee({ onClose, applicant }: { onClose: () => void; applicant?: Applicant }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clusters = useClusterOptions();
  const [fullName, setFullName] = useState(applicant?.fullName ?? '');
  const [phone, setPhone] = useState(applicant?.phone ?? '');
  const [clusterId, setClusterId] = useState(applicant?.preferredClusterId ?? '');
  const [joinedOn, setJoinedOn] = useState('');
  const save = useMutation({
    mutationFn: () =>
      applicant
        ? api<EmployeeDetail>(`/v1/admin/applicants/${applicant.id}/convert`, { method: 'POST', body: { homeClusterId: clusterId, joinedOn: joinedOn || undefined, version: applicant.version } })
        : api<EmployeeDetail>('/v1/admin/employees', { method: 'POST', body: { fullName, phone, homeClusterId: clusterId, joinedOn: joinedOn || undefined } }),
    onSuccess: async (e) => {
      await qc.invalidateQueries({ queryKey: ['employees'] });
      await qc.invalidateQueries({ queryKey: ['applicants'] });
      navigate(`/workforce/employees/${e.id}`);
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={applicant ? `Make ${applicant.fullName} an employee` : 'Add employee'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} disabled={!clusterId || (!applicant && (!fullName.trim() || !phone.trim()))} onClick={() => save.mutate()}>
            Create
          </Button>
        </>
      }
    >
      <InfoBanner>An Employee ID (NV-…) is generated. Login is enabled later, once verification and readiness are complete.</InfoBanner>
      {!applicant ? (
        <>
          <TextInput label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} error={err?.field('fullName')} />
          <TextInput label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} error={err?.field('phone')} hint="10-digit mobile or +91…" />
        </>
      ) : null}
      <SelectInput label="Home cluster" required value={clusterId} onChange={(e) => setClusterId(e.target.value)} placeholder="Choose a cluster" options={(clusters.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
      <TextInput label="Joined on (optional)" type="date" value={joinedOn} onChange={(e) => setJoinedOn(e.target.value)} />
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const qc = useQueryClient();
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
    mutationFn: (v: { path: string; method: string; body?: unknown }) => api<EmployeeDetail>(`/v1/admin/employees/${id}${v.path}`, { method: v.method, body: v.body }),
    onMutate: () => setError(null),
    onError: setError,
    onSuccess: onSaved,
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

  return (
    <>
      <p className="breadcrumb">
        <Link to="/workforce/employees">Employees</Link> / {e.fullName}
      </p>
      <PageHeader
        title={e.fullName}
        description={`${e.employeeCode} · ${e.phone} · ${e.homeClusterName}`}
        actions={
          approve && e.status === 'ACTIVE' ? (
            <div className="row">
              {e.readiness === 'NOT_READY' ? (
                <Button disabled={e.readinessGaps.length > 0} busy={call.isPending} onClick={() => call.mutate({ path: '/readiness', method: 'PUT', body: { readiness: 'READY', version: e.version } })}>
                  Mark ready
                </Button>
              ) : (
                <Button variant="ghost" busy={call.isPending} onClick={() => call.mutate({ path: '/readiness', method: 'PUT', body: { readiness: 'NOT_READY', note: 'Set by HR', version: e.version } })}>
                  Mark not ready
                </Button>
              )}
              {e.readiness === 'READY' ? (
                <Button variant="secondary" busy={login.isPending} onClick={() => login.mutate()}>
                  {e.loginEnabled ? 'Reset password' : 'Enable login'}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      <ErrorBanner error={error} />
      {e.readinessGaps.length && e.readiness === 'NOT_READY' ? <InfoBanner tone="warning">Before this employee can be marked ready: {e.readinessGaps.join('; ')}.</InfoBanner> : null}
      <div className="split">
        <div className="stack">
          <div className="card">
            <h2 className="section-title">Verification checklist</h2>
            <DataTable
              caption="Verification checklist"
              rows={e.verifications}
              rowKey={(v) => v.itemId}
              emptyTitle="No checklist items configured"
              emptyBody="Add checklist items under HR settings."
              columns={[
                { header: 'Check', cell: (v) => <>{v.name}{v.required ? '' : <span className="muted"> (optional)</span>}</> },
                { header: 'Status', cell: (v) => (v.status ? <StatusBadge status={v.status} /> : <span className="muted">Not recorded</span>) },
                { header: 'Note', cell: (v) => <span className="muted">{v.note ?? ''}</span> },
                {
                  header: 'Record',
                  className: 'actions',
                  cell: (v) =>
                    approve ? (
                      <select
                        className="input input-compact"
                        aria-label={`Outcome for ${v.name}`}
                        value={v.status ?? ''}
                        onChange={(ev) => ev.target.value && call.mutate({ path: `/verifications/${v.itemId}`, method: 'PUT', body: { status: ev.target.value } })}
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
          </div>
          <div className="card">
            <h2 className="section-title">Qualified services</h2>
            {(services.data?.items ?? []).map((s) => (
              <label key={s.id} className="checkbox">
                <input
                  type="checkbox"
                  disabled={!approve || call.isPending}
                  checked={qualified.has(s.id)}
                  onChange={(ev) => {
                    const next = new Set(qualified);
                    if (ev.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    call.mutate({ path: '/qualifications', method: 'PUT', body: { serviceIds: [...next] } });
                  }}
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2 className="section-title">Availability</h2>
            {e.availability.length === 0 ? <p className="muted">No windows set: availability is not restricted.</p> : null}
            <ul>
              {e.availability.map((a) => (
                <li key={a.id}>{daysLabel(a.daysOfWeek)} · {a.startTime}–{a.endTime}</li>
              ))}
            </ul>
            {can(me, 'employees', 'edit') ? <Button variant="secondary" onClick={() => setEditingAvailability(true)}>Edit availability</Button> : null}
          </div>
          <div className="card">
            <h2 className="section-title">Training</h2>
            {e.training.length === 0 ? <p className="muted">No training links configured.</p> : null}
            <ul>
              {e.training.map((t) => (
                <li key={t.itemId}>{t.title} · {t.completedAt ? `completed ${formatDateTime(t.completedAt)}` : <span className="muted">not completed</span>}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2 className="section-title">Account</h2>
            <p>Status: <StatusBadge status={e.status} /></p>
            <p>Login: {e.loginEnabled ? 'Enabled' : 'Not enabled'}</p>
            <p className="muted">Joined {e.joinedOn ?? '—'}</p>
          </div>
        </div>
      </div>
      {password ? (
        <Modal open title="Temporary password" onClose={() => setPassword(null)} footer={<Button onClick={() => setPassword(null)}>I have shared it</Button>}>
          <InfoBanner tone="warning">This password is shown only once. Share it with the worker in person; they must change it at first login.</InfoBanner>
          <dl className="details">
            <div><dt>Employee ID</dt><dd><strong>{password.employeeCode}</strong></dd></div>
            <div><dt>Temporary password</dt><dd><code>{password.temporaryPassword}</code></dd></div>
          </dl>
        </Modal>
      ) : null}
      {editingAvailability ? <AvailabilityEditor employee={e} onClose={() => setEditingAvailability(false)} onSaved={onSaved} /> : null}
    </>
  );
}

function AvailabilityEditor({ employee, onClose, onSaved }: { employee: EmployeeDetail; onClose: () => void; onSaved: (d: EmployeeDetail) => void }) {
  const [windows, setWindows] = useState(employee.availability.map((a) => ({ daysOfWeek: a.daysOfWeek, startTime: a.startTime, endTime: a.endTime })));
  const save = useMutation({
    mutationFn: () => api<EmployeeDetail>(`/v1/admin/employees/${employee.id}/availability`, { method: 'PUT', body: { windows } }),
    onSuccess: (d) => {
      onSaved(d);
      onClose();
    },
  });
  return (
    <Modal
      open
      wide
      title="Availability"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <p className="muted">Leave empty for no restriction. Allocation only offers visits that fit inside a window.</p>
      {windows.map((w, i) => (
        <div key={i} className="card stack">
          <DaysInput value={w.daysOfWeek} onChange={(v) => setWindows(windows.map((x, j) => (j === i ? { ...x, daysOfWeek: v } : x)))} />
          <div className="row">
            <TextInput label="From" type="time" value={w.startTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
            <TextInput label="To" type="time" value={w.endTime} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} />
            <Button variant="ghost" onClick={() => setWindows(windows.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        </div>
      ))}
      <Button variant="secondary" onClick={() => setWindows([...windows, { daysOfWeek: 63, startTime: '06:00', endTime: '14:00' }])}>Add window</Button>
      <ErrorBanner error={save.error} />
    </Modal>
  );
}

/** EMP-01 applicants. */
export function ApplicantsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState('NEW');
  const list = useQuery({ queryKey: ['applicants', status], queryFn: () => api<{ items: Applicant[] }>(`/v1/admin/applicants${qs({ status })}`) });
  const [converting, setConverting] = useState<Applicant | null>(null);
  const review = useMutation({
    mutationFn: (v: { a: Applicant; status: 'IN_REVIEW' | 'REJECTED' }) => api(`/v1/admin/applicants/${v.a.id}`, { method: 'PATCH', body: { status: v.status, version: v.a.version } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicants'] }),
  });
  return (
    <>
      <PageHeader title="Applicants" description="People who registered interest in working with Nestovin from the Worker app. Submitting the form never creates a login." />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="NEW">New</option>
          <option value="IN_REVIEW">In review</option>
          <option value="REJECTED">Rejected</option>
          <option value="CONVERTED">Became employees</option>
        </select>
      </Toolbar>
      <ErrorBanner error={review.error} />
      <DataTable
        caption="Applicants"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(a) => a.id}
        emptyTitle="No applicants"
        columns={[
          { header: 'Applicant', cell: (a) => <><strong>{a.fullName}</strong><div className="muted">{a.phone}{a.city ? ` · ${a.city}` : ''}</div></> },
          { header: 'Services', cell: (a) => a.services.join(', ') || '—' },
          { header: 'Experience', cell: (a) => <span className="clamp prewrap">{a.experienceNote ?? '—'}</span> },
          { header: 'Received', cell: (a) => formatDateTime(a.createdAt) },
          {
            header: 'Actions',
            className: 'actions',
            cell: (a) =>
              a.status === 'NEW' || a.status === 'IN_REVIEW' ? (
                <div className="row">
                  {a.status === 'NEW' && can(me, 'employees', 'edit') ? <Button variant="secondary" onClick={() => review.mutate({ a, status: 'IN_REVIEW' })}>Start review</Button> : null}
                  {can(me, 'employees', 'create') ? <Button onClick={() => setConverting(a)}>Make employee</Button> : null}
                  {can(me, 'employees', 'edit') ? <Button variant="ghost" onClick={() => review.mutate({ a, status: 'REJECTED' })}>Reject</Button> : null}
                </div>
              ) : (
                <Pill status={a.status} />
              ),
          },
        ]}
      />
      {converting ? <CreateEmployee applicant={converting} onClose={() => setConverting(null)} /> : null}
    </>
  );
}

/** EMP-09 leave approvals. */
export function LeavePage() {
  const me = useMe();
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const list = useQuery({ queryKey: ['leave', status], queryFn: () => api<{ items: LeaveRequest[] }>(`/v1/admin/leave-requests${qs({ status })}`) });
  const [notice, setNotice] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (v: { l: LeaveRequest; decision: 'APPROVED' | 'REJECTED' }) =>
      api<{ releasedAssignments: number }>(`/v1/admin/leave-requests/${v.l.id}/decide`, { method: 'POST', body: { decision: v.decision, version: v.l.version } }),
    onSuccess: async (r, v) => {
      setNotice(v.decision === 'APPROVED' && r.releasedAssignments ? `${r.releasedAssignments} visit(s) were released and need a replacement under Visits.` : null);
      await qc.invalidateQueries({ queryKey: ['leave'] });
    },
  });
  return (
    <>
      <PageHeader title="Leave requests" description="Approved leave removes the worker from allocation on those days. Visits already assigned are released for replacement." />
      <Toolbar>
        <select className="input input-compact" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">Waiting for decision</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </Toolbar>
      {notice ? <InfoBanner tone="warning">{notice} <Link to="/allocation/visits">Open visits</Link></InfoBanner> : null}
      <ErrorBanner error={decide.error} />
      <DataTable
        caption="Leave requests"
        loading={list.isLoading}
        error={list.error}
        rows={list.data?.items}
        rowKey={(l) => l.id}
        emptyTitle="No leave requests"
        columns={[
          { header: 'Employee', cell: (l) => <><Link to={`/workforce/employees/${l.employee.id}`}>{l.employee.fullName}</Link><div className="muted">{l.employee.employeeCode}</div></> },
          { header: 'Dates', cell: (l) => (l.startDate === l.endDate ? l.startDate : `${l.startDate} → ${l.endDate}`) },
          { header: 'Reason', cell: (l) => l.reason ?? '—' },
          { header: 'Visits affected', className: 'num', cell: (l) => l.affectedAssignments },
          {
            header: 'Actions',
            className: 'actions',
            cell: (l) =>
              l.status === 'PENDING' && can(me, 'employees', 'approve') ? (
                <div className="row">
                  <Button onClick={() => decide.mutate({ l, decision: 'APPROVED' })}>Approve</Button>
                  <Button variant="ghost" onClick={() => decide.mutate({ l, decision: 'REJECTED' })}>Reject</Button>
                </div>
              ) : (
                <StatusBadge status={l.status} />
              ),
          },
        ]}
      />
    </>
  );
}

/** HR settings: verification checklist and training links (client-owned standards). */
export function HrSettingsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ['verification-items'], queryFn: () => api<{ items: { id: string; name: string; required: boolean; status: 'ACTIVE' | 'INACTIVE' }[] }>('/v1/admin/verification-items') });
  const training = useQuery({ queryKey: ['training-items'], queryFn: () => api<{ items: { id: string; title: string; url: string; status: 'ACTIVE' | 'INACTIVE' }[] }>('/v1/admin/training-items') });
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const saveItem = useMutation({
    mutationFn: (v: { id?: string; name: string; required: boolean; status?: 'ACTIVE' | 'INACTIVE' }) =>
      api(v.id ? `/v1/admin/verification-items/${v.id}` : '/v1/admin/verification-items', { method: v.id ? 'PATCH' : 'POST', body: { name: v.name, required: v.required, status: v.status } }),
    onSuccess: async () => {
      setName('');
      await qc.invalidateQueries({ queryKey: ['verification-items'] });
    },
  });
  const saveTraining = useMutation({
    mutationFn: (v: { id?: string; title: string; url: string; status?: 'ACTIVE' | 'INACTIVE' }) =>
      api(v.id ? `/v1/admin/training-items/${v.id}` : '/v1/admin/training-items', { method: v.id ? 'PATCH' : 'POST', body: { title: v.title, url: v.url, status: v.status } }),
    onSuccess: async () => {
      setTitle('');
      setUrl('');
      await qc.invalidateQueries({ queryKey: ['training-items'] });
    },
  });
  const edit = can(me, 'employees', 'edit');
  const itemErr = saveItem.error instanceof ApiError ? saveItem.error : null;
  const trErr = saveTraining.error instanceof ApiError ? saveTraining.error : null;
  return (
    <>
      <PageHeader title="HR settings" description="The verification checklist and training links are Nestovin’s own standards; set them here." />
      <div className="split">
        <div className="card stack">
          <h2 className="section-title">Verification checklist</h2>
          <DataTable
            caption="Verification checklist"
            loading={items.isLoading}
            rows={items.data?.items}
            rowKey={(i) => i.id}
            emptyTitle="No checklist items"
            columns={[
              { header: 'Check', cell: (i) => i.name },
              { header: 'Required', cell: (i) => (edit ? <input type="checkbox" aria-label={`${i.name} required`} checked={i.required} onChange={(e) => saveItem.mutate({ id: i.id, name: i.name, required: e.target.checked })} /> : i.required ? 'Yes' : 'No') },
              { header: 'Status', cell: (i) => <StatusBadge status={i.status} /> },
              { header: '', className: 'actions', cell: (i) => (edit ? <Button variant="ghost" onClick={() => saveItem.mutate({ id: i.id, name: i.name, required: i.required, status: i.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{i.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button> : null) },
            ]}
          />
          {edit ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); saveItem.mutate({ name, required: true }); }}>
              <TextInput label="New check" value={name} onChange={(e) => setName(e.target.value)} error={itemErr?.field('name')} hint="e.g. “Aadhaar verified”, “Police verification”" />
              <Button type="submit" disabled={name.trim().length < 2} busy={saveItem.isPending}>Add</Button>
            </form>
          ) : null}
          <ErrorBanner error={itemErr?.fields.length ? null : saveItem.error} />
        </div>
        <div className="card stack">
          <h2 className="section-title">Training links</h2>
          <DataTable
            caption="Training links"
            loading={training.isLoading}
            rows={training.data?.items}
            rowKey={(t) => t.id}
            emptyTitle="No training links"
            columns={[
              { header: 'Title', cell: (t) => <a href={t.url} target="_blank" rel="noreferrer noopener">{t.title}</a> },
              { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
              { header: '', className: 'actions', cell: (t) => (edit ? <Button variant="ghost" onClick={() => saveTraining.mutate({ id: t.id, title: t.title, url: t.url, status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button> : null) },
            ]}
          />
          {edit ? (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); saveTraining.mutate({ title, url }); }}>
              <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={trErr?.field('title')} />
              <TextInput label="Video link (https)" value={url} onChange={(e) => setUrl(e.target.value)} error={trErr?.field('url')} />
              <div className="row"><Button type="submit" disabled={!title.trim() || !url.trim()} busy={saveTraining.isPending}>Add link</Button></div>
            </form>
          ) : null}
          <ErrorBanner error={trErr?.fields.length ? null : saveTraining.error} />
        </div>
      </div>
    </>
  );
}
