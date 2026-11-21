import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  Button,
  Card,
  ChoiceTile,
  EmptyState,
  Icon,
  PressScale,
  Screen,
  SkeletonList,
  SuccessCheck,
  Text,
  colors,
  haptics,
} from '@nestovin/ui-native';
import { api, errorMessage } from '../../lib/api';
import { addDays, longDate, ymd } from '../../lib/format';
import { keys, useMe } from '../../lib/queries';
import { ErrorState } from '../../components/common';

/** RES-05/14: occupancy change (Primary only) or moving out, chosen with the native date picker. Reviewed by our team. */
export default function ChangeRequest() {
  const qc = useQueryClient();
  const me = useMe();
  const m = me.data?.membership;
  const primary = m?.kind === 'PRIMARY';
  const [chosen, setKind] = useState<'OCCUPANCY_CHANGE' | 'MOVE_OUT' | null>(null);
  // Family members can only move out, so that choice is made for them once their details load.
  const kind = chosen ?? (m && !primary ? 'MOVE_OUT' : null);
  const [occupancy, setOccupancy] = useState<'OWNER' | 'TENANT' | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [iosPicker, setIosPicker] = useState(false);
  const min = addDays(new Date(), 1);
  const max = addDays(new Date(), 365);
  const send = useMutation({
    mutationFn: () =>
      api('/v1/resident/change-requests', {
        method: 'POST',
        body: kind === 'OCCUPANCY_CHANGE' ? { kind, occupancy } : { kind, moveOutDate: ymd(date!) },
      }),
    onSuccess: async () => {
      haptics.success();
      await qc.invalidateQueries({ queryKey: keys.changes });
    },
    onError: () => haptics.error(),
  });

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date ?? min,
        mode: 'date',
        minimumDate: min,
        maximumDate: max,
        onChange: (e, d) => e.type === 'set' && d && setDate(d),
      });
    } else setIosPicker(!iosPicker);
  };

  if (send.isSuccess) {
    return (
      <Screen title="Change residence" onBack={() => router.back()}>
        <View className="items-center gap-4 pt-10">
          <SuccessCheck />
          <Text variant="h2" className="text-center">
            Request sent
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            Our team reviews it and you will get an update in Updates. Your current details stay
            until then.
          </Text>
        </View>
        <Button
          title="Back to household"
          icon="people-outline"
          onPress={() => router.replace('/household')}
        />
      </Screen>
    );
  }
  if (me.isLoading) {
    return (
      <Screen title="Change residence" onBack={() => router.back()}>
        <SkeletonList count={2} />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen title="Change residence" onBack={() => router.back()}>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Screen>
    );
  }
  if (!m || m.status !== 'VERIFIED') {
    return (
      <Screen title="Change residence" onBack={() => router.back()}>
        <EmptyState
          icon="home-outline"
          title="Available after verification"
          body="You can request changes once your residence is verified."
        />
      </Screen>
    );
  }
  const ready =
    kind === 'OCCUPANCY_CHANGE' ? Boolean(occupancy && occupancy !== m.occupancy) : Boolean(date);

  return (
    <Screen
      title="Change residence"
      subtitle={`${m.towerName} · Flat ${m.flatNumber} · ${m.occupancy === 'OWNER' ? 'Owner' : m.occupancy === 'TENANT' ? 'Tenant' : 'Family'}`}
      onBack={() => router.back()}
      footer={
        kind ? (
          <>
            {send.error ? <Banner tone="error">{errorMessage(send.error)}</Banner> : null}
            <Button
              title="Send for review"
              icon="send-outline"
              loading={send.isPending}
              disabled={!ready}
              onPress={() => send.mutate()}
            />
          </>
        ) : undefined
      }
    >
      <View className="gap-3">
        <Text variant="h3">What changed?</Text>
        {primary ? (
          <ChoiceTile
            icon="key-outline"
            title="Owner or tenant changed"
            description="For example, you bought the flat you rent"
            selected={kind === 'OCCUPANCY_CHANGE'}
            onPress={() => setKind('OCCUPANCY_CHANGE')}
          />
        ) : null}
        <ChoiceTile
          icon="exit-outline"
          title="I am moving out"
          description="Services and access end on your move-out date"
          selected={kind === 'MOVE_OUT'}
          onPress={() => setKind('MOVE_OUT')}
        />
      </View>

      {kind === 'OCCUPANCY_CHANGE' ? (
        <View className="gap-3">
          <Text variant="h3">You are now the</Text>
          <ChoiceTile
            compact
            title="Owner"
            selected={occupancy === 'OWNER'}
            disabled={m.occupancy === 'OWNER'}
            description={m.occupancy === 'OWNER' ? 'Current' : null}
            onPress={() => setOccupancy('OWNER')}
          />
          <ChoiceTile
            compact
            title="Tenant"
            selected={occupancy === 'TENANT'}
            disabled={m.occupancy === 'TENANT'}
            description={m.occupancy === 'TENANT' ? 'Current' : null}
            onPress={() => setOccupancy('TENANT')}
          />
          <Text variant="sm" tone="muted">
            Our team may ask for a new proof document.
          </Text>
        </View>
      ) : null}

      {kind === 'MOVE_OUT' ? (
        <View className="gap-3">
          <Text variant="h3">Move-out date</Text>
          <PressScale
            onPress={openPicker}
            haptic="tap"
            accessibilityRole="button"
            accessibilityLabel={
              date ? `Move-out date ${longDate(ymd(date))}. Change` : 'Choose your move-out date'
            }
          >
            <Card className="flex-row items-center gap-3">
              <View className="h-11 w-11 rounded-md bg-teal-100 items-center justify-center">
                <Icon name="calendar-outline" color={colors.tealDeep} />
              </View>
              <View className="flex-1">
                <Text variant="caption" tone="muted">
                  Last day at this flat
                </Text>
                <Text variant="bodyStrong">{date ? longDate(ymd(date)) : 'Choose a date'}</Text>
              </View>
              <Icon
                name={iosPicker ? 'chevron-up' : 'chevron-forward'}
                size="sm"
                color={colors.textSecondary}
              />
            </Card>
          </PressScale>
          {Platform.OS === 'ios' && iosPicker ? (
            <Card padded={false} className="items-center">
              <DateTimePicker
                value={date ?? min}
                mode="date"
                display="inline"
                minimumDate={min}
                maximumDate={max}
                accentColor={colors.tealAction}
                themeVariant="light"
                onChange={(_, d) => d && setDate(d)}
              />
            </Card>
          ) : null}
          <Banner tone="info">
            Visits after this date are stopped. Talk to us about any balance or refunds through
            Support.
          </Banner>
        </View>
      ) : null}
    </Screen>
  );
}
