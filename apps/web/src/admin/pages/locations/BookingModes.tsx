'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Community, CommunityServices, OperatingMode } from '@nestovin/contracts';
import { api, ApiError } from '../../lib/api';
import { can } from '../../lib/permissions';
import { useMe } from '../../auth/AuthProvider';
import { ButtonLink, ErrorBanner, InfoBanner, Panel, Segmented, Skeleton, useConfirm, useToast } from '../../components/ui';
import { CalendarClock, Settings, Zap } from '../../components/icons';

/*
 * RES-07A booking mode ("operating mode") per community and service. It decides
 * which journey residents see: DEMAND_LED → join a demand cycle (collect demand
 * manually); CONTINUOUS → book a published slot (open slots automatically).
 * A service without its own mode follows the community default.
 */

export const BOOKING_MODE: Record<OperatingMode, { label: string; short: string; resident: string }> = {
  DEMAND_LED: {
    label: 'Collect demand manually',
    short: 'Demand collection',
    resident: 'Residents join an open demand cycle, pay the initial amount, and are allotted a slot when the cycle closes.',
  },
  CONTINUOUS: {
    label: 'Open slots automatically',
    short: 'Open slots',
    resident: 'Residents pick a published slot, pay in full, and start from tomorrow up to the booking window.',
  },
};
const MODE_ITEMS: { value: OperatingMode; label: string }[] = [
  { value: 'DEMAND_LED', label: BOOKING_MODE.DEMAND_LED.label },
  { value: 'CONTINUOUS', label: BOOKING_MODE.CONTINUOUS.label },
];

/** Compact "Maid · Open slots" chips for the communities list. */
export function BookingModeChips({ modes }: { modes: Community['bookingModes'] }) {
  if (!modes?.length) return <span className="faint">No services yet</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {modes.map((m) => (
        <span
          key={m.code}
          className={`badge ${m.mode === 'CONTINUOUS' ? 'badge-teal' : m.mode === 'DEMAND_LED' ? 'badge-info' : 'badge-warning'}`}
          title={m.mode ? BOOKING_MODE[m.mode].label : 'No booking mode set'}
        >
          {m.name} · {m.mode ? BOOKING_MODE[m.mode].short : 'Not set'}
        </span>
      ))}
    </span>
  );
}

type Payload = { defaultOperatingMode: OperatingMode | null; services: { serviceId: string; enabled: boolean; operatingMode: OperatingMode | null }[] };

