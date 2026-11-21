import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Banner,
  Button,
  Card,
  ChoiceTile,
  Entrance,
  Icon,
  IconTile,
  Photo,
  Screen,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { useBookingOptions, useCatalogue } from '../../../lib/queries';
import { daysLabel, rupees, taskFrequency, validity } from '../../../lib/format';
import { componentSummary, planAvailability, resolveSelection, type ServiceChoice } from '../../../lib/selection';
import { SERVICE_VISUAL, img, serviceIcon, serviceKind } from '../../../assets/images';
import { ErrorState } from '../../../components/common';

/** Plan detail: what is included, the choice (package or one service), add-ons, conditions, and the one next step. */
export default function PlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const options = useBookingOptions();
  const catalogue = useCatalogue(true);
  const plan = catalogue.data?.plans.find((p) => p.id === id);
  const choices = useMemo(
    () =>
      plan
        ? [
            ...(plan.packagePricePaise !== null ? [{ value: 'PACKAGE' as ServiceChoice, label: 'Complete package', detail: 'Every service in this plan', price: plan.packagePricePaise }] : []),
            ...plan.servicePrices.map((s) => ({ value: s.serviceId as ServiceChoice, label: s.name, detail: null as string | null, price: s.pricePaise })),
          ]
        : [],
    [plan],
  );
  const [serviceId, setServiceId] = useState<ServiceChoice | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const chosen = serviceId ?? (choices.length === 1 ? choices[0]!.value : null);
  const sel = resolveSelection(catalogue.data, id, chosen, addons);

  if (options.isLoading || catalogue.isLoading) return <Screen title="Plan" onBack={() => router.back()}><SkeletonList count={3} media /></Screen>;
  if (!plan || !catalogue.data || !options.data) {
    return (
      <Screen title="Plan" onBack={() => router.back()}>
        <ErrorState error={options.error ?? catalogue.error ?? new Error('This plan is no longer available.')} onRetry={() => void catalogue.refetch()} />
      </Screen>
    );
  }

  const avail = planAvailability(catalogue.data, plan, options.data);
  const cycle = avail.cycle;
  const mode = sel.mode ?? avail.mode;
  const lead = serviceKind(catalogue.data.services.find((s) => s.serviceId === plan.components[0]?.serviceId)?.code);
  const visual = SERVICE_VISUAL[lead];
  const shown = sel.base.length ? sel.base : plan.components.filter((c) => !c.isOptionalAddon);
  const tasks = shown.flatMap((c) => c.tasks.map((t) => ({ ...t, key: `${c.id}-${t.name}` })));
  const optional = plan.components.filter((c) => c.isOptionalAddon);
  const blocked = mode === 'MIXED' || (mode === 'DEMAND_LED' && !cycle) || (mode === 'CONTINUOUS' && !avail.slots.length);
  const next = () => {
    if (!chosen) return;
    const params = { planId: plan.id, serviceId: chosen, addons: addons.join(',') };
    router.push({ pathname: mode === 'DEMAND_LED' ? '/booking/round' : '/booking/slot', params });
  };

  return (
    <Screen
      title={plan.name}
      onBack={() => router.back()}
      hero={
        <Photo source={visual.photo ? img(visual.photo) : null} fallbackIcon={visual.icon} scrim style={{ height: 300 + insets.top }}>
          <View className="flex-1 justify-end px-gutter pb-6 gap-2">
            <View className="flex-row flex-wrap gap-2">
              <StatusChip label={mode === 'DEMAND_LED' ? 'Booking round' : mode === 'CONTINUOUS' ? 'Start within 14 days' : 'Choose a service'} tone="inverse" icon={mode === 'DEMAND_LED' ? 'time-outline' : 'flash-outline'} />
              <StatusChip label={validity(plan.validityDays)} tone="inverse" icon="calendar-outline" />
              {catalogue.data.residenceCategory ? <StatusChip label={catalogue.data.residenceCategory.label} tone="inverse" icon="home-outline" /> : null}
            </View>
            <Text variant="display" tone="inverse">{plan.name}</Text>
            {plan.description ? <Text variant="body" tone="inverseMuted">{plan.description}</Text> : null}
          </View>
        </Photo>
      }
      footer={
        <View className="flex-row items-center gap-4">
          <View className="flex-shrink">
            <Text variant="caption" tone="muted">{mode === 'DEMAND_LED' ? `Total for ${validity(plan.validityDays)}, incl. taxes` : 'Pay now, incl. taxes'}</Text>
            <Text variant="h2" className="text-charcoal" style={{ fontVariant: ['tabular-nums'] }}>{sel.total !== null ? rupees(sel.total) : 'Choose'}</Text>
          </View>
          <View className="flex-1">
            <Button title={mode === 'DEMAND_LED' ? 'Join booking round' : 'Choose a slot'} iconRight="arrow-forward" disabled={!chosen || blocked} onPress={next} />
          </View>
        </View>
      }
    >
      <View className="pt-5 gap-5">
        <Text variant="body" tone="muted">
          {mode === 'DEMAND_LED'
            ? 'Join the round with your preferred times. Your slot and start date are confirmed after the round closes.'
            : 'Pick an available slot and a start date from tomorrow up to 14 days ahead.'}
        </Text>
        {mode === 'MIXED' ? <Banner tone="warning" title="Book these separately">These services are booked in different ways in your community. Choose one service at a time.</Banner> : null}
        {mode === 'DEMAND_LED' && !cycle ? <Banner tone="info" title="No booking round is open">We will notify you when the next round for this plan opens.</Banner> : null}
        {mode === 'CONTINUOUS' && !avail.slots.length ? <Banner tone="info" title="No slots free right now">All slots for this plan are taken. Check back soon.</Banner> : null}

        {choices.length > 1 ? (
          <View className="gap-3">
            <Text variant="h3">What do you need?</Text>
            {choices.map((c, i) => (
              <Entrance key={c.value} index={i}>
                <ChoiceTile
                  title={c.label}
                  description={c.detail}
                  icon={c.value === 'PACKAGE' ? 'layers-outline' : serviceIcon(c.label)}
                  selected={chosen === c.value}
                  onPress={() => {
                    setServiceId(c.value);
                    setAddons([]);
                  }}
                  meta={<Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{rupees(c.price)}</Text>}
                />
              </Entrance>
            ))}
          </View>
        ) : null}

        <Card className="gap-4">
          <Text variant="h3">What is included</Text>
          {shown.map((c) => (
            <View key={c.id} className="flex-row items-start gap-3">
              <IconTile icon={serviceIcon(c.name)} size={40} />
              <View className="flex-1 gap-0.5">
                <Text variant="bodyStrong">{c.name}</Text>
                <Text variant="sm" tone="muted">{componentSummary(c, daysLabel)}</Text>
                {c.timeWindow ? <Text variant="sm" tone="muted">{`${c.timeWindow.startTime} to ${c.timeWindow.endTime}`}</Text> : null}
              </View>
            </View>
          ))}
          {tasks.length ? (
            <View className="gap-2.5 border-t border-line pt-4">
              {(showAllTasks ? tasks : tasks.slice(0, 4)).map((t) => (
                <View key={t.key} className="flex-row items-center gap-2.5">
                  <Icon name="checkmark-circle" size={18} color={colors.greenAction} />
                  <Text variant="body" className="flex-1">{t.name}</Text>
                  <Text variant="sm" tone="muted">{taskFrequency(t.frequency, t.timesPerPeriod)}</Text>
                </View>
              ))}
              {tasks.length > 4 ? (
                <Pressable onPress={() => setShowAllTasks(!showAllTasks)} accessibilityRole="button" accessibilityState={{ expanded: showAllTasks }} className="min-h-[44px] justify-center">
                  <Text variant="label" tone="brand">{showAllTasks ? 'Show fewer tasks' : `Show all ${tasks.length} tasks`}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Card>

        {optional.length && chosen ? (
          <View className="gap-3">
            <Text variant="h3">Add-ons</Text>
            {optional.map((c) => {
              const on = addons.includes(c.id);
              return (
                <ChoiceTile
                  key={c.id}
                  kind="checkbox"
                  icon={serviceIcon(c.name)}
                  title={`Add ${c.name}`}
                  description={[c.addonHours ? `${c.addonHours} hours a day` : null, componentSummary(c, daysLabel)].filter(Boolean).join(' · ')}
                  selected={on}
                  onPress={() => setAddons(on ? addons.filter((x) => x !== c.id) : [...addons, c.id])}
                  meta={<Text variant="label" tone="brand">{`+${rupees(c.addonPricePaise ?? 0)}`}</Text>}
                />
              );
            })}
          </View>
        ) : null}

        <Card tone="subtle" padded={false}>
          <Pressable onPress={() => setShowTerms(!showTerms)} accessibilityRole="button" accessibilityState={{ expanded: showTerms }} className="flex-row items-center justify-between min-h-[56px] px-5">
            <Text variant="bodyStrong">Payment conditions</Text>
            <Icon name={showTerms ? 'chevron-up' : 'chevron-down'} size="sm" color={colors.textSecondary} />
          </Pressable>
          {showTerms ? (
            <View className="px-5 pb-5 gap-2">
              <Text variant="body" tone="muted">
                {mode === 'DEMAND_LED' && cycle
                  ? `You pay ${cycle.initialPct}% now to join the round. This part is non-refundable. The balance is due by the deadline shown once your slot is confirmed.`
                  : 'You pay the full amount now. Your service is confirmed only after payment succeeds and the slot is still available.'}
              </Text>
              <Text variant="sm" tone="muted">Prices include taxes. The plan, tasks and prices are fixed for your booking when you pay.</Text>
            </View>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}
