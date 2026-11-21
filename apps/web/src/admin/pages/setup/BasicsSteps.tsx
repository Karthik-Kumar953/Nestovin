'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommunityServices, OperatingMode, ResidenceCategory, ServiceTask, TimeWindow } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, InfoBanner, Modal, SelectInput, StatusBadge, TextArea, TextInput } from '../../components/ui';

export const MODE_LABEL: Record<OperatingMode, string> = { DEMAND_LED: 'Demand-led', CONTINUOUS: 'Continuous' };
const MODE_OPTIONS = [
  { value: 'DEMAND_LED', label: 'Collect demand manually (demand cycles)' },
  { value: 'CONTINUOUS', label: 'Open slots automatically (published slots)' },
];

export function useServices(communityId: string) {
  return useQuery({ queryKey: ['setup', communityId, 'services'], queryFn: () => api<CommunityServices>(`/v1/admin/communities/${communityId}/services`) });
}
export function useCategories(communityId: string) {
  return useQuery({
    queryKey: ['setup', communityId, 'categories'],
    queryFn: () => api<{ items: ResidenceCategory[] }>(`/v1/admin/communities/${communityId}/residence-categories`),
    select: (d) => d.items,
  });
}
export function useWindows(communityId: string) {
  return useQuery({
    queryKey: ['setup', communityId, 'windows'],
    queryFn: () => api<{ items: TimeWindow[] }>(`/v1/admin/communities/${communityId}/time-windows`),
    select: (d) => d.items,
  });
}
export function useTasks(communityId: string) {
  return useQuery({
    queryKey: ['setup', communityId, 'tasks'],
    queryFn: () => api<{ items: ServiceTask[] }>(`/v1/admin/communities/${communityId}/tasks`),
    select: (d) => d.items,
  });
}

const STATUS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

// ----------------------------------------------------------------- services

export function ServicesStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const services = useServices(communityId);
  const [defaultMode, setDefaultMode] = useState<string>('');
  const [rows, setRows] = useState<{ serviceId: string; name: string; enabled: boolean; operatingMode: string }[]>([]);
  const editable = can(me, 'catalogue_pricing', 'edit');

  useEffect(() => {
    if (!services.data) return;
    setDefaultMode(services.data.defaultOperatingMode ?? '');
    setRows(services.data.services.map((s) => ({ serviceId: s.serviceId, name: s.name, enabled: s.enabled, operatingMode: s.operatingMode ?? '' })));
  }, [services.data]);

  const save = useMutation({
    mutationFn: () =>
      api<CommunityServices>(`/v1/admin/communities/${communityId}/services`, {
        method: 'PUT',
        body: {
          defaultOperatingMode: defaultMode || null,
          services: rows.map((r) => ({ serviceId: r.serviceId, enabled: r.enabled, operatingMode: r.operatingMode || null })),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['setup', communityId] });
      await qc.invalidateQueries({ queryKey: ['activation', communityId] });
    },
  });

  return (
    <div className="stack">
      <h2 className="section-title">Services offered</h2>
      <p className="field-hint">Choose which of the three V1 services this community gets, and how each is sold.</p>
      <ErrorBanner error={services.error ?? save.error} />
      {save.isSuccess ? <InfoBanner tone="success">Services saved.</InfoBanner> : null}
      <SelectInput
        label="Community default operating mode"
        value={defaultMode}
        onChange={(e) => setDefaultMode(e.target.value)}
        options={MODE_OPTIONS}
        placeholder="No default"
        hint="Used by any enabled service without its own mode."
        disabled={!editable}
      />
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Services</caption>
          <thead>
            <tr>
              <th scope="col">Service</th>
              <th scope="col">Offered</th>
              <th scope="col">Operating mode</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.serviceId}>
                <td>
                  <strong>{r.name}</strong>
                  {r.name === 'Caretaker' ? <div className="muted">Usually offered as an optional add-on inside packages.</div> : null}
                </td>
                <td>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      aria-label={`Offer ${r.name}`}
                      checked={r.enabled}
                      disabled={!editable}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                    />
                    {r.enabled ? 'Yes' : 'No'}
                  </label>
                </td>
                <td>
                  <select
                    className="input input-compact"
                    aria-label={`${r.name} operating mode`}
                    value={r.operatingMode}
                    disabled={!editable || !r.enabled}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, operatingMode: e.target.value } : x)))}
                  >
                    <option value="">{defaultMode ? `Community default (${MODE_LABEL[defaultMode as OperatingMode]})` : 'Use community default'}</option>
                    <option value="DEMAND_LED">Demand-led</option>
                    <option value="CONTINUOUS">Continuous</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div>
          <Button onClick={() => save.mutate()} busy={save.isPending}>
            Save services
          </Button>
        </div>
      ) : null}

      <WindowsSection communityId={communityId} />
    </div>
  );
}

