import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Checkout, ResidentDemandRequest } from '@nestovin/contracts';
import {
  Banner,
  Button,
  Card,
  ChoiceTile,
  Entrance,
  Icon,
  Screen,
  SkeletonList,
  StatusChip,
  Text,
  colors,
} from '@nestovin/ui-native';
import { postWithKey, useCheckout } from '../../../lib/checkout';
import { dateTime, hhmm, rupees } from '../../../lib/format';
import { useBookingOptions, useCatalogue } from '../../../lib/queries';
import { initialEstimate, parseAddons, resolveSelection } from '../../../lib/selection';
import { ErrorState, KeyValue, TestPayButton } from '../../../components/common';

/**
 * RES-07: join a demand-led booking round. Up to three preferred times in order, the non-refundable
 * terms accepted explicitly, then pay the configured initial percentage. Never shown as a confirmed service.
 */
export default function JoinRound() {
  const p = useLocalSearchParams<{ planId: string; serviceId: string; addons?: string }>();
  const options = useBookingOptions();
  const catalogue = useCatalogue(true);
  const addons = parseAddons(p.addons);
  const sel = resolveSelection(catalogue.data, p.planId, p.serviceId, addons);
  const cycle = options.data?.openCycles.find((c) => c.planIds.includes(p.planId));
  const [windows, setWindows] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const pay = useCheckout();

  if (options.isLoading || catalogue.isLoading)
    return (
      <Screen title="Join booking round" onBack={() => router.back()}>
        <SkeletonList count={3} />
      </Screen>
    );
  if (!options.data || !sel.plan || sel.total === null) {
    return (
      <Screen title="Join booking round" onBack={() => router.back()}>
        <ErrorState
          error={options.error ?? catalogue.error ?? new Error('This plan is no longer available.')}
          onRetry={() => void options.refetch()}
        />
      </Screen>
    );
  }
  if (!cycle) {
    return (
      <Screen title="Join booking round" onBack={() => router.back()}>
        <Banner tone="info" title="This round has closed">
          There is no open booking round for this plan now. We will notify you when the next one
          opens.
        </Banner>
        <Button title="Back to plans" variant="secondary" onPress={() => router.replace('/book')} />
      </Screen>
    );
  }

  const now = initialEstimate(sel.total, cycle.initialPct);
  const toggle = (id: string) =>
    setWindows((w) => (w.includes(id) ? w.filter((x) => x !== id) : w.length < 3 ? [...w, id] : w));
  const body = {
    cycleId: cycle.id,
    selection: {
      planId: p.planId,
      serviceId: p.serviceId === 'PACKAGE' ? null : p.serviceId,
      addonComponentIds: addons,
    },
    preferredWindowIds: windows,
    acceptNonRefundable: true as const,
    disclosureVersion: options.data.disclosure.version,
  };
  const join = (test = false) =>
    pay.start({
      test,
      purpose: 'join',
      path: '/v1/resident/demand-requests',
      body,
      create: async (key) => {
        const r = await postWithKey<{ request: ResidentDemandRequest; checkout: Checkout }>(
          '/v1/resident/demand-requests',
          key,
          body,
        );
        return {
          checkout: r.checkout,
          id: r.request.id,
          kind: 'request',
          reference: r.request.reference,
        };
      },
    });

  return (
    <Screen
      title="Join booking round"
      subtitle={`${sel.plan.name} · ${sel.label}`}
      onBack={() => router.back()}
      footer={
        <>
          {pay.error ? <Banner tone="error">{pay.error}</Banner> : null}
          <Button
            title={`Pay ${rupees(now)} and join`}
            icon="lock-closed"
            loading={pay.busy}
            disabled={!accepted || !windows.length}
            onPress={() => void join()}
            accessibilityHint="Opens secure payment"
          />
          <TestPayButton
            busy={pay.busy}
            disabled={!accepted || !windows.length}
            onPress={() => void join(true)}
          />
        </>
      }
    >
      <Entrance>
        <Card tone="mint" className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="bodyStrong">{cycle.name}</Text>
            <StatusChip label="Open" tone="success" icon="radio-button-on" />
          </View>
          <View className="flex-row items-center gap-2">
            <Icon name="time-outline" size="sm" color={colors.tealDeep} />
            <Text variant="sm" tone="muted">{`Closes ${dateTime(cycle.closesAt)}`}</Text>
          </View>
        </Card>
      </Entrance>

      <View className="gap-3">
        <View className="gap-1">
          <Text variant="h3">Preferred times</Text>
          <Text variant="sm" tone="muted">
            Choose up to three, in order of preference. We confirm one slot after the round closes.
          </Text>
        </View>
        {cycle.timeWindows.map((w, i) => {
          const rank = windows.indexOf(w.id);
          return (
            <Entrance key={w.id} index={i}>
              <ChoiceTile
                kind="checkbox"
                icon={
                  Number(w.startTime.slice(0, 2)) < 12
                    ? 'sunny-outline'
                    : Number(w.startTime.slice(0, 2)) < 17
                      ? 'partly-sunny-outline'
                      : 'moon-outline'
                }
                title={w.name}
                description={`${hhmm(w.startTime)} to ${hhmm(w.endTime)}`}
                selected={rank >= 0}
                rank={rank >= 0 ? rank + 1 : undefined}
                disabled={rank < 0 && windows.length >= 3}
                onPress={() => toggle(w.id)}
              />
            </Entrance>
          );
        })}
      </View>

      <Card className="gap-3">
        <Text variant="h3">Amounts</Text>
        <KeyValue label="Plan total, incl. taxes" value={rupees(sel.total)} />
        <KeyValue label={`Pay now to join (${cycle.initialPct}%)`} value={rupees(now)} strong />
        <KeyValue
          label="Balance, due after your slot is confirmed"
          value={rupees(sel.total - now)}
        />
        <Text variant="sm" tone="muted">
          The exact amounts are confirmed on the payment screen.
        </Text>
      </Card>

      <Banner tone="warning" title="Non-refundable payment">
        {options.data.disclosure.text}
      </Banner>
      <ChoiceTile
        kind="checkbox"
        title="I understand and accept these payment terms"
        selected={accepted}
        onPress={() => setAccepted(!accepted)}
        compact
      />
      <Text variant="sm" tone="muted" className="text-center">
        Joining is not a confirmed service. We confirm your slot and start date when the round
        closes.
      </Text>
    </Screen>
  );
}
