'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WEEKDAYS, type CatalogueVersionDetail, type Plan, type PlanComponent, type TaskFrequency } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, EmptyState, ErrorBanner, InfoBanner, Modal, SelectInput, Skeleton, TextArea, TextInput, useConfirm, useToast } from '../../components/ui';
import { FilePen, Plus, Trash2 } from '../../components/icons';
import { useVersions } from './SetupPage';
import { useServices, useTasks, useWindows } from './BasicsSteps';

export function useVersionDetail(versionId: string | null | undefined) {
  return useQuery({
    queryKey: ['catalogue-version', versionId],
    queryFn: () => api<CatalogueVersionDetail>(`/v1/admin/catalogue-versions/${versionId}`),
    enabled: Boolean(versionId),
  });
}

export function daysLabel(mask: number): string {
  if (mask === 127) return 'Every day';
  if (mask === 63) return 'Mon–Sat';
  if (mask === 31) return 'Mon–Fri';
  return WEEKDAYS.filter((d) => mask & d.bit).map((d) => d.short).join(', ');
}

const FREQ_LABEL: Record<TaskFrequency, string> = { PER_VISIT: 'Every visit', DAILY: 'per day', WEEKLY: 'per week', MONTHLY: 'per month' };

/** Draft controls shared by the Plans and Prices steps. */
export function DraftBar({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const versions = useVersions(communityId);
  const create = useMutation({
    mutationFn: () => api<CatalogueVersionDetail>(`/v1/admin/communities/${communityId}/catalogue-versions`, { method: 'POST', body: { copyFromPublished: true } }),
    onSuccess: async (v) => {
      await qc.invalidateQueries({ queryKey: ['catalogue-versions', communityId] });
      toast(`Draft version ${v.versionNo} started`);
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => api(`/v1/admin/catalogue-versions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['catalogue-versions', communityId] });
      toast('Draft discarded');
    },
  });
  if (versions.isLoading) return <Skeleton height={56} />;
  const { draft, published } = versions.data ?? { draft: null, published: null };
  const onDiscard = async () => {
    if (!draft) return;
    const r = await confirm({
      title: `Discard draft version ${draft.versionNo}?`,
      body: `Every plan, service and price in this draft is deleted. This cannot be undone. ${published ? `Residents keep seeing published version ${published.versionNo}.` : ''}`,
      confirmLabel: 'Discard draft',
      tone: 'danger',
    });
    if (r.ok) discard.mutate(draft.id);
  };
  return (
    <div className="stack-sm">
      <div className={`banner ${draft ? 'banner-info' : 'banner-warning'}`} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <FilePen size={16} />
        <div style={{ flex: 1, minWidth: 200 }}>
          {draft ? (
            <>
              Editing <strong>draft version {draft.versionNo}</strong>. Residents keep seeing {published ? `published version ${published.versionNo}` : 'nothing'} until you
              publish.
            </>
          ) : published ? (
            <>
              Version {published.versionNo} is <strong>published</strong> and frozen. Start a new draft to change plans or prices.
            </>
          ) : (
            <>No catalogue yet. Start a draft to build plans.</>
          )}
        </div>
        <div className="row">
          {!draft && can(me, 'catalogue_pricing', 'create') ? (
            <Button size="sm" icon={Plus} onClick={() => create.mutate()} busy={create.isPending}>
              {published ? `New draft from version ${published.versionNo}` : 'Start draft'}
            </Button>
          ) : null}
          {draft && can(me, 'catalogue_pricing', 'delete') ? (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={() => void onDiscard()} busy={discard.isPending}>
              Discard draft
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorBanner error={create.error ?? discard.error} />
    </div>
  );
}

export function PlansStep({ communityId }: { communityId: string }) {
  const me = useMe();
  const versions = useVersions(communityId);
  const shown = versions.data?.draft ?? versions.data?.published ?? null;
  const detail = useVersionDetail(shown?.id);
  const editable = shown?.status === 'DRAFT' && can(me, 'catalogue_pricing', 'edit');
  const [planEditor, setPlanEditor] = useState<Plan | 'new' | null>(null);
  const [componentEditor, setComponentEditor] = useState<{ plan: Plan; component: PlanComponent | null } | null>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const askRemovePlan = async (p: Plan) => {
    const r = await confirm({
      title: `Delete plan ${p.name}?`,
      body: `${p.name}, its services and its prices are removed from this draft. Published versions are not affected.`,
      confirmLabel: 'Delete plan',
      tone: 'danger',
    });
    if (r.ok) removePlan.mutate(p.id, { onSuccess: () => toast(`${p.name} deleted`) });
  };
  const askRemoveComponent = async (p: Plan, c: PlanComponent) => {
    const r = await confirm({
      title: `Remove this service from ${p.name}?`,
      body: `The service and its tasks are removed from ${p.name} in this draft, along with any prices set for it. Published versions are not affected.`,
      confirmLabel: 'Remove service',
      tone: 'danger',
    });
    if (r.ok) removeComponent.mutate(c.id, { onSuccess: () => toast('Service removed') });
  };
  const removePlan = useMutation({
    mutationFn: (planId: string) => api<CatalogueVersionDetail>(`/v1/admin/plans/${planId}`, { method: 'DELETE' }),
    onSuccess: (d) => qc.setQueryData(['catalogue-version', d.id], d),
  });
  const removeComponent = useMutation({
    mutationFn: (componentId: string) => api<CatalogueVersionDetail>(`/v1/admin/plan-components/${componentId}`, { method: 'DELETE' }),
    onSuccess: (d) => qc.setQueryData(['catalogue-version', d.id], d),
  });

  return (
    <div className="stack">
      <h2 className="section-title">Plans &amp; packages</h2>
      <p className="field-hint">
        Name plans freely (e.g. Silver, Gold). Each plan bundles services with visits, durations, a time window and tasks. Add Caretaker as an
        optional add-on inside the packages that offer it.
      </p>
      <DraftBar communityId={communityId} />
      <ErrorBanner error={detail.error ?? removePlan.error ?? removeComponent.error} />
      {editable ? (
        <div>
          <Button icon={Plus} onClick={() => setPlanEditor('new')}>
            Add plan
          </Button>
        </div>
      ) : null}
      {detail.data && detail.data.plans.length === 0 ? <EmptyState title="No plans in this version yet" /> : null}
      {detail.data?.plans.map((p) => (
        <div key={p.id} className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h3 className="card-title">
                {p.name} <span className="muted">({p.code})</span>
              </h3>
              <div className="muted">
                Valid {p.validityDays} days{p.description ? ` · ${p.description}` : ''}
              </div>
            </div>
            {editable ? (
              <div className="row">
                <Button variant="secondary" onClick={() => setComponentEditor({ plan: p, component: null })}>
                  Add service
                </Button>
                <Button variant="ghost" onClick={() => setPlanEditor(p)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => void askRemovePlan(p)}>
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
          {p.components.length === 0 ? <p className="muted">No services yet.</p> : null}
          {p.components.map((c) => (
            <ComponentRow
              key={c.id}
              communityId={communityId}
              component={c}
              editable={editable}
              onEdit={() => setComponentEditor({ plan: p, component: c })}
              onDelete={() => void askRemoveComponent(p, c)}
            />
          ))}
        </div>
      ))}
      {planEditor && shown ? <PlanEditor versionId={shown.id} plan={planEditor === 'new' ? null : planEditor} onClose={() => setPlanEditor(null)} /> : null}
      {componentEditor ? (
        <ComponentEditor communityId={communityId} plan={componentEditor.plan} component={componentEditor.component} onClose={() => setComponentEditor(null)} />
      ) : null}
    </div>
  );
}

function ComponentRow({
  communityId,
  component: c,
  editable,
  onEdit,
  onDelete,
}: {
  communityId: string;
  component: PlanComponent;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const services = useServices(communityId);
  const windows = useWindows(communityId);
  const tasks = useTasks(communityId);
  const name = services.data?.services.find((s) => s.serviceId === c.serviceId)?.name ?? c.serviceCode;
  const windowName = windows.data?.find((w) => w.id === c.timeWindowId);
  return (
    <div className="component-row">
      <div>
        <strong>{name}</strong> {c.isOptionalAddon ? <span className="badge badge-info">Optional add-on</span> : null}
        <div className="muted">
          {c.visitsPerDay}× per day · {c.durationMinutes} min · {daysLabel(c.daysOfWeek)}
          {windowName ? ` · ${windowName.name} ${windowName.startTime}–${windowName.endTime}` : ''}
          {c.addonHours ? ` · ${c.addonHours} h` : ''}
        </div>
        <div>
          {c.tasks.map((t) => {
            const task = tasks.data?.find((x) => x.id === t.serviceTaskId);
            return (
              <span key={t.serviceTaskId} className="chip">
                {task?.name ?? 'Task'} · {t.frequency === 'PER_VISIT' ? FREQ_LABEL.PER_VISIT : `${t.timesPerPeriod}× ${FREQ_LABEL[t.frequency]}`}
              </span>
            );
          })}
        </div>
      </div>
      {editable ? (
        <div className="row">
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PlanEditor({ versionId, plan, onClose }: { versionId: string; plan: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [validityDays, setValidity] = useState(String(plan?.validityDays ?? 30));
  const [sort, setSort] = useState(String(plan?.sort ?? 0));
  const save = useMutation({
    mutationFn: () => {
      const body = { code, name, description: description || undefined, validityDays: Number(validityDays), sort: Number(sort) || 0 };
      return plan
        ? api<CatalogueVersionDetail>(`/v1/admin/plans/${plan.id}`, { method: 'PUT', body })
        : api<CatalogueVersionDetail>(`/v1/admin/catalogue-versions/${versionId}/plans`, { method: 'POST', body });
    },
    onSuccess: (d) => {
      qc.setQueryData(['catalogue-version', d.id], d);
      void qc.invalidateQueries({ queryKey: ['catalogue-versions'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  return (
    <Modal
      open
      title={plan ? `Edit plan ${plan.name}` : 'Add plan'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!code.trim() || !name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      <div className="grid-2">
        <TextInput label="Plan name" value={name} onChange={(e) => setName(e.target.value)} error={err?.field('name')} hint="e.g. Gold" required />
        <TextInput label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={err?.field('code')} hint="e.g. GOLD" required />
        <TextInput
          label="Validity (days)"
          type="number"
          min={1}
          max={366}
          value={validityDays}
          onChange={(e) => setValidity(e.target.value)}
          error={err?.field('validityDays')}
          hint="How long one purchase lasts, e.g. 30"
          required
        />
        <TextInput label="Display order" type="number" min={0} value={sort} onChange={(e) => setSort(e.target.value)} />
      </div>
      <TextArea label="Description (shown to residents)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
    </Modal>
  );
}

function ComponentEditor({ communityId, plan, component, onClose }: { communityId: string; plan: Plan; component: PlanComponent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const services = useServices(communityId);
  const windows = useWindows(communityId);
  const tasks = useTasks(communityId);
  const [serviceId, setServiceId] = useState(component?.serviceId ?? '');
  const [addon, setAddon] = useState(component?.isOptionalAddon ?? false);
  const [visits, setVisits] = useState(String(component?.visitsPerDay ?? 1));
  const [minutes, setMinutes] = useState(String(component?.durationMinutes ?? 60));
  const [days, setDays] = useState(component?.daysOfWeek ?? 127);
  const [windowId, setWindowId] = useState(component?.timeWindowId ?? '');
  const [hours, setHours] = useState(component?.addonHours != null ? String(component.addonHours) : '');
  const [selected, setSelected] = useState<Record<string, { frequency: TaskFrequency; timesPerPeriod: number }>>(
    Object.fromEntries((component?.tasks ?? []).map((t) => [t.serviceTaskId, { frequency: t.frequency, timesPerPeriod: t.timesPerPeriod }])),
  );
  const serviceTasks = (tasks.data ?? []).filter((t) => t.serviceId === serviceId && t.status === 'ACTIVE');

  const save = useMutation({
    mutationFn: () => {
      const body = {
        serviceId,
        isOptionalAddon: addon,
        visitsPerDay: Number(visits),
        daysOfWeek: days,
        durationMinutes: Number(minutes),
        timeWindowId: windowId || null,
        addonHours: addon && hours ? Number(hours) : null,
        tasks: Object.entries(selected)
          .filter(([id]) => serviceTasks.some((t) => t.id === id))
          .map(([serviceTaskId, v]) => ({ serviceTaskId, ...v })),
      };
      return component
        ? api<CatalogueVersionDetail>(`/v1/admin/plan-components/${component.id}`, { method: 'PUT', body })
        : api<CatalogueVersionDetail>(`/v1/admin/plans/${plan.id}/components`, { method: 'POST', body });
    },
    onSuccess: (d) => {
      qc.setQueryData(['catalogue-version', d.id], d);
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const enabledServices = (services.data?.services ?? []).filter((s) => s.enabled || s.serviceId === component?.serviceId);

  return (
    <Modal
      open
      wide
      title={component ? `Edit service in ${plan.name}` : `Add service to ${plan.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!serviceId || days === 0}>
            Save
          </Button>
        </>
      }
    >
      <ErrorBanner error={save.error} />
      {enabledServices.length === 0 ? <InfoBanner tone="warning">Enable services in the first step before adding them to plans.</InfoBanner> : null}
      <div className="grid-2">
        <SelectInput
          label="Service"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setSelected({});
          }}
          options={enabledServices.map((s) => ({ value: s.serviceId, label: s.name }))}
          placeholder="Select service"
          error={err?.field('serviceId')}
          required
        />
        <SelectInput
          label="Time window"
          value={windowId}
          onChange={(e) => setWindowId(e.target.value)}
          options={(windows.data ?? []).filter((w) => w.status === 'ACTIVE').map((w) => ({ value: w.id, label: `${w.name} (${w.startTime}–${w.endTime})` }))}
          placeholder="No specific window"
        />
        <TextInput label="Visits per day" type="number" min={1} max={6} value={visits} onChange={(e) => setVisits(e.target.value)} error={err?.field('visitsPerDay')} />
        <TextInput
          label="Minutes per visit"
          type="number"
          min={15}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          error={err?.field('durationMinutes')}
        />
      </div>
      <fieldset>
        <legend>Days</legend>
        <div className="row">
          {WEEKDAYS.map((d) => (
            <label key={d.bit} className="checkbox chip">
              <input type="checkbox" checked={Boolean(days & d.bit)} onChange={() => setDays((m) => m ^ d.bit)} />
              {d.short}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Add-on</legend>
        <label className="checkbox">
          <input type="checkbox" checked={addon} onChange={(e) => setAddon(e.target.checked)} />
          Optional add-on (the resident chooses it; priced separately or included)
        </label>
        {addon ? (
          <div style={{ marginTop: 8, maxWidth: 240 }}>
            <TextInput label="Hours (e.g. Caretaker 6 h)" type="number" min={0.5} step={0.5} max={24} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Tasks included</legend>
        {!serviceId ? <p className="muted">Choose a service first.</p> : null}
        {serviceId && serviceTasks.length === 0 ? <p className="muted">No active tasks for this service. Add them in the Tasks step.</p> : null}
        <div className="stack" style={{ gap: 8 }}>
          {serviceTasks.map((t) => {
            const sel = selected[t.id];
            return (
              <div key={t.id} className="row">
                <label className="checkbox" style={{ minWidth: 260 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(sel)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = { ...s };
                        if (e.target.checked) next[t.id] = { frequency: 'PER_VISIT', timesPerPeriod: 1 };
                        else delete next[t.id];
                        return next;
                      })
                    }
                  />
                  {t.name}
                </label>
                {sel ? (
                  <>
                    <select
                      className="input input-compact"
                      aria-label={`${t.name} frequency`}
                      value={sel.frequency}
                      onChange={(e) => setSelected((s) => ({ ...s, [t.id]: { ...sel, frequency: e.target.value as TaskFrequency } }))}
                    >
                      <option value="PER_VISIT">Every visit</option>
                      <option value="DAILY">Per day</option>
                      <option value="WEEKLY">Per week</option>
                      <option value="MONTHLY">Per month</option>
                    </select>
                    {sel.frequency !== 'PER_VISIT' ? (
                      <input
                        className="input input-compact"
                        style={{ minWidth: 80, width: 80 }}
                        type="number"
                        min={1}
                        max={31}
                        aria-label={`${t.name} times per period`}
                        value={sel.timesPerPeriod}
                        onChange={(e) => setSelected((s) => ({ ...s, [t.id]: { ...sel, timesPerPeriod: Number(e.target.value) || 1 } }))}
                      />
                    ) : null}
                    {sel.frequency !== 'PER_VISIT' ? <span className="muted">times</span> : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </Modal>
  );
}
