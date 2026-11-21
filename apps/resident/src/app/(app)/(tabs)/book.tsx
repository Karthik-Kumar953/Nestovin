import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { BookingOptions, ResidentCatalogue } from '@nestovin/contracts';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Entrance,
  Icon,
  IconButton,
  Photo,
  PressScale,
  Screen,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { useBookingOptions, useCatalogue, useMe } from '../../../lib/queries';
import { bookingNotOpenReason } from '../../../lib/residence';
import { dateTime, rupees, validity } from '../../../lib/format';
import { lowestPrice, planAvailability, type Plan } from '../../../lib/selection';
import { SERVICE_VISUAL, img, serviceKind, type ServiceKind } from '../../../assets/images';
import { ErrorState, OfflineNotice } from '../../../components/common';

const asFilter = (s: string | undefined): ServiceKind | 'all' =>
  s === 'maid' || s === 'cook' || s === 'caretaker' ? s : 'all';

/** RES-06: plans for the resident's flat category, as membership cards, with every "not open" state designed. */
export default function Book() {
  const params = useLocalSearchParams<{ service?: string; at?: string }>();
  const me = useMe();
  const options = useBookingOptions();
  const catalogue = useCatalogue(Boolean(options.data?.eligible));
  const [filter, setFilter] = useState<ServiceKind | 'all'>(asFilter(params.service));
  // Tabs stay mounted, so apply the service each time Home links here (`at` changes on every tap).
  useEffect(() => {
    if (params.service) setFilter(asFilter(params.service));
  }, [params.service, params.at]);
  const m = me.data?.membership;
  const refresh = () => Promise.all([options.refetch(), catalogue.refetch()]);
  const header = {
    title: 'Book',
    eyebrow:
      m && catalogue.data?.residenceCategory
        ? `Plans for your ${catalogue.data.residenceCategory.label} · ${m.flatNumber}`
        : (m?.communityName ?? null),
    actions: (
      <IconButton
        icon="receipt-outline"
        label="My bookings"
        onPress={() => router.push('/bookings')}
      />
    ),
    onRefresh: () => void refresh(),
    refreshing: options.isRefetching || catalogue.isRefetching,
  };

  if (options.isLoading || (options.data?.eligible && catalogue.isLoading)) {
    return (
      <Screen {...header}>
        <SkeletonList count={2} media />
      </Screen>
    );
  }
  if (options.error || catalogue.error) {
    return (
      <Screen {...header}>
        <ErrorState error={options.error ?? catalogue.error} onRetry={() => void refresh()} />
      </Screen>
    );
  }
  if (!options.data?.eligible) {
    return (
      <Screen {...header}>
        <NotOpen
          options={options.data!}
          community={options.data?.communityName ?? m?.communityName}
        />
      </Screen>
    );
  }
  return (
    <Screen {...header}>
      <OfflineNotice />
      <Plans
        cat={catalogue.data!}
        options={options.data}
        filter={filter}
        setFilter={setFilter}
        community={m?.communityName}
      />
    </Screen>
  );
}

