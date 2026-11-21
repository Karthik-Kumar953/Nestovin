'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Slot } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import {
  Button,
  DataTable,
  ErrorBanner,
  Facts,
  FilterSelect,
  InfoBanner,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Spinner,
  TextInput,
  Toolbar,
  useConfirm,
  useToast,
} from '../../components/ui';
import { Plus } from '../../components/icons';
import { CommunityPicker, DaysInput, daysLabel, Pill, useSelectedCommunity } from './shared';

const SERVICE_OPTIONS_KEY = ['services-for-slots'];

/** ADM-10: fixed continuous-mode slots with an admin-set capacity in households (ADR-013). */
export function SlotsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [communityId, setCommunityId, communities, loadingCommunities] = useSelectedCommunity();
  const [status, setStatus] = useState('');
  const slots = useQuery({
    queryKey: ['slots', communityId],
    queryFn: () => api<{ items: Slot[] }>(`/v1/admin/communities/${communityId}/slots`),
    enabled: Boolean(communityId),
  });
  const [editing, setEditing] = useState<Slot | 'new' | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const setSlotStatus = useMutation({
    mutationFn: (v: { slot: Slot; status: 'PUBLISHED' | 'WITHDRAWN' }) =>
      api(`/v1/admin/slots/${v.slot.id}`, { method: 'PATCH', body: { status: v.status, version: v.slot.version } }),
    onMutate: () => setActionError(null),
    onError: setActionError,
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: ['slots', communityId] });
      toast(v.status === 'PUBLISHED' ? `“${v.slot.label}” is now bookable` : `“${v.slot.label}” withdrawn`);
    },
  });
  const publish = can(me, 'scheduling', 'publish');
  const all = slots.data?.items;
  const rows = status ? all?.filter((s) => s.status === status) : all;
  const live = all?.filter((s) => s.status === 'PUBLISHED') ?? [];
  const seats = live.reduce((n, s) => n + s.capacity, 0);
  const taken = live.reduce((n, s) => n + s.used, 0);
  const full = live.filter((s) => s.used >= s.capacity).length;

  const onPublish = async (s: Slot) => {
    const r = await confirm({
      title: `Publish “${s.label}”?`,
      body: `Residents can book it straight away: ${s.startTime}, ${s.durationMinutes} min, ${daysLabel(s.daysOfWeek)}, for up to ${s.capacity} households. Once published, only its name and capacity can change.`,
      confirmLabel: 'Publish slot',
      tone: 'warning',
    });
    if (r.ok) setSlotStatus.mutate({ slot: s, status: 'PUBLISHED' });
  };
  const onWithdraw = async (s: Slot) => {
    const r = await confirm({
      title: `Withdraw “${s.label}”?`,
      body: (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>It stops being offered to residents straight away.</p>
          <p style={{ margin: 0 }}>
            <strong>Residents may already have booked this slot</strong>
            {s.used > 0 ? ` (${s.used} of ${s.capacity} places are taken)` : ''}. Withdrawing it does not contact them, so check their bookings and let them know.
          </p>
          <p style={{ margin: 0 }}>A withdrawn slot can’t be edited or published again from this screen.</p>
        </div>
      ),
      confirmLabel: 'Withdraw slot',
      tone: 'danger',
    });
    if (r.ok) setSlotStatus.mutate({ slot: s, status: 'WITHDRAWN' });
  };

  if (loadingCommunities) return <Spinner />;
  return (
    <>
      <PageHeader
        title="Slots"
        description="Fixed time slots residents can book in continuous mode. Capacity is the number of households a slot can serve; the system stops selling it when full."
        actions={
          can(me, 'scheduling', 'create') && communityId ? (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add slot
            </Button>
          ) : null
        }
      />
      <Toolbar>
        <CommunityPicker value={communityId} onChange={setCommunityId} options={communities} />
        <FilterSelect
          value={status}
          onChange={setStatus}
          label="Status"
          options={[
            { value: 'DRAFT', label: 'Draft' },
            { value: 'PUBLISHED', label: 'Published' },
            { value: 'WITHDRAWN', label: 'Withdrawn' },
          ]}
        />
      </Toolbar>
      <div className="stack">
        {all && all.length > 0 ? (
          <Facts
            items={[
              { label: 'Bookable slots', value: live.length },
              { label: 'Places taken', value: `${taken} / ${seats}`, note: 'Across published slots' },
              { label: 'Full slots', value: full, tone: full ? 'amber' : undefined },
            ]}
          />
        ) : null}
        <BookingWindow />
        <ErrorBanner error={actionError} />
        <Panel flush>
          <DataTable
            flush
            caption="Continuous slots"
            loading={slots.isLoading}
            error={slots.error}
            rows={rows}
            rowKey={(s) => s.id}
            emptyTitle={status ? 'No slots with this status' : 'No slots yet'}
            emptyBody={
              status ? 'Clear the status filter to see every slot.' : 'Add a slot, then publish it to make it bookable. Demand-led slots are created inside a demand cycle.'
            }
            columns={[
              {
                header: 'Slot',
                cell: (s) => (
                  <span className="primary-cell">
                    {s.label}
                    <span className="sub">{s.serviceName ?? 'Any service'}</span>
                  </span>
                ),
              },
              {
                header: 'Time',
                cell: (s) => (
                  <>
                    {s.startTime} · {s.durationMinutes} min
                    <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                      {daysLabel(s.daysOfWeek)}
                    </span>
                  </>
                ),
              },
              {
                header: 'Booked',
                className: 'num',
                cell: (s) => {
                  const isFull = s.status === 'PUBLISHED' && s.used >= s.capacity;
                  return (
                    <span style={{ color: isFull ? 'var(--amber)' : undefined }}>
                      {s.used} / {s.capacity}
                      {isFull ? (
                        <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                          Full
                        </span>
                      ) : null}
                    </span>
                  );
                },
              },
              { header: 'Status', cell: (s) => <Pill status={s.status} /> },
              {
                header: 'Actions',
                className: 'actions',
                cell: (s) => {
                  const busy = setSlotStatus.isPending && setSlotStatus.variables?.slot.id === s.id;
                  return (
                    <div className="row">
                      {can(me, 'scheduling', 'edit') && s.status !== 'WITHDRAWN' ? (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                          Edit
                        </Button>
                      ) : null}
                      {publish && s.status === 'DRAFT' ? (
                        <Button size="sm" busy={busy} onClick={() => void onPublish(s)}>
                          Publish
                        </Button>
                      ) : null}
                      {publish && s.status === 'PUBLISHED' ? (
                        <Button size="sm" variant="danger" busy={busy} onClick={() => void onWithdraw(s)}>
                          Withdraw
                        </Button>
                      ) : null}
                    </div>
                  );
                },
              },
            ]}
          />
        </Panel>
      </div>
      {editing ? <SlotEditor communityId={communityId} slot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function BookingWindow() {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const settings = useQuery({ queryKey: ['booking-settings'], queryFn: () => api<{ bookingWindowDays: number }>('/v1/admin/booking-settings') });
  const [days, setDays] = useState('');
  const save = useMutation({
    mutationFn: () => api('/v1/admin/booking-settings', { method: 'PUT', body: { bookingWindowDays: Number(days) } }),
    onSuccess: async () => {
      setDays('');
      await qc.invalidateQueries({ queryKey: ['booking-settings'] });
      toast('Booking window updated');
    },
  });
  if (!settings.data) return null;
  const current = settings.data.bookingWindowDays;
  const submit = async () => {
    const r = await confirm({
      title: 'Change the booking window?',
      body: `Residents will be able to choose a start date up to ${days} days ahead, instead of ${current}. This applies to every community.`,
      confirmLabel: 'Change window',
      tone: 'warning',
    });
    if (r.ok) save.mutate();
  };
  return (
    <InfoBanner>
      <div className="row-between" style={{ width: '100%' }}>
        <span>
          Residents can choose a start date from tomorrow up to <strong>{current} days</strong> ahead (no same-day booking).
        </span>
        {can(me, 'scheduling', 'edit') ? (
          <span className="row">
            <input
              className="input input-compact"
              type="number"
              min={1}
              max={60}
              placeholder="Days"
              aria-label="Booking window in days"
              style={{ width: 90 }}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <Button size="sm" variant="secondary" busy={save.isPending} disabled={!days} onClick={() => void submit()}>
              Change
            </Button>
          </span>
        ) : null}
      </div>
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
  const toast = useToast();
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
      toast(slot ? 'Slot saved' : 'Slot added');
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
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={save.isPending} onClick={() => save.mutate()} disabled={!label.trim() || days === 0}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
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
        <div className="grid-2">
          <TextInput label="Start time" type="time" value={startTime} disabled={published} onChange={(e) => setStartTime(e.target.value)} error={err?.field('startTime')} />
          <TextInput
            label="Duration (minutes)"
            type="number"
            min={15}
            max={720}
            value={duration}
            disabled={published}
            onChange={(e) => setDuration(e.target.value)}
            error={err?.field('durationMinutes')}
          />
        </div>
        <TextInput
          label="Capacity (households)"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={err?.field('capacity')}
          hint={published && slot ? `${slot.used} households already booked.` : undefined}
        />
        {!published ? <DaysInput value={days} onChange={setDays} /> : null}
        <ErrorBanner error={err?.fields.length ? null : save.error} />
      </div>
    </Modal>
  );
}
