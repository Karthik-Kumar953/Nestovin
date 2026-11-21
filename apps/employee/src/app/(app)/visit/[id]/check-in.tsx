import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { AlertTriangle, Camera, Check, CloudUpload, Hash, LocateFixed, LocateOff, Loader, MapPin, QrCode, RotateCcw, ScanLine, Settings, X } from 'lucide-react-native';
import type { CheckInInput, CheckInResult } from '@nestovin/contracts';
import { ApiError, errorMessage } from '../../../../lib/api';
import { addressLabel, timeWindow } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { newClientEventId } from '../../../../lib/ids';
import { oneShotLocation, type Fix } from '../../../../lib/location';
import { useOnline } from '../../../../lib/net';
import { useCheckIn, useVisit } from '../../../../lib/queries';
import { BrandImage, Button, CodeInput, IconButton, Muted, ResultMark, Screen, Segmented, ServiceIcon, Stagger, Text, c } from '../../../../ui';

type Method = 'OTP' | 'QR';
type Outcome =
  | { kind: 'verified'; result: CheckInResult }
  | { kind: 'rejected'; message: string }
  | { kind: 'offline'; payload: CheckInInput }
  | { kind: 'error'; message: string; payload: CheckInInput };

/** Plain-language reasons for review flags (ADR-014: flagged, never blocked). */
const FLAG_TEXT: Record<string, string> = {
  OUTSIDE_RADIUS: 'You seemed to be outside the community’s check-in area.',
  LOW_ACCURACY: 'Your phone’s location was not precise enough.',
  NO_LOCATION: 'Your location was not available.',
};

/**
 * EMP-06 check-in. The resident shows a 6-digit code and a QR (10 minutes,
 * single use). One location reading goes with it as evidence. Each attempt has
 * a clientEventId: re-sending after a network failure reuses it so the server
 * returns the first outcome; a new code starts a new attempt.
 */
export default function CheckIn() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visit = useVisit(id).data;
  const mutation = useCheckIn(id);
  const online = useOnline();
  const [method, setMethod] = useState<Method>('OTP');
  const [code, setCode] = useState('');
  const [fix, setFix] = useState<Fix | 'pending'>('pending');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const fixPromise = useRef<Promise<Fix> | null>(null);

  const locate = useCallback(() => {
    setFix('pending');
    const p = oneShotLocation();
    fixPromise.current = p;
    void p.then(setFix);
    return p;
  }, []);
  useEffect(() => {
    locate();
  }, [locate]);

  const send = useCallback(
    async (payload: CheckInInput) => {
      setOutcome(null);
      try {
        const result = await mutation.mutateAsync(payload);
        if (result.flags.length) haptic.warning();
        else haptic.success();
        setOutcome({ kind: 'verified', result });
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          haptic.error();
          setOutcome({ kind: 'offline', payload });
        } else if (e instanceof ApiError && (e.code === 'BUSINESS_RULE_VIOLATION' || e.code === 'VALIDATION_FAILED')) {
          haptic.error();
          setOutcome({ kind: 'rejected', message: e.message });
        } else {
          haptic.error();
          setOutcome({ kind: 'error', message: errorMessage(e), payload });
        }
      }
    },
    [mutation],
  );

  /** Builds a NEW attempt (new clientEventId) from a code, waiting briefly for the location. */
  const submit = useCallback(
    async (m: Method, value: string) => {
      const f = fix === 'pending' ? await (fixPromise.current ?? Promise.resolve<Fix>({ status: 'unavailable' })) : fix;
      const payload: CheckInInput = {
        method: m,
        code: value,
        ...(f.status === 'ok' ? { lat: f.lat, lng: f.lng, accuracyM: f.accuracyM } : {}),
        deviceTime: new Date().toISOString(),
        clientEventId: newClientEventId(),
      };
      await send(payload);
    },
    [fix, send],
  );

  // Queued retry: when the signal comes back (offline -> online), re-send the SAME attempt once.
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && outcome?.kind === 'offline' && !mutation.isPending) void send(outcome.payload);
  }, [online, outcome, mutation.isPending, send]);

  const onCode = (v: string) => {
    setCode(v);
    if (v.length === 6 && !mutation.isPending) void submit('OTP', v);
  };
  const reset = () => {
    setOutcome(null);
    setCode('');
  };

  if (outcome?.kind === 'verified') return <Verified result={outcome.result} visitId={id} />;

  return (
    <>
      <Stack.Screen options={{ headerLeft: () => <IconButton icon={X} label="Close" onPress={() => router.back()} /> }} />
      <Screen
        edges={['bottom', 'left', 'right']}
        offlineMessage="You are offline. You can still enter the code; it is sent when the signal returns."
        footer={
          outcome?.kind === 'rejected' ? (
            <Button title="Try again" icon={RotateCcw} onPress={reset} />
          ) : outcome?.kind === 'offline' || outcome?.kind === 'error' ? (
            <Button title="Send again" icon={CloudUpload} busy={mutation.isPending} onPress={() => void send(outcome.payload)} />
          ) : method === 'OTP' ? (
            <Button title="Check in" icon={ScanLine} busy={mutation.isPending} disabled={code.length !== 6} onPress={() => void submit('OTP', code)} />
          ) : undefined
        }
      >
        {visit ? (
          <Stagger index={0}>
            <View className="flex-row items-center gap-3 rounded-lg border border-line bg-surface p-3">
              <ServiceIcon serviceName={visit.serviceName} />
              <View className="flex-1">
                <Text className="font-semibold text-charcoal">{addressLabel(visit.flat)}</Text>
                <Muted className="text-sm">
                  {visit.serviceName} · {timeWindow(visit.startsAt, visit.endsAt)}
                </Muted>
              </View>
            </View>
          </Stagger>
        ) : null}

        {outcome?.kind === 'rejected' ? (
          <ResultPanel tone="error" title="Check-in not accepted" body={outcome.message} hint="Check the 6 digits with the resident and try again. If the code has expired, ask them to open a new one." />
        ) : outcome?.kind === 'offline' ? (
          <ResultPanel tone="warning" title="Not sent yet" body="There is no internet connection. Your code is kept on this screen and will be sent automatically when the signal returns." hint="Codes expire after a few minutes. If it fails later, ask the resident for a new one." />
        ) : outcome?.kind === 'error' ? (
          <ResultPanel tone="error" title="Something went wrong" body={outcome.message} hint="Your code is kept. Tap Send again." />
        ) : (
          <>
            <Segmented<Method>
              label="Check-in method"
              value={method}
              onChange={(m) => {
                haptic.select();
                setMethod(m);
              }}
              options={[
                { value: 'OTP', label: 'Enter code', icon: Hash },
                { value: 'QR', label: 'Scan QR', icon: QrCode },
              ]}
            />
            {method === 'OTP' ? (
              <Stagger index={1}>
                <View className="gap-5 rounded-lg border border-line bg-surface px-4 py-6">
                  <View className="items-center gap-1">
                    <Text accessibilityRole="header" className="font-display text-headline text-charcoal">Enter the resident’s code</Text>
                    <Muted className="text-center">Ask the resident to open this visit in their Nestovin app and read out the 6 digits.</Muted>
                  </View>
                  <CodeInput value={code} onChange={onCode} autoFocus />
                </View>
              </Stagger>
            ) : (
              <Scanner busy={mutation.isPending} onScan={(data) => void submit('QR', data)} />
            )}
          </>
        )}

        <LocationChip fix={fix} onRetry={() => void locate()} />
      </Screen>
    </>
  );
}