function Plans({
  cat,
  options,
  filter,
  setFilter,
  community,
}: {
  cat: ResidentCatalogue;
  options: BookingOptions;
  filter: ServiceKind | 'all';
  setFilter: (f: ServiceKind | 'all') => void;
  community?: string;
}) {
  const kindOfService = useMemo(
    () => new Map(cat.services.map((s) => [s.serviceId, serviceKind(s.code || s.name)])),
    [cat],
  );
  const kinds = [...new Set(cat.services.map((s) => kindOfService.get(s.serviceId)!))].filter(
    (k) => k !== 'other',
  );
  const plans = cat.plans.filter(
    (p) => filter === 'all' || p.components.some((c) => kindOfService.get(c.serviceId) === filter),
  );
  const open = cat.plans.filter((p) => planAvailability(cat, p, options).open);
  const round = options.openCycles[0];

  if (!cat.plans.length) {
    return (
      <EmptyState
        illustration={img('ill-not-live.png')}
        icon="construct-outline"
        title="No plans for your flat yet"
        body="Plans appear here once prices for your community are published. We will let you know."
      />
    );
  }

  return (
    <View className="gap-4">
      {kinds.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
          accessibilityRole="tablist"
          accessibilityLabel="Filter plans by service"
        >
          {(['all', ...kinds] as const).map((k) => {
            const on = filter === k;
            return (
              <PressScale
                key={k}
                onPress={() => setFilter(k)}
                haptic="select"
                accessibilityRole="tab"
                aria-selected={on}
                accessibilityLabel={k === 'all' ? 'All plans' : SERVICE_VISUAL[k].label}
                className={`flex-row items-center gap-1.5 rounded-full px-4 min-h-[44px] border ${on ? 'bg-teal border-teal' : 'bg-white border-line'}`}
              >
                <Icon
                  name={k === 'all' ? 'grid-outline' : SERVICE_VISUAL[k].icon}
                  size={16}
                  color={on ? colors.white : colors.tealDeep}
                />
                <Text variant="label" tone={on ? 'inverse' : 'default'}>
                  {k === 'all' ? 'All' : SERVICE_VISUAL[k].label}
                </Text>
              </PressScale>
            );
          })}
        </ScrollView>
      ) : null}

      {!open.length ? (
        <Card tone="mint" className="items-center gap-2 py-6">
          <Icon name="calendar-clear-outline" size="lg" color={colors.tealDeep} />
          <Text variant="h3" className="text-center">
            No booking round is open right now
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {`Plans${community ? ` in ${community}` : ''} open in booking rounds. We will notify you when the next one opens.`}
          </Text>
        </Card>
      ) : round ? (
        <Card tone="mint" className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Icon name="time-outline" size="sm" color={colors.tealDeep} />
            <Text variant="bodyStrong">{`${round.name} is open until ${dateTime(round.closesAt)}`}</Text>
          </View>
          <Text
            variant="sm"
            tone="muted"
          >{`For round-based plans you pay ${round.initialPct}% now and the rest once your time slot is confirmed.`}</Text>
        </Card>
      ) : null}

      {plans.map((p, i) => (
        <Entrance key={p.id} index={i}>
          <PlanCard plan={p} cat={cat} options={options} kindOf={kindOfService} />
        </Entrance>
      ))}
      <Text variant="sm" tone="muted" className="text-center px-4">
        You do not choose a named worker. Nestovin assigns trained staff to your slot.
      </Text>
    </View>
  );
}

