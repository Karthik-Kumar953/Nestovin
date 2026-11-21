import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BookingView, Checkout } from '@nestovin/contracts';
import { Banner, Button, Card, ChoiceTile, EmptyState, Entrance, PressScale, Screen, SkeletonList, Text } from '@nestovin/ui-native';
import { postWithKey, useCheckout } from '../../../lib/checkout';
import { dayOfMonth, dayShort, daysLabel, hhmm, localDate, longDate, monthShort, rupees, weekday, ymd } from '../../../lib/format';
import { useBookingOptions, useCatalogue } from '../../../lib/queries';
import { parseAddons, resolveSelection } from '../../../lib/selection';
import { img } from '../../../assets/images';
import { ErrorState, KeyValue } from '../../../components/common';

/** RES-08: continuous booking. Pick a published slot with capacity and a start date; pay in full. */
export default function PickSlot() {
  const p = useLocalSearchParams<{ planId: string; serviceId: string; addons?: string }>();
  const options = useBookingOptions();
  const catalogue = useCatalogue(true);
  const addons = parseAddons(p.addons);
  const sel = resolveSelection(catalogue.data, p.planId, p.serviceId, addons);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const pay = useCheckout();

  const slots = (options.data?.continuousSlots ?? []).filter((s) => s.available && (!s.serviceId || sel.services.includes(s.serviceId)));
  const dates = useMemo(() => {
    const r = options.data?.startDateRange;
    if (!r) return [];
    const out: string[] = [];
    for (let d = localDate(r.from); d <= localDate(r.to); d.setDate(d.getDate() + 1)) out.push(ymd(d));
    return out;
  }, [options.data?.startDateRange]);
  const slot = slots.find((s) => s.id === slotId);

  if (options.isLoading || catalogue.isLoading) return <Screen title="Choose a slot" onBack={() => router.back()}><SkeletonList count={3} /></Screen>;
  if (!options.data || !sel.plan || sel.total === null) {
    return <Screen title="Choose a slot" onBack={() => router.back()}><ErrorState error={options.error ?? catalogue.error ?? new Error('This plan is no longer available.')} onRetry={() => void options.refetch()} /></Screen>;
  }
  const total = sel.total;

  const body = { slotId, startDate: start, selection: { planId: p.planId, serviceId: p.serviceId === 'PACKAGE' ? null : p.serviceId, addonComponentIds: addons } };
  const book = () =>
    pay.start({
      purpose: 'book',
      path: '/v1/resident/bookings',
      body,
      create: async (key) => {
        const r = await postWithKey<{ booking: BookingView; checkout: Checkout }>('/v1/resident/bookings', key, body);
        return { checkout: r.checkout, id: r.booking.id, kind: 'booking', reference: r.booking.reference };
      },
    });

  return (
    <Screen
      title="Choose a slot"
      subtitle={`${sel.plan.name} · ${sel.label}`}
      onBack={() => router.back()}
      footer={
        <>
          {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
          <Button title={`Pay ${rupees(total)}`} icon="lock-closed" loading={pay.busy} disabled={!slotId || !start} onPress={() => void book()} accessibilityHint="Opens secure payment" />
        </>
      }
    >
      {!slots.length ? (
        <EmptyState illustration={img('ill-empty-visits.png')} icon="calendar-clear-outline" title="No slots free right now" body="Every slot for this service is taken. New capacity is published regularly; check back soon.">
          <Button title="Back to plans" variant="secondary" onPress={() => router.replace('/book')} />
        </EmptyState>
      ) : (
        <>
          <View className="gap-3">
            <Text variant="h3">Time slot</Text>
            {slots.map((s, i) => (
              <Entrance key={s.id} index={i}>
                <ChoiceTile
                  icon={Number(s.startTime.slice(0, 2)) < 12 ? 'sunny-outline' : Number(s.startTime.slice(0, 2)) < 17 ? 'partly-sunny-outline' : 'moon-outline'}
                  title={`${s.label} · ${hhmm(s.startTime)}`}
                  description={`${s.durationMinutes} min · ${daysLabel(s.daysOfWeek)}`}
                  selected={slotId === s.id}
                  onPress={() => setSlotId(s.id)}
                />
              </Entrance>
            ))}
          </View>

          <View className="gap-3">
            <Text variant="h3">Start date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }} accessibilityRole="radiogroup" accessibilityLabel="Start date">
              {dates.map((d) => {
                const on = start === d;
                return (
                  <PressScale
                    key={d}
                    onPress={() => setStart(d)}
                    haptic="select"
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={longDate(d)}
                    className={`w-[64px] items-center rounded-lg py-3 border-[1.5px] ${on ? 'bg-teal border-teal' : 'bg-white border-line'}`}
                  >
                    <Text variant="caption" tone={on ? 'inverse' : 'muted'} className="uppercase font-semibold">{weekday(d)}</Text>
                    <Text variant="h3" tone={on ? 'inverse' : 'default'}>{dayOfMonth(d)}</Text>
                    <Text variant="caption" tone={on ? 'inverseMuted' : 'muted'}>{monthShort(d)}</Text>
                  </PressScale>
                );
              })}
            </ScrollView>
          </View>

          <Card className="gap-3">
            <Text variant="h3">Summary</Text>
            <KeyValue label="Plan" value={`${sel.plan.name} · ${sel.label}`} />
            {sel.addons.map((a) => (
              <KeyValue key={a.id} label={`Add-on: ${a.name}`} value={`+${rupees(a.addonPricePaise ?? 0)}`} />
            ))}
            <KeyValue label="Slot" value={slot ? `${slot.label} · ${hhmm(slot.startTime)}` : 'Not chosen'} />
            <KeyValue label="Starts" value={start ? dayShort(start) : 'Not chosen'} />
            <View className="h-px bg-line" />
            <KeyValue label="Pay now, in full, incl. taxes" value={rupees(total)} strong />
            <Text variant="sm" tone="muted">Your service is confirmed only after payment succeeds and the slot is still available.</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