function Scanner({ onScan, busy }: { onScan: (data: string) => void; busy: boolean }) {
  const [perm, request] = useCameraPermissions();
  const [wrong, setWrong] = useState(false);
  const handled = useRef(false);
  const reduce = useReducedMotion();
  const line = useSharedValue(0);
  useEffect(() => {
    if (!reduce) line.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [line, reduce]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.value * 200 }] }));

  if (!perm) return <View className="aspect-square rounded-lg bg-charcoal" />;
  if (!perm.granted) {
    return (
      <View className="items-center gap-4 rounded-lg border border-line bg-surface p-6">
        <BrandImage name="ill-checkin-phone" variant="illustration" className="h-36 w-36" iconSize={40} />
        <Text accessibilityRole="header" className="text-center font-display text-headline text-charcoal">Allow the camera to scan</Text>
        <Muted className="text-center">The camera is used only to read the resident’s QR code. Nothing is recorded.</Muted>
        {perm.canAskAgain ? (
          <Button title="Allow camera" icon={Camera} onPress={() => void request()} className="self-stretch" />
        ) : (
          <Button title="Open settings" icon={Settings} variant="secondary" onPress={() => void Linking.openSettings()} className="self-stretch" />
        )}
        <Muted className="text-center text-sm">Or use “Enter code” instead.</Muted>
      </View>
    );
  }
  return (
    <View className="gap-3">
      <View className="aspect-square overflow-hidden rounded-lg bg-charcoal">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            busy || handled.current
              ? undefined
              : ({ data }) => {
                  if (!data.startsWith('NVQR1.')) {
                    if (!wrong) haptic.error();
                    setWrong(true);
                    return;
                  }
                  handled.current = true;
                  setWrong(false);
                  onScan(data);
                }
          }
        />
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          {/* Viewfinder: one even frame (no thick corner brackets) on a light tint. */}
          <View className="h-[240px] w-[240px] rounded-lg border-2 border-white/90 bg-white/10">
            <Animated.View style={[{ position: 'absolute', left: 16, right: 16, top: 20, height: 2, backgroundColor: c.mintStrong, opacity: 0.9 }, lineStyle]} />
          </View>
        </View>
        {busy ? (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <Text className="font-semibold text-lg text-white">Checking…</Text>
          </View>
        ) : null}
      </View>
      <Text accessibilityLiveRegion="polite" className={`text-center ${wrong ? 'font-semibold text-error-text' : 'text-ink-secondary'}`}>
        {wrong ? 'This is not a Nestovin check-in code. Scan the QR in the resident’s app.' : 'Point the camera at the QR in the resident’s app.'}
      </Text>
    </View>
  );
}