function WindowsSection({ communityId }: { communityId: string }) {
  const me = useMe();
  const windows = useWindows(communityId);
  const [editing, setEditing] = useState<TimeWindow | 'new' | null>(null);
  return (
    <section className="section">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-title">Time windows</h2>
        {can(me, 'catalogue_pricing', 'create') ? (
          <Button variant="secondary" onClick={() => setEditing('new')}>
            Add time window
          </Button>
        ) : null}
      </div>
      <p className="field-hint">Periods of the day when visits can happen, e.g. Morning 07:00–11:00, Evening 16:00–20:00.</p>
      <DataTable
        caption="Time windows"
        rows={windows.data}
        loading={windows.isLoading}
        error={windows.error}
        rowKey={(w) => w.id}
        emptyTitle="No time windows yet"
        columns={[
          { header: 'Name', cell: (w) => <strong>{w.name}</strong> },
          { header: 'From', cell: (w) => w.startTime },
          { header: 'To', cell: (w) => w.endTime },
          { header: 'Status', cell: (w) => <StatusBadge status={w.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (w) =>
              can(me, 'catalogue_pricing', 'edit') ? (
                <Button variant="ghost" onClick={() => setEditing(w)}>
                  Edit
                </Button>
              ) : null,
          },
        ]}
      />
      {editing ? <WindowEditor communityId={communityId} window={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function WindowEditor({ communityId, window: w, onClose }: { communityId: string; window: TimeWindow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(w?.name ?? '');
  const [startTime, setStart] = useState(w?.startTime ?? '07:00');
  const [endTime, setEnd] = useState(w?.endTime ?? '11:00');
  const [status, setStatus] = useState(w?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () =>
      w
        ? api(`/v1/admin/communities/${communityId}/time-windows/${w.id}`, { method: 'PATCH', body: { name, startTime, endTime, status, version: w.version } })
        : api(`/v1/admin/communities/${communityId}/time-windows`, { method: 'POST', body: { name, startTime, endTime } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['setup', communityId, 'windows'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={w ? 'Edit time window' : 'Add time window'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
      <div className="grid-2">
        <TextInput label="From" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} error={err?.field('startTime')} required />
        <TextInput label="To" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} error={err?.field('endTime')} required />
      </div>
      {w ? <SelectInput label="Status" value={status} onChange={(e) => setStatus(e.target.value as TimeWindow['status'])} options={STATUS} /> : null}
    </Modal>
  );
}

// --------------------------------------------------------------- categories

export function CategoriesStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const categories = useCategories(communityId);
  const [editing, setEditing] = useState<ResidenceCategory | 'new' | null>(null);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-title">Residence categories</h2>
        {can(me, 'catalogue_pricing', 'create') ? <Button onClick={() => setEditing('new')}>Add category</Button> : null}
      </div>
      <p className="field-hint">
        How this community’s flats are grouped for pricing, e.g. “2 BHK”, “3 BHK”, “Villa 4 BHK”. Define them before importing flats: the Excel
        file’s “Residence category” column must match a code or label here.
      </p>
      <DataTable
        caption="Residence categories"
        rows={categories.data}
        loading={categories.isLoading}
        error={categories.error}
        rowKey={(c) => c.id}
        emptyTitle="No categories yet"
        emptyBody="Add at least one category before importing flats."
        columns={[
          { header: 'Code', cell: (c) => <code>{c.code}</code> },
          { header: 'Label', cell: (c) => <strong>{c.label}</strong> },
          { header: 'Flats', className: 'num', cell: (c) => c.flatCount },
          { header: 'Order', className: 'num', cell: (c) => c.sort },
          { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (c) =>
              can(me, 'catalogue_pricing', 'edit') ? (
                <Button variant="ghost" onClick={() => setEditing(c)}>
                  Edit
                </Button>
              ) : null,
          },
        ]}
      />
      {editing ? <CategoryEditor communityId={communityId} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function CategoryEditor({ communityId, category, onClose }: { communityId: string; category: ResidenceCategory | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(category?.code ?? '');
  const [label, setLabel] = useState(category?.label ?? '');
  const [sort, setSort] = useState(String(category?.sort ?? 0));
  const [status, setStatus] = useState(category?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () => {
      const body = { code, label, sort: Number(sort) || 0 };
      return category
        ? api(`/v1/admin/communities/${communityId}/residence-categories/${category.id}`, { method: 'PATCH', body: { ...body, status, version: category.version } })
        : api(`/v1/admin/communities/${communityId}/residence-categories`, { method: 'POST', body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['setup', communityId, 'categories'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={category ? 'Edit category' : 'Add category'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!code.trim() || !label.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <TextInput label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={err?.field('code')} hint="Short and unique, e.g. 2BHK" required />
      <TextInput label="Label" value={label} onChange={(e) => setLabel(e.target.value)} error={err?.field('label')} hint="Shown to admins and residents, e.g. 2 BHK" required />
      <TextInput label="Display order" type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} />
      {category ? <SelectInput label="Status" value={status} onChange={(e) => setStatus(e.target.value as ResidenceCategory['status'])} options={STATUS} /> : null}
    </Modal>
  );
}

// -------------------------------------------------------------------- tasks

export function TasksStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const tasks = useTasks(communityId);
  const services = useServices(communityId);
  const [editing, setEditing] = useState<ServiceTask | 'new' | null>(null);
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section-title">Tasks</h2>
        {can(me, 'catalogue_pricing', 'create') ? <Button onClick={() => setEditing('new')}>Add task</Button> : null}
      </div>
      <p className="field-hint">The work each service covers in this community, e.g. “Sweeping and mopping”, “Tiffin and lunch preparation”. Plans pick from these.</p>
      <DataTable
        caption="Tasks"
        rows={tasks.data}
        loading={tasks.isLoading}
        error={tasks.error}
        rowKey={(t) => t.id}
        emptyTitle="No tasks yet"
        columns={[
          { header: 'Service', cell: (t) => services.data?.services.find((s) => s.serviceId === t.serviceId)?.name ?? t.serviceCode },
          {
            header: 'Task',
            cell: (t) => (
              <>
                <strong>{t.name}</strong>
                {t.description ? <div className="muted">{t.description}</div> : null}
              </>
            ),
          },
          { header: 'Typical minutes', className: 'num', cell: (t) => t.defaultDurationMin ?? '—' },
          { header: 'Status', cell: (t) => <StatusBadge status={t.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (t) =>
              can(me, 'catalogue_pricing', 'edit') ? (
                <Button variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              ) : null,
          },
        ]}
      />
      {editing ? (
        <TaskEditor
          communityId={communityId}
          task={editing === 'new' ? null : editing}
          serviceOptions={(services.data?.services ?? []).map((s) => ({ value: s.serviceId, label: s.name }))}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TaskEditor({
  communityId,
  task,
  serviceOptions,
  onClose,
}: {
  communityId: string;
  task: ServiceTask | null;
  serviceOptions: { value: string; label: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState(task?.serviceId ?? '');
  const [name, setName] = useState(task?.name ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [minutes, setMinutes] = useState(task?.defaultDurationMin != null ? String(task.defaultDurationMin) : '');
  const [status, setStatus] = useState(task?.status ?? 'ACTIVE');
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, defaultDurationMin: minutes ? Number(minutes) : undefined };
      return task
        ? api(`/v1/admin/communities/${communityId}/tasks/${task.id}`, { method: 'PATCH', body: { ...body, status, version: task.version } })
        : api(`/v1/admin/communities/${communityId}/tasks`, { method: 'POST', body: { ...body, serviceId } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['setup', communityId, 'tasks'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={task ? 'Edit task' : 'Add task'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim() || (!task && !serviceId)}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      {!task ? (
        <SelectInput label="Service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} options={serviceOptions} placeholder="Select service" required />
      ) : null}
      <TextInput label="Task" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} required />
      <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      <TextInput label="Typical minutes (optional)" type="number" min={1} max={720} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      {task ? <SelectInput label="Status" value={status} onChange={(e) => setStatus(e.target.value as ServiceTask['status'])} options={STATUS} /> : null}
    </Modal>
  );
}
