'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Slot } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { Button, DataTable, ErrorBanner, InfoBanner, Modal, PageHeader, SelectInput, Spinner, TextInput, Toolbar } from '../../components/ui';
import { CommunityPicker, DaysInput, daysLabel, Pill, useSelectedCommunity } from './shared';

const SERVICE_OPTIONS_KEY = ['services-for-slots'];

/** ADM-10: fixed continuous-mode slots with an admin-set capacity in households (ADR-013). */
export function SlotsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [communityId, setCommunityId, communities, loadingCommunities] = useSelectedCommunity();
  const slots = useQuery({
    queryKey: ['slots', communityId],
    queryFn: () => api<{ items: Slot[] }>(`/v1/admin/communities/${communityId}/slots`),
    enabled: Boolean(communityId),
  });
  const [editing, setEditing] = useState<Slot | 'new' | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const setStatus = useMutation({
    mutationFn: (v: { slot: Slot; status: 'PUBLISHED' | 'WITHDRAWN' }) => api(`/v1/admin/slots/${v.slot.id}`, { method: 'PATCH', body: { status: v.status, version: v.slot.version } }),
    onMutate: () => setActionError(null),
    onError: setActionError,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots', communityId] }),
  });
  const publish = can(me, 'scheduling', 'publish');

  if (loadingCommunities) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Slots"
        description="Fixed time slots residents can book in continuous mode. Capacity is the number of households a slot can serve; the system stops selling it when full."
        actions={can(me, 'scheduling', 'create') && communityId ? <Button onClick={() => setEditing('new')}>Add slot</Button> : null}
      />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
      </Toolbar>
      <BookingWindow />
      <ErrorBanner error={actionError} />
      <DataTable
        caption="Continuous slots"
        loading={slots.isLoading}
        error={slots.error}
        rows={slots.data?.items}
        rowKey={(s) => s.id}
        emptyTitle="No slots yet"
        emptyBody="Add a slot, then publish it to make it bookable. Demand-led slots are created inside a demand cycle."
        columns={[
          { header: 'Slot', cell: (s) => <><strong>{s.label}</strong><div className="muted">{s.serviceName ?? 'Any service'}</div></> },
          { header: 'Time', cell: (s) => <>{s.startTime} · {s.durationMinutes} min<div className="muted">{daysLabel(s.daysOfWeek)}</div></> },
          { header: 'Booked', className: 'num', cell: (s) => `${s.used} / ${s.capacity}` },
          { header: 'Status', cell: (s) => <Pill status={s.status} /> },
          {
            header: 'Actions',
            className: 'actions',
            cell: (s) => (
              <div className="row">
                {can(me, 'scheduling', 'edit') && s.status !== 'WITHDRAWN' ? (
                  <Button variant="secondary" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                ) : null}
                {publish && s.status === 'DRAFT' ? <Button onClick={() => setStatus.mutate({ slot: s, status: 'PUBLISHED' })}>Publish</Button> : null}
                {publish && s.status === 'PUBLISHED' ? (
                  <Button variant="ghost" onClick={() => setStatus.mutate({ slot: s, status: 'WITHDRAWN' })}>
                    Withdraw
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      {editing ? <SlotEditor communityId={communityId} slot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function BookingWindow() {
  const me = useMe();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['booking-settings'], queryFn: () => api<{ bookingWindowDays: number }>('/v1/admin/booking-settings') });
  const [days, setDays] = useState('');
  const save = useMutation({
    mutationFn: () => api('/v1/admin/booking-settings', { method: 'PUT', body: { bookingWindowDays: Number(days) } }),
    onSuccess: async () => {
      setDays('');
      await qc.invalidateQueries({ queryKey: ['booking-settings'] });
    },
  });
  if (!settings.data) return null;
  return (
    <InfoBanner>
      Residents can choose a start date from tomorrow up to <strong>{settings.data.bookingWindowDays} days</strong> ahead (no same-day booking).
      {can(me, 'scheduling', 'edit') ? (
        <span className="row">
          <input className="input input-compact" type="number" min={1} max={60} placeholder="Days" aria-label="Booking window in days" value={days} onChange={(e) => setDays(e.target.value)} />
          <Button variant="secondary" busy={save.isPending} disabled={!days} onClick={() => save.mutate()}>
            Change
          </Button>
        </span>
      ) : null}
      <ErrorBanner error={save.error} />
    </InfoBanner>
  );
}

export function SlotEditor({
  communityId,
  slot,
  onClose,
  createPath,
  invalidate,
}: {
  communityId: string;
  slot: Slot | null;
  onClose: () => void;
  /** Defaults to continuous slots of the community; demand-led slot sets pass their own path. */
  createPath?: string;
  invalidate?: unknown[];
}) {
  const qc = useQueryClient();
  const services = useQuery({
    queryKey: [...SERVICE_OPTIONS_KEY, communityId],
    queryFn: () => api<{ services: { serviceId: string; name: string; enabled: boolean }[] }>(`/v1/admin/communities/${communityId}/services`),
    retry: false,
  });
  const [label, setLabel] = useState(slot?.label ?? '');
  const [serviceId, setServiceId] = useState(slot?.serviceId ?? '');
  const [startTime, setStartTime] = useState(slot?.startTime ?? '07:00');
  const [duration, setDuration] = useState(String(slot?.durationMinutes ?? 60));
  const [days, setDays] = useState(slot?.daysOfWeek ?? 127);
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 10));
  const published = slot?.status === 'PUBLISHED';
  const save = useMutation({
    mutationFn: () => {
      const body = { label, serviceId: serviceId || null, startTime, durationMinutes: Number(duration), daysOfWeek: days, capacity: Number(capacity) };
      if (!slot) return api(createPath ?? `/v1/admin/communities/${communityId}/slots`, { method: 'POST', body });
      return api(`/v1/admin/slots/${slot.id}`, {
        method: 'PATCH',
        body: published ? { label, capacity: Number(capacity), version: slot.version } : { ...body, version: slot.version },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: invalidate ?? ['slots', communityId] });
      onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const enabled = (services.data?.services ?? []).filter((s) => s.enabled);
  return (
    <Modal
      open
      title={slot ? 'Edit slot' : 'Add slot'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()} disabled={!label.trim() || days === 0}>
            Save
          </Button>
        </>
      }
    >
      {published ? <InfoBanner>This slot is published: only its name and capacity can change.</InfoBanner> : null}
      <TextInput label="Name" required value={label} onChange={(e) => setLabel(e.target.value)} error={err?.field('label')} hint="Shown to residents, e.g. “Morning 7:00”." />
      <SelectInput
        label="Service"
        value={serviceId}
        disabled={published}
        onChange={(e) => setServiceId(e.target.value)}
        placeholder="Any service"
        options={enabled.map((s) => ({ value: s.serviceId, label: s.name }))}
      />
      <div className="row">
        <TextInput label="Start time" type="time" value={startTime} disabled={published} onChange={(e) => setStartTime(e.target.value)} error={err?.field('startTime')} />
        <TextInput label="Duration (minutes)" type="number" min={15} max={720} value={duration} disabled={published} onChange={(e) => setDuration(e.target.value)} error={err?.field('durationMinutes')} />
        <TextInput label="Capacity (households)" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} error={err?.field('capacity')} />
      </div>
      {!published ? <DaysInput value={days} onChange={setDays} /> : null}
      <ErrorBanner error={err?.fields.length ? null : save.error} />
    </Modal>
  );
}
