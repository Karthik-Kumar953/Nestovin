import { useMemo, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors } from '@nestovin/design-tokens';
import type { BookingOptions, BookingView, Checkout, ResidentCatalogue, ResidentDemandRequest } from '@nestovin/contracts';
import { api, errorMessage, idempotencyKey, rupees } from '../../lib/api';
import { PaymentCancelled, payWithRazorpay } from '../../lib/payments';
import { useMe } from './index';
import { Badge, Banner, Button, Card, Choice, Empty, ErrorText, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

type Plan = ResidentCatalogue['plans'][number];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const daysLabel = (m: number) => (m === 127 ? 'Every day' : m === 63 ? 'Mon–Sat' : DAYS.filter((_, i) => m & (1 << i)).join(', '));

/** RES-06/07/08: plans, demand-led requests and continuous bookings, with Razorpay payment. */
export default function Book() {
  const qc = useQueryClient();
  const me = useMe();
  const options = useQuery({ queryKey: ['booking-options'], queryFn: () => api<BookingOptions>('/v1/resident/booking-options') });
  const catalogue = useQuery({ queryKey: ['catalogue'], enabled: Boolean(options.data?.eligible), queryFn: () => api<ResidentCatalogue>('/v1/resident/catalogue') });

  const [planId, setPlanId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | 'PACKAGE' | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [windows, setWindows] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null);

  const plan: Plan | undefined = catalogue.data?.plans.find((p) => p.id === planId);
  const modes = new Map((catalogue.data?.services ?? []).map((s) => [s.serviceId, s.operatingMode]));
  const chosenServices = useMemo(() => {
    if (!plan || !serviceId) return [];
    const base = plan.components.filter((c) => !c.isOptionalAddon && (serviceId === 'PACKAGE' || c.serviceId === serviceId)).map((c) => c.serviceId);
    const extra = plan.components.filter((c) => addons.includes(c.id)).map((c) => c.serviceId);
    return [...new Set([...base, ...extra])];
  }, [plan, serviceId, addons]);
  const chosenModes = [...new Set(chosenServices.map((s) => modes.get(s)))];
  const mode = chosenModes.length === 1 ? chosenModes[0] : chosenModes.length > 1 ? 'MIXED' : null;
  const basePrice = !plan || !serviceId ? null : serviceId === 'PACKAGE' ? plan.packagePricePaise : (plan.servicePrices.find((p) => p.serviceId === serviceId)?.pricePaise ?? null);
  const addonPrice = plan ? plan.components.filter((c) => addons.includes(c.id)).reduce((s, c) => s + (c.addonPricePaise ?? 0), 0) : 0;
  const total = basePrice === null ? null : basePrice + addonPrice;
  const cycle = options.data?.openCycles.find((c) => planId && c.planIds.includes(planId));
  const slots = (options.data?.continuousSlots ?? []).filter((s) => s.available && (!s.serviceId || chosenServices.includes(s.serviceId)));
  const dates = useMemo(() => {
    const r = options.data?.startDateRange;
    if (!r) return [];
    const out: string[] = [];
    for (let d = new Date(`${r.from}T00:00:00Z`); d <= new Date(`${r.to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return out;
  }, [options.data?.startDateRange]);

  const pay = async (checkout: Checkout) => {
    try {
      const result = await payWithRazorpay(checkout, { contact: me.data?.phone });
      setNotice({ tone: result.orderStatus === 'PAID' ? 'success' : 'warning', text: result.message });
    } catch (e) {
      setNotice({ tone: e instanceof PaymentCancelled ? 'warning' : 'error', text: errorMessage(e) });
    }
    await qc.invalidateQueries({ queryKey: ['bookings'] });
    await qc.invalidateQueries({ queryKey: ['demand-requests'] });
  };

  const demand = useMutation({
    mutationFn: () =>
      api<{ request: ResidentDemandRequest; checkout: Checkout }>('/v1/resident/demand-requests', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: {
          cycleId: cycle!.id,
          selection: { planId, serviceId: serviceId === 'PACKAGE' ? null : serviceId, addonComponentIds: addons },
          preferredWindowIds: windows,
          acceptNonRefundable: true,
          disclosureVersion: options.data!.disclosure.version,
        },
      }),
    onSuccess: (r) => pay(r.checkout),
  });
  const continuous = useMutation({
    mutationFn: () =>
      api<{ booking: BookingView; checkout: Checkout }>('/v1/resident/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey() },
        body: { slotId, startDate, selection: { planId, serviceId: serviceId === 'PACKAGE' ? null : serviceId, addonComponentIds: addons } },
      }),
    onSuccess: (r) => pay(r.checkout),
  });

  if (options.isLoading) return <Screen><Loading /></Screen>;
  if (options.error) return <Screen><ErrorText error={options.error} /></Screen>;
  if (!options.data?.eligible) {
    return (
      <Screen>
        <H1>Book a service</H1>
        <Card>
          <P>{options.data?.reason ?? 'Booking is not available yet.'}</P>
          <Button title="Go to home" variant="secondary" onPress={() => router.push('/')} />
        </Card>
      </Screen>
    );
  }

  const reset = () => { setServiceId(null); setAddons([]); setWindows([]); setAccepted(false); setSlotId(null); setStartDate(null); setNotice(null); };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Book a service</H1>
        <Button title="My bookings" variant="ghost" onPress={() => router.push('/bookings')} />
      </Row>
      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {catalogue.isLoading ? <Loading /> : null}
      {catalogue.data && catalogue.data.plans.length === 0 ? <Empty title="No plans for your flat yet" body="Plans appear here once your community’s prices are published." /> : null}

      {(catalogue.data?.plans ?? []).length ? (
        <Card>
          <H2>Choose a plan</H2>
          <Choice
            options={(catalogue.data?.plans ?? []).map((p) => ({ value: p.id, label: p.name, detail: `${p.validityDays} days${p.description ? ` · ${p.description}` : ''}` }))}
            value={planId}
            onChange={(v) => { setPlanId(v); reset(); }}
          />
        </Card>
      ) : null}

      {plan ? (
        <Card>
          <H2>What do you need?</H2>
          <Choice
            options={[
              ...(plan.packagePricePaise !== null ? [{ value: 'PACKAGE', label: 'Complete package', detail: rupees(plan.packagePricePaise) }] : []),
              ...plan.servicePrices.map((s) => ({ value: s.serviceId, label: s.name, detail: rupees(s.pricePaise) })),
            ]}
            value={serviceId}
            onChange={(v) => { setServiceId(v); setAddons([]); setSlotId(null); }}
          />
          {plan.components
            .filter((c) => !c.isOptionalAddon && (serviceId === 'PACKAGE' || c.serviceId === serviceId))
            .map((c) => (
              <P key={c.id} muted>
                {c.name}: {c.visitsPerDay} visit{c.visitsPerDay > 1 ? 's' : ''} a day · {c.durationMinutes} min · {daysLabel(c.daysOfWeek)}
                {c.timeWindow ? ` · ${c.timeWindow.name}` : ''}
              </P>
            ))}
          {plan.components.filter((c) => c.isOptionalAddon).length && serviceId ? (
            <>
              <P style={{ fontWeight: '600' }}>Optional add-ons</P>
              {plan.components
                .filter((c) => c.isOptionalAddon)
                .map((c) => {
                  const on = addons.includes(c.id);
                  return (
                    <Pressable key={c.id} onPress={() => setAddons(on ? addons.filter((x) => x !== c.id) : [...addons, c.id])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                      <Text style={{ color: on ? colors.tealAction : colors.textPrimary, fontSize: 16 }}>
                        {on ? '☑' : '☐'} {c.name}{c.addonHours ? ` (${c.addonHours} h)` : ''} · {rupees(c.addonPricePaise ?? 0)}
                      </Text>
                    </Pressable>
                  );
                })}
            </>
          ) : null}
        </Card>
      ) : null}

      {total !== null && mode === 'MIXED' ? <Banner tone="warning">These services are booked in different ways in your community. Choose them separately.</Banner> : null}

      {total !== null && mode === 'DEMAND_LED' ? (
        cycle ? (
          <Card>
            <Row><H2>Join demand: {cycle.name}</H2><Badge label="Demand-led" tone="info" /></Row>
            <P muted>Open until {new Date(cycle.closesAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Pay {cycle.initialPct}% now to commit; we confirm your slot and start date later, then you pay the rest.</P>
            <P style={{ fontWeight: '600' }}>Preferred time (up to 3, in order)</P>
            {cycle.timeWindows.map((w) => {
              const rank = windows.indexOf(w.id);
              return (
                <Pressable key={w.id} onPress={() => setWindows(rank >= 0 ? windows.filter((x) => x !== w.id) : windows.length < 3 ? [...windows, w.id] : windows)} accessibilityRole="checkbox" accessibilityState={{ checked: rank >= 0 }}>
                  <Text style={{ fontSize: 16, color: rank >= 0 ? colors.tealAction : colors.textPrimary }}>
                    {rank >= 0 ? `${rank + 1}.` : '○'} {w.name} ({w.startTime}–{w.endTime})
                  </Text>
                </Pressable>
              );
            })}
            <P>Total {rupees(total)} (inclusive of taxes) · pay now about {rupees(Math.floor((total * cycle.initialPct * 2 + 100) / 200))}</P>
            <Banner tone="warning">{options.data.disclosure.text}</Banner>
            <Pressable onPress={() => setAccepted(!accepted)} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }}>
              <Text style={{ fontSize: 16 }}>{accepted ? '☑' : '☐'} I understand and accept these payment terms</Text>
            </Pressable>
            {demand.error ? <Banner tone="error">{errorMessage(demand.error)}</Banner> : null}
            <Button title="Commit and pay" disabled={!accepted || windows.length === 0} busy={demand.isPending} onPress={() => demand.mutate()} />
          </Card>
        ) : (
          <Card>
            <P>There is no open demand cycle for this plan right now. We will notify you when one opens.</P>
          </Card>
        )
      ) : null}

      {total !== null && mode === 'CONTINUOUS' ? (
        <Card>
          <Row><H2>Choose a slot</H2><Badge label="Book now" tone="success" /></Row>
          {slots.length === 0 ? <P muted>No slots are available for this right now.</P> : null}
          <Choice options={slots.map((s) => ({ value: s.id, label: `${s.label} · ${s.startTime}`, detail: `${s.durationMinutes} min · ${daysLabel(s.daysOfWeek)}` }))} value={slotId} onChange={setSlotId} />
          {slotId ? (
            <>
              <P style={{ fontWeight: '600' }}>Start date</P>
              <Choice options={dates.map((d) => ({ value: d, label: new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) }))} value={startDate} onChange={setStartDate} />
            </>
          ) : null}
          <P>Total {rupees(total)} (inclusive of taxes), paid in full now.</P>
          {continuous.error ? <Banner tone="error">{errorMessage(continuous.error)}</Banner> : null}
          <Button title={`Pay ${rupees(total)}`} disabled={!slotId || !startDate} busy={continuous.isPending} onPress={() => continuous.mutate()} />
        </Card>
      ) : null}
    </Screen>
  );
}
