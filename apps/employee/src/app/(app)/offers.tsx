import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { Building2, CalendarDays, Check, CheckCircle2, Clock3, Hourglass, X } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../lib/api';
import { flatLabel, longDay, relativeDay, timeWindow } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { qk, useMe, useOffers, useRespondOffer } from '../../lib/queries';
import type { OvertimeOffer } from '../../lib/types';
import { BrandImage, Button, EmptyState, ErrorState, LoadingList, Muted, Pill, Screen, Section, ServiceIcon, Stagger, Text, c, confirmAction, notify, shadow, useLargeText } from '../../ui';

type View_ = { label: string; tone: 'warning' | 'teal' | 'success' | 'neutral' | 'error'; detail: string };

/** What this offer means for me (acceptance alone is not an assignment: EMP-08). */
function stateOf(o: OvertimeOffer, meId: string): { mine: 'PENDING' | 'ACCEPTED' | 'REJECTED'; view: View_ } {
  const mine = o.responses.find((r) => r.employeeId === meId)?.response ?? 'PENDING';
  if (o.confirmedEmployeeId === meId) return { mine, view: { label: 'Confirmed', tone: 'success', detail: 'It is in your schedule.' } };
  if (o.status === 'FILLED') return { mine, view: { label: 'Given to someone else', tone: 'neutral', detail: 'Operations confirmed another worker.' } };
  if (o.status === 'CANCELLED') return { mine, view: { label: 'Withdrawn', tone: 'neutral', detail: 'Operations cancelled this offer.' } };
  if (mine === 'ACCEPTED') return { mine, view: { label: 'Accepted', tone: 'teal', detail: 'Waiting for Operations to confirm. It is not in your schedule yet.' } };
  if (mine === 'REJECTED') return { mine, view: { label: 'Declined', tone: 'neutral', detail: 'You declined this offer.' } };
  return { mine, view: { label: 'Waiting for you', tone: 'warning', detail: 'This is optional extra work.' } };
}