/** Community detail: the per-service booking-mode switch with a confirm step. */
export function BookingModePanel({ communityId }: { communityId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const editable = can(me, 'catalogue_pricing', 'edit');
  const services = useQuery({
    queryKey: ['setup', communityId, 'services'],
    queryFn: () => api<CommunityServices>(`/v1/admin/communities/${communityId}/services`),
  });
  const save = useMutation({
    mutationFn: (body: Payload) => api<CommunityServices>(`/v1/admin/communities/${communityId}/services`, { method: 'PUT', body }),
    onSuccess: async () => {
      toast('Booking mode updated');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['setup', communityId] }),
        qc.invalidateQueries({ queryKey: ['communities'] }),
        qc.invalidateQueries({ queryKey: ['activation', communityId] }),
      ]);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : 'Could not change the booking mode', 'error'),
  });

  if (services.isLoading) {
    return (
      <Panel title="Booking mode">
        <div className="stack-sm">
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      </Panel>
    );
  }
  if (services.error || !services.data) return <ErrorBanner error={services.error ?? new Error('Could not load services')} />;
  const data = services.data;
  const current = (): Payload => ({
    defaultOperatingMode: data.defaultOperatingMode,
    services: data.services.map((s) => ({ serviceId: s.serviceId, enabled: s.enabled, operatingMode: s.operatingMode })),
  });

  const change = async (opts: { name: string; to: OperatingMode | null; from: OperatingMode | null; apply: (p: Payload) => Payload; isDefault?: boolean }) => {
    if (opts.to === opts.from) return;
    const target = opts.to ?? data.defaultOperatingMode;
    const result = await confirm({
      title: opts.isDefault ? 'Change the community default booking mode?' : `Change how ${opts.name} is booked?`,
      tone: 'warning',
      confirmLabel: target ? `Switch to ${BOOKING_MODE[target].short.toLowerCase()}` : 'Follow the default',
      body: (
        <div className="stack-sm">
          <p className="m-0">
            {opts.isDefault ? 'Services that follow the default' : opts.name} will switch
            {opts.from ? (
              <>
                {' '}
                from <strong>{BOOKING_MODE[opts.from].label.toLowerCase()}</strong>
              </>
            ) : null}{' '}
            to <strong>{target ? BOOKING_MODE[target].label.toLowerCase() : 'the community default'}</strong>.
          </p>
          {target ? <p className="m-0 muted">{BOOKING_MODE[target].resident}</p> : null}
          <p className="m-0 muted">
            Existing bookings and paid requests are kept. New requests or bookings in the old mode are refused from now on.
            {target === 'DEMAND_LED' ? ' Open a demand cycle so residents can join.' : target === 'CONTINUOUS' ? ' Publish slots so residents can book.' : ''}
          </p>
        </div>
      ),
    });
    if (result.ok) save.mutate(opts.apply(current()));
  };

  const enabled = data.services.filter((s) => s.enabled);
  const modesInUse = new Set(enabled.map((s) => s.effectiveMode));

  return (
    <Panel
      title="Booking mode"
      subtitle="Decides which booking journey residents see for each service. Only Super Admins and admins who can edit catalogue & pricing can change it."
      actions={
        <>
          {modesInUse.has('DEMAND_LED') ? (
            <ButtonLink to={`/demand/cycles?communityId=${communityId}`} size="sm" icon={CalendarClock}>
              Open a demand cycle
            </ButtonLink>
          ) : null}
          {modesInUse.has('CONTINUOUS') ? (
            <ButtonLink to={`/scheduling/slots?communityId=${communityId}`} size="sm" icon={Zap}>
              Publish slots
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <div className="stack">
        {save.error ? <ErrorBanner error={save.error} /> : null}
        {!editable ? <InfoBanner>You can view the booking mode. Changing it needs catalogue & pricing edit access.</InfoBanner> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-rule bg-sunken px-3.5 py-3">
          <div style={{ minWidth: 0 }}>
            <strong>Community default</strong>
            <div className="muted text-[12.5px]">
              {data.defaultOperatingMode ? 'Used by every service without its own mode.' : 'Not set. Services without their own mode cannot be booked.'}
            </div>
          </div>
          <Segmented<OperatingMode>
            label="Community default booking mode"
            value={data.defaultOperatingMode ?? ('' as OperatingMode)}
            items={MODE_ITEMS}
            disabled={!editable || save.isPending}
            onChange={(v) =>
              change({ name: 'Community default', isDefault: true, from: data.defaultOperatingMode, to: v, apply: (p) => ({ ...p, defaultOperatingMode: v }) })
            }
          />
        </div>

        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {data.services.map((s) => (
            <li key={s.serviceId} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3 last:border-b-0">
              <div style={{ minWidth: 0 }}>
                <strong>{s.name}</strong>
                <div className="muted text-[12.5px]">
                  {!s.enabled
                    ? 'Not offered in this community.'
                    : s.operatingMode
                      ? `Own setting${data.defaultOperatingMode && s.operatingMode !== data.defaultOperatingMode ? ' (differs from the default)' : ''}.`
                      : s.effectiveMode
                        ? `Follows the community default.${s.code === 'CARETAKER' ? ' Usually sold as an add-on.' : ''}`
                        : 'No mode yet: set one here or set the community default.'}
                </div>
              </div>
              {s.enabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented<OperatingMode>
                    label={`${s.name} booking mode`}
                    value={s.effectiveMode ?? ('' as OperatingMode)}
                    items={MODE_ITEMS}
                    disabled={!editable || save.isPending}
                    onChange={(v) =>
                      change({
                        name: s.name,
                        from: s.effectiveMode,
                        to: v,
                        apply: (p) => ({ ...p, services: p.services.map((x) => (x.serviceId === s.serviceId ? { ...x, operatingMode: v } : x)) }),
                      })
                    }
                  />
                  {editable && s.operatingMode && data.defaultOperatingMode ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={save.isPending}
                      onClick={() =>
                        change({
                          name: s.name,
                          from: s.effectiveMode,
                          to: null,
                          apply: (p) => ({ ...p, services: p.services.map((x) => (x.serviceId === s.serviceId ? { ...x, operatingMode: null } : x)) }),
                        })
                      }
                    >
                      Use default
                    </button>
                  ) : null}
                </div>
              ) : editable ? (
                <ButtonLink to={`/locations/communities/${communityId}/setup`} size="sm" variant="ghost" icon={Settings}>
                  Offer it in setup
                </ButtonLink>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