function LocationChip({ fix, onRetry }: { fix: Fix | 'pending'; onRetry: () => void }) {
  if (fix === 'pending') {
    return (
      <View className="flex-row items-center gap-3 rounded-md bg-subtle p-3.5" accessibilityLiveRegion="polite">
        <Loader size={20} color={c.textSecondary} />
        <Text className="flex-1 text-body-sm text-ink-secondary">Getting your location once for this check-in…</Text>
      </View>
    );
  }
  if (fix.status === 'ok') {
    const acc = fix.accuracyM !== undefined ? Math.round(fix.accuracyM) : null;
    return (
      <View className="flex-row items-center gap-3 rounded-md bg-mint p-3.5" accessibilityLiveRegion="polite">
        <LocateFixed size={20} color={c.tealDeep} />
        <Text className="flex-1 text-body-sm text-teal-deep">
          Location ready{acc !== null ? ` · accurate to ${acc} m` : ''}. It is saved only with this check-in.
        </Text>
      </View>
    );
  }
  const text = fix.status === 'denied' ? 'Location is not allowed. You can still check in; it will be reviewed.' : fix.status === 'off' ? 'Location is turned off. You can still check in; it will be reviewed.' : 'Could not get your location. You can still check in; it will be reviewed.';
  return (
    <View className="gap-3 rounded-md bg-warning-surface p-3.5" accessibilityLiveRegion="polite">
      <View className="flex-row items-center gap-3">
        <LocateOff size={20} color={c.warningText} />
        <Text className="flex-1 text-body-sm text-warning-text">{text}</Text>
      </View>
      <View className="gap-2">
        <Button title="Retry location" size="md" variant="secondary" icon={MapPin} onPress={onRetry} />
        {fix.status === 'denied' ? <Button title="Open settings" size="md" variant="ghost" icon={Settings} onPress={() => void Linking.openSettings()} /> : null}
      </View>
    </View>
  );
}

function ResultPanel({ tone, title, body, hint }: { tone: 'warning' | 'error'; title: string; body: string; hint?: string }) {
  return (
    <View className="items-center gap-2 rounded-lg border border-line bg-surface px-5 pb-6" accessibilityLiveRegion="assertive">
      <ResultMark tone={tone} size={84} />
      <Text accessibilityRole="header" className="text-center font-display text-headline text-charcoal">
        {title}
      </Text>
      <Text className="text-center text-lead text-ink">{body}</Text>
      {hint ? <Muted className="text-center">{hint}</Muted> : null}
    </View>
  );
}

function Verified({ result, visitId }: { result: CheckInResult; visitId: string }) {
  const flagged = result.flags.length > 0;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen
        footer={
          <>
            <Button title="Done" icon={Check} onPress={() => router.dismissTo({ pathname: '/visit/[id]', params: { id: visitId } })} />
          </>
        }
      >
        <View className="items-center pt-10">
          <ResultMark tone={flagged ? 'warning' : 'success'} />
        </View>
        <Stagger index={2}>
          <View className="items-center gap-2" accessibilityLiveRegion="assertive">
            <Text accessibilityRole="header" className="text-center font-display text-title text-charcoal">
              {flagged ? 'Checked in' : 'You are checked in'}
            </Text>
            <Muted className="text-center">{flagged ? 'Your check-in is saved. Operations will review the location; you can start work now.' : 'Have a good visit. Tap Complete visit when you finish.'}</Muted>
          </View>
        </Stagger>
        {flagged ? (
          <Stagger index={3}>
            <View className="gap-2 rounded-md bg-warning-surface p-3.5">
              <Text className="font-semibold text-warning-text">Flagged for review</Text>
              {result.flags.map((f) => (
                <View key={f} className="flex-row gap-2.5">
                  <AlertTriangle size={18} color={c.warningText} style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-body-sm text-warning-text">{FLAG_TEXT[f] ?? f.replace(/_/g, ' ').toLowerCase()}</Text>
                </View>
              ))}
              <Text className="text-body-sm text-warning-text">If this is wrong, you can request a correction from the visit.</Text>
            </View>
          </Stagger>
        ) : null}
      </Screen>
    </>
  );
}