/** EMP-08 extra work: accept or decline optional offers. */
export default function Offers() {
  const qc = useQueryClient();
  const me = useMe();
  const q = useOffers();
  const meId = me.data?.id ?? '';
  const items = q.data ?? [];
  // Offers answered on this visit stay in place so the confirmation is seen.
  const [fresh, setFresh] = useState<string[]>([]);
  const open = items.filter((o) => fresh.includes(o.id) || (o.status === 'OPEN' && stateOf(o, meId).mine === 'PENDING'));
  const rest = items.filter((o) => !open.includes(o));

  return (
    <Screen edges={['bottom', 'left', 'right']} onRefresh={() => qc.invalidateQueries({ queryKey: qk.offers })}>
      <Stagger index={0}>
        <View className="flex-row items-center gap-4 rounded-xl bg-warning-surface/70 p-4">
          <BrandImage name="ill-overtime" variant="illustration" className="h-16 w-16" iconSize={22} />
          <View className="flex-1 gap-0.5">
            <Text className="font-heading text-lg text-charcoal">Extra work is optional</Text>
            <Muted className="text-sm">Accept only what you can do. Operations confirms one worker, then it appears in your schedule.</Muted>
          </View>
        </View>
      </Stagger>
      {q.isPending ? (
        <LoadingList rows={2} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !items.length ? (
        <EmptyState image="ill-overtime" title="No offers right now" body="When Operations offers you extra work, you get an update and it shows here." />
      ) : (
        <>
          {open.length ? (
            <Section title="Waiting for your answer">
              {open.map((o, i) => (
                <Stagger key={o.id} index={i + 1}>
                  <OfferCard offer={o} meId={meId} justAccepted={fresh.includes(o.id)} onAnswered={(id) => setFresh((f) => [...f, id])} />
                </Stagger>
              ))}
            </Section>
          ) : null}
          {rest.length ? (
            <Section title="Earlier">
              {rest.map((o, i) => (
                <Stagger key={o.id} index={i + open.length + 1}>
                  <OfferCard offer={o} meId={meId} justAccepted={fresh.includes(o.id)} onAnswered={(id) => setFresh((f) => [...f, id])} />
                </Stagger>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function OfferCard({ offer, meId, justAccepted, onAnswered }: { offer: OvertimeOffer; meId: string; justAccepted: boolean; onAnswered: (id: string) => void }) {
  const respond = useRespondOffer();
  const { mine, view } = stateOf(offer, meId);
  const canAnswer = offer.status === 'OPEN' && mine === 'PENDING';
  const v = offer.visit;
  const large = useLargeText();

  const answer = (response: 'ACCEPTED' | 'REJECTED') =>
    respond.mutate(
      { id: offer.id, response },
      {
        onSuccess: () => {
          haptic.success();
          if (response === 'ACCEPTED') onAnswered(offer.id);
        },
        onError: (e) => {
          haptic.error();
          notify('Could not send your answer', errorMessage(e));
        },
      },
    );
  const decline = () =>
    confirmAction({ title: 'Decline this offer?', message: 'Operations will offer this visit to someone else.', cancelLabel: 'Keep it', confirmLabel: 'Decline', onConfirm: () => answer('REJECTED') });

  return (
    <Animated.View layout={LinearTransition.duration(260).reduceMotion(ReduceMotion.System)} style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: c.surface }, canAnswer ? shadow.float : shadow.card]}>
      <View className="overflow-hidden rounded-2xl border border-line/70 bg-surface">
      <View className="gap-3 p-5">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Pill label={view.label} tone={view.tone} icon={view.tone === 'teal' ? Hourglass : view.tone === 'success' ? CheckCircle2 : undefined} />
          <Text className="font-semibold text-body-sm text-ink-secondary">{relativeDay(v.scheduledDate)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <ServiceIcon serviceName={v.serviceName} size="lg" />
          <View className="flex-1">
            <Text className="font-heading text-xl text-charcoal">{v.serviceName}</Text>
            <Text className="font-semibold">{flatLabel(v.flat)}</Text>
          </View>
        </View>
        <View className="gap-2 rounded-lg bg-subtle p-3.5">
          <Row icon={CalendarDays} text={longDay(v.scheduledDate)} />
          <Row icon={Clock3} text={timeWindow(v.startsAt, v.endsAt)} />
          <Row icon={Building2} text={v.flat.communityName} />
        </View>
        {offer.note ? <Muted>“{offer.note}”</Muted> : null}
        {!canAnswer ? <Muted className="text-sm">{view.detail}</Muted> : null}
        {justAccepted && mine === 'ACCEPTED' ? (
          <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)} accessibilityLiveRegion="polite">
            <View className="flex-row items-center gap-3 rounded-lg bg-mint p-3.5">
              <Animated.View
                entering={ZoomIn.springify().damping(12).reduceMotion(ReduceMotion.System)}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tealAction }}
              >
                <Check size={20} color={c.white} strokeWidth={3} />
              </Animated.View>
              <Text className="flex-1 text-body-sm text-teal-deep">Thanks. We told Operations you can do it. You will get an update when it is confirmed.</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>
      {canAnswer ? (
        <View className={`gap-3 border-t border-line/60 p-4 ${large ? 'flex-col-reverse' : 'flex-row'}`}>
          <Button title="Decline" variant="secondary" icon={X} onPress={decline} disabled={respond.isPending} className={large ? undefined : 'flex-1'} />
          <Button title="Accept" icon={Check} busy={respond.isPending && respond.variables?.response === 'ACCEPTED'} disabled={respond.isPending} onPress={() => answer('ACCEPTED')} className={large ? undefined : 'flex-1'} />
        </View>
      ) : null}
      </View>
    </Animated.View>
  );
}

function Row({ icon: Icon, text }: { icon: typeof Clock3; text: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={18} color={c.tealDeep} />
      <Text className="flex-1 text-body-sm">{text}</Text>
    </View>
  );
}
