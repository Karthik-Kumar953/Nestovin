import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { VisitCode } from '@nestovin/contracts';
import {
  Banner,
  Button,
  IconButton,
  Illustration,
  Skeleton,
  Text,
  colors,
  haptics,
} from '@nestovin/ui-native';
import { api, errorMessage } from '../../../lib/api';
import { useVisit } from '../../../lib/queries';
import { time } from '../../../lib/format';
import { img } from '../../../assets/images';

/**
 * Check-in code shown at the door (ADR-014): six digits and a QR, single use, short-lived.
 * The code reveals digit by digit (a crossfade under Reduce Motion) with a success haptic; a bar counts down.
 */
export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const visit = useVisit(id);
  const [code, setCode] = useState<VisitCode | null>(null);
  const issue = useMutation({
    mutationFn: () => api<VisitCode>(`/v1/resident/visits/${id}/code`, { method: 'POST' }),
    onSuccess: (c) => {
      setCode(c);
      haptics.success();
    },
    onError: () => haptics.error(),
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    issue.mutate();
  }, [issue]);

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-row items-center justify-between px-4">
        <View className="w-11" />
        <Text variant="bodyStrong" className="text-charcoal">
          Check-in code
        </Text>
        <IconButton icon="close" label="Close" onPress={() => router.back()} tone="plain" />
      </View>

      <View className="flex-1 px-gutter pt-4 gap-6">
        <View className="items-center gap-1">
          <Text variant="h2" className="text-center">
            {visit.data?.workerName
              ? `Show this to ${visit.data.workerName}`
              : 'Show this to your worker'}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {visit.data
              ? `${visit.data.serviceName}${visit.data.startsAt ? ` · ${time(visit.data.startsAt)}` : ''}. `
              : ''}
            They type the code or scan the QR when they arrive.
          </Text>
        </View>

        {issue.isPending && !code ? (
          <View className="items-center gap-5" accessible accessibilityLabel="Getting your code">
            <View className="flex-row gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} width={44} height={60} radius={12} />
              ))}
            </View>
            <Skeleton width={220} height={220} radius={20} />
          </View>
        ) : issue.error && !code ? (
          <View className="items-center gap-4">
            <Illustration
              source={img('ill-checkin-phone.png')}
              icon="qr-code-outline"
              tone="error"
              size={140}
            />
            <Banner tone="error" title="We could not get a code">
              {errorMessage(issue.error)}
            </Banner>
            <Button
              title="Try again"
              variant="secondary"
              icon="refresh"
              onPress={() => issue.mutate()}
            />
          </View>
        ) : code ? (
          <CodeView
            key={code.otp + code.expiresAt}
            code={code}
            onRenew={() => issue.mutate()}
            renewing={issue.isPending}
          />
        ) : null}
      </View>

      <View className="px-gutter gap-2">
        <Text variant="sm" tone="muted" className="text-center">
          Never share this code by phone or message. It works once, only for this visit.
        </Text>
        <Button title="Done" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}

function CodeView({
  code,
  onRenew,
  renewing,
}: {
  code: VisitCode;
  onRenew: () => void;
  renewing: boolean;
}) {
  const reduce = useReducedMotion();
  const total = useRef(Math.max(1, new Date(code.expiresAt).getTime() - Date.now())).current;
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(code.expiresAt).getTime() - Date.now()),
  );
  const bar = useSharedValue(1);
  const initial = useRef(left).current;
  useEffect(() => {
    bar.value = initial / total;
    bar.value = withTiming(0, { duration: initial, easing: Easing.linear });
    const t = setInterval(
      () => setLeft(Math.max(0, new Date(code.expiresAt).getTime() - Date.now())),
      1000,
    );
    return () => clearInterval(t);
  }, [code.expiresAt, bar, initial, total]);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: bar.value }] }));
  const expired = left <= 0;
  const secs = Math.ceil(left / 1000);
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <View className="items-center gap-6">
      <View
        className="flex-row gap-2"
        accessible
        accessibilityLabel={`Code ${code.otp.split('').join(' ')}`}
        accessibilityLiveRegion="polite"
      >
        {code.otp.split('').map((d, i) => (
          <Animated.View
            key={i}
            entering={
              reduce
                ? FadeIn.duration(150)
                : ZoomIn.delay(80 + i * 70)
                    .springify()
                    .damping(12)
            }
          >
            <View
              className={`h-[64px] w-[46px] rounded-md items-center justify-center ${expired ? 'bg-surface-subtle' : 'bg-teal-50 border-[1.5px] border-teal-200'}`}
            >
              <Text
                variant="title"
                className={expired ? 'text-ink-3' : 'text-charcoal'}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {d}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View
        entering={reduce ? FadeIn.duration(150) : ZoomIn.delay(560).duration(320)}
        style={{ opacity: expired ? 0.25 : 1 }}
      >
        <View
          className="rounded-xl border border-line bg-white p-4"
          accessible
          accessibilityLabel="QR code for the worker to scan"
        >
          <QRCode value={code.qr} size={196} color={colors.charcoal} backgroundColor={colors.white} />
        </View>
      </Animated.View>

      <View className="self-stretch gap-2">
        <View className="h-1.5 rounded-full bg-teal-100 overflow-hidden">
          <Animated.View
            style={[
              barStyle,
              {
                width: '100%',
                height: '100%',
                borderRadius: 999,
                transformOrigin: 'left',
                backgroundColor: secs < 60 ? colors.warning : colors.tealAction,
              },
            ]}
          />
        </View>
        <Text
          variant="label"
          tone={expired ? 'error' : secs < 60 ? 'warning' : 'muted'}
          className="text-center"
          accessibilityLiveRegion="polite"
        >
          {expired ? 'This code has expired' : `Valid for ${mmss}`}
        </Text>
      </View>
      {expired || secs < 60 ? (
        <Button
          title="Get a new code"
          icon="refresh"
          variant={expired ? 'primary' : 'secondary'}
          loading={renewing}
          onPress={onRenew}
        />
      ) : null}
    </View>
  );
}