function PlanCard({
  plan,
  cat,
  options,
  kindOf,
}: {
  plan: Plan;
  cat: ResidentCatalogue;
  options: BookingOptions;
  kindOf: Map<string, ServiceKind>;
}) {
  const avail = planAvailability(cat, plan, options);
  const lead =
    kindOf.get(plan.components.find((c) => !c.isOptionalAddon)?.serviceId ?? '') ?? 'other';
  const visual = SERVICE_VISUAL[lead];
  const services = [
    ...new Set(
      plan.components
        .filter((c) => !c.isOptionalAddon)
        .map((c) => kindOf.get(c.serviceId) ?? 'other'),
    ),
  ];
  const hasAddons = plan.components.some((c) => c.isOptionalAddon);
  const from = lowestPrice(plan);
  const modeChip =
    avail.mode === 'DEMAND_LED'
      ? { label: 'Booking round', tone: 'info' as const }
      : avail.mode === 'CONTINUOUS'
        ? { label: 'Start within 14 days', tone: 'success' as const }
        : { label: 'Choose service', tone: 'neutral' as const };
  return (
    <Card
      padded={false}
      raised
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      accessibilityLabel={`${plan.name}, ${modeChip.label}, ${validity(plan.validityDays)}${from !== null ? `, from ${rupees(from)} including taxes` : ''}${avail.open ? '' : ', not open now'}`}
    >
      <Photo
        source={visual.photo ? img(visual.photo) : null}
        fallbackIcon={visual.icon}
        fallbackTone={visual.tone}
        scrim
        style={{ height: 150 }}
      >
        <View className="flex-1 justify-between p-4">
          <View className="flex-row gap-2">
            <StatusChip
              label={modeChip.label}
              tone="inverse"
              icon={avail.mode === 'DEMAND_LED' ? 'time-outline' : 'flash-outline'}
            />
            {!avail.open ? (
              <StatusChip label="Not open now" tone="inverse" icon="pause-circle-outline" />
            ) : null}
          </View>
          <View>
            <Text variant="h2" tone="inverse">
              {plan.name}
            </Text>
            <Text variant="sm" tone="inverseMuted">{`${validity(plan.validityDays)} plan`}</Text>
          </View>
        </View>
      </Photo>
      <View className="p-5 gap-4">
        <View className="flex-row flex-wrap gap-2">
          {services.map((k) => (
            <View
              key={k}
              className="flex-row items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5"
            >
              <Icon name={SERVICE_VISUAL[k].icon} size={14} color={colors.tealDeep} />
              <Text variant="label" tone="brand">
                {SERVICE_VISUAL[k].label}
              </Text>
            </View>
          ))}
          {hasAddons ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-surface-subtle px-3 py-1.5">
              <Icon name="add-circle-outline" size={14} color={colors.textSecondary} />
              <Text variant="label" tone="muted">
                Add-ons
              </Text>
            </View>
          ) : null}
        </View>
        {plan.description ? (
          <Text variant="body" tone="muted" numberOfLines={2}>
            {plan.description}
          </Text>
        ) : null}
        <View className="h-px bg-line" />
        <View className="flex-row items-end justify-between">
          <View>
            <Text variant="caption" tone="muted">
              {plan.servicePrices.length + (plan.packagePricePaise !== null ? 1 : 0) > 1
                ? 'From'
                : 'Price'}
            </Text>
            <View className="flex-row items-end gap-1">
              <Text
                variant="metric"
                className="text-charcoal"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {from !== null ? rupees(from) : '—'}
              </Text>
              <Text variant="sm" tone="muted" className="pb-1">
                incl. taxes
              </Text>
            </View>
          </View>
          <View className="h-11 w-11 rounded-full bg-teal items-center justify-center">
            <Icon name="arrow-forward" color={colors.white} />
          </View>
        </View>
      </View>
    </Card>
  );
}

/** Booking not open: not registered, under review, no pricing category, or the community is not live. */
function NotOpen({ options, community }: { options: BookingOptions; community?: string }) {
  const reason = bookingNotOpenReason(options);
  switch (reason) {
    case 'NOT_REGISTERED':
      return (
        <EmptyState
          illustration={img('ill-verify-review.png')}
          icon="home-outline"
          title="Register your flat to book"
          body="Choose your flat and add one proof of residence. Booking opens once it is verified."
        >
          <Button title="Register my flat" onPress={() => router.push('/register')} />
        </EmptyState>
      );
    case 'NOT_VERIFIED':
      return (
        <EmptyState
          illustration={img('ill-verify-review.png')}
          icon="time-outline"
          tone="info"
          title="Your residence is being verified"
          body="Booking opens as soon as our team approves your document. We will notify you."
        />
      );
    case 'COMMUNITY_NOT_LIVE':
      return (
        <EmptyState
          illustration={img('ill-not-live.png')}
          icon="construct-outline"
          title={`Booking is not open${community ? ` in ${community}` : ''} yet`}
          body="Our team is still setting up services for your community. Your residence stays verified and we will notify you when booking opens."
        />
      );
    case 'NO_CATEGORY':
      return (
        <EmptyState
          illustration={img('ill-not-live.png')}
          icon="pricetags-outline"
          title="Plans are not ready for your flat"
          body={options.reason ?? 'Your flat does not have a pricing category yet.'}
        >
          <Button
            title="Contact support"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/ticket/new',
                params: { subject: 'Plans not available for my flat' },
              })
            }
          />
        </EmptyState>
      );
    default:
      return (
        <View className="gap-4">
          <EmptyState
            illustration={img('ill-not-live.png')}
            icon="calendar-clear-outline"
            title="Booking is not open right now"
            body={options.reason ?? 'Please check back soon.'}
          />
          <Banner tone="info">We will notify you in Updates when booking opens.</Banner>
        </View>
      );
  }
}
