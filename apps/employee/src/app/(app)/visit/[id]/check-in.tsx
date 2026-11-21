import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Camera, CloudUpload, Hash, LocateFixed, LocateOff, Loader, MapPin, QrCode, RotateCcw, Settings, X } from 'lucide-react-native';
import type { CheckInInput, CheckInResult } from '@nestovin/contracts';
import { ApiError, errorMessage } from '../../../../lib/api';
import { flatLabel, timeWindow } from '../../../../lib/format';
import { haptic } from '../../../../lib/haptics';
import { newClientEventId } from '../../../../lib/ids';
import { oneShotLocation, type Fix } from '../../../../lib/location';
import { useOnline } from '../../../../lib/net';
import { useCheckIn, useVisit } from '../../../../lib/queries';
import { BrandImage, Button, CodeInput, IconButton, Muted, ResultMark, Screen, ServiceIcon, Stagger, Text, c } from '../../../../ui';

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
            <Button title="Check in" busy={mutation.isPending} disabled={code.length !== 6} onPress={() => void submit('OTP', code)} />
          ) : undefined
        }
      >
        {visit ? (
          <Stagger index={0}>
            <View className="flex-row items-center gap-3 rounded-xl border border-line/70 bg-surface p-3.5">
              <ServiceIcon serviceName={visit.serviceName} />
              <View className="flex-1">
                <Text className="font-semibold">{flatLabel(visit.flat)}</Text>
                <Muted className="text-sm">
                  {visit.serviceName} · {timeWindow(visit.startsAt, visit.endsAt)}
                </Muted>
              </View>
            </View>
          </Stagger>
        ) : null}

        {outcome?.kind === 'rejected' ? (
          <ResultPanel tone="error" title="Check-in not accepted" body={outcome.message} hint="Ask the resident to open a new code in their app, then try again." />
        ) : outcome?.kind === 'offline' ? (
          <ResultPanel tone="warning" title="Not sent yet" body="There is no internet connection. Your code is kept on this screen and will be sent automatically when the signal returns." hint="Codes expire after a few minutes. If it fails later, ask the resident for a new one." />
        ) : outcome?.kind === 'error' ? (
          <ResultPanel tone="error" title="Something went wrong" body={outcome.message} hint="Your code is kept. Tap Send again." />
        ) : (
          <>
            <Segmented value={method} onChange={(m) => { haptic.select(); setMethod(m); }} />
            {method === 'OTP' ? (
              <Stagger index={1}>
                <View className="gap-5 rounded-2xl border border-line/70 bg-surface px-4 py-6">
                  <View className="items-center gap-1">
                    <Text className="font-heading text-xl text-charcoal">Enter the resident’s code</Text>
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

function Segmented({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  const opts: { m: Method; label: string; icon: typeof Hash }[] = [
    { m: 'OTP', label: 'Enter code', icon: Hash },
    { m: 'QR', label: 'Scan QR', icon: QrCode },
  ];
  return (
    <View className="flex-row rounded-lg bg-mint-strong/60 p-1" accessibilityRole="tablist">
      {opts.map((o) => {
        const on = value === o.m;
        return (
          <Pressable
            key={o.m}
            onPress={() => onChange(o.m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            className={`min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-md ${on ? 'bg-surface' : ''}`}
            style={on ? { shadowColor: '#0F3D37', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : undefined}
          >
            <o.icon size={20} color={on ? c.tealDeep : c.textSecondary} strokeWidth={2} />
            <Text className={on ? 'font-semibold text-teal-deep' : 'font-medium text-ink-secondary'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
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

  if (!perm) return <View className="aspect-square rounded-2xl bg-charcoal" />;
  if (!perm.granted) {
    return (
      <View className="items-center gap-4 rounded-2xl border border-line/70 bg-surface p-6">
        <BrandImage name="ill-checkin-phone" variant="illustration" className="h-36 w-36" iconSize={40} />
        <Text className="text-center font-heading text-xl text-charcoal">Allow the camera to scan</Text>
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
      <View className="aspect-square overflow-hidden rounded-2xl bg-charcoal">
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
          <View className="h-[240px] w-[240px]">
            {(['top-0 left-0 border-l-4 border-t-4 rounded-tl-2xl', 'top-0 right-0 border-r-4 border-t-4 rounded-tr-2xl', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'] as const).map((k) => (
              <View key={k} className={`absolute h-10 w-10 border-white ${k}`} />
            ))}
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
      <View className="flex-row items-center gap-3 rounded-lg bg-subtle p-4" accessibilityLiveRegion="polite">
        <Loader size={20} color={c.textSecondary} />
        <Text className="flex-1 text-[15px] text-ink-secondary">Getting your location once for this check-in…</Text>
      </View>
    );
  }
  if (fix.status === 'ok') {
    const acc = fix.accuracyM !== undefined ? Math.round(fix.accuracyM) : null;
    return (
      <View className="flex-row items-center gap-3 rounded-lg bg-mint p-4" accessibilityLiveRegion="polite">
        <LocateFixed size={20} color={c.tealDeep} />
        <Text className="flex-1 text-[15px] text-teal-deep">
          Location ready{acc !== null ? ` · accurate to ${acc} m` : ''}. It is saved only with this check-in.
        </Text>
      </View>
    );
  }
  const text = fix.status === 'denied' ? 'Location is not allowed. You can still check in; it will be reviewed.' : fix.status === 'off' ? 'Location is turned off. You can still check in; it will be reviewed.' : 'Could not get your location. You can still check in; it will be reviewed.';
  return (
    <View className="gap-3 rounded-lg bg-warning-surface p-4" accessibilityLiveRegion="polite">
      <View className="flex-row items-center gap-3">
        <LocateOff size={20} color={c.warningText} />
        <Text className="flex-1 text-[15px] text-warning-text">{text}</Text>
      </View>
      <View className="flex-row gap-2">
        <Button title="Try again" size="md" variant="secondary" icon={MapPin} onPress={onRetry} className="flex-1" />
        {fix.status === 'denied' ? <Button title="Settings" size="md" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
      </View>
    </View>
  );
}

function ResultPanel({ tone, title, body, hint }: { tone: 'warning' | 'error'; title: string; body: string; hint?: string }) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-line/70 bg-surface px-5 pb-6" accessibilityLiveRegion="assertive">
      <ResultMark tone={tone} size={84} />
      <Text accessibilityRole="header" className="text-center font-heading text-2xl text-charcoal">
        {title}
      </Text>
      <Text className="text-center text-[17px] leading-6 text-ink">{body}</Text>
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
            <Button title="Done" onPress={() => router.dismissTo({ pathname: '/visit/[id]', params: { id: visitId } })} />
          </>
        }
      >
        <View className="items-center pt-10">
          <ResultMark tone={flagged ? 'warning' : 'success'} />
        </View>
        <Stagger index={2}>
          <View className="items-center gap-2" accessibilityLiveRegion="assertive">
            <Text accessibilityRole="header" className="text-center font-display text-[32px] leading-10 text-charcoal">
              {flagged ? 'Checked in' : 'You are checked in'}
            </Text>
            <Muted className="text-center">{flagged ? 'Your check-in is saved. Operations will review the location; you can start work now.' : 'Have a good visit. Tap Complete visit when you finish.'}</Muted>
          </View>
        </Stagger>
        {flagged ? (
          <Stagger index={3}>
            <View className="gap-2 rounded-xl bg-warning-surface p-4">
              <Text className="font-semibold text-warning-text">Flagged for review</Text>
              {result.flags.map((f) => (
                <Text key={f} className="text-[15px] text-warning-text">
                  • {FLAG_TEXT[f] ?? f.replace(/_/g, ' ').toLowerCase()}
                </Text>
              ))}
              <Text className="text-[15px] text-warning-text">If this is wrong, you can request a correction from the visit.</Text>
            </View>
          </Stagger>
        ) : null}
      </Screen>
    </>
  );
}
