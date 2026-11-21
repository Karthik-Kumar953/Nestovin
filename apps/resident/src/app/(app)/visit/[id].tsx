import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, Banner, Button, Card, Entrance, Field, Icon, IconTile, Illustration, PressScale, Screen, SkeletonList, StatusChip, SuccessCheck, Text, colors, haptics } from '@nestovin/ui-native';
import { api, errorMessage } from '../../../lib/api';
import { keys, useVisit } from '../../../lib/queries';
import { longDate, time } from '../../../lib/format';
import { visitStatus } from '../../../lib/status';
import { img, serviceIcon } from '../../../assets/images';
import { ErrorState, Timeline } from '../../../components/common';

const LABELS = ['Poor', 'Below expectations', 'Okay', 'Good', 'Excellent'];

/** Visit detail: who, when, what happened (check-in, completion), the code when due, and rating (RES-11). */
export default function VisitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const visit = useVisit(id);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const feedback = useMutation({
    mutationFn: () => api(`/v1/resident/visits/${id}/feedback`, { method: 'POST', body: { rating: stars, comment: comment.trim() || undefined } }),
    onSuccess: async () => {
      haptics.success();
      await qc.invalidateQueries({ queryKey: keys.visits });
    },
    onError: () => haptics.error(),
  });

  if (visit.isLoading) return <Screen title="Visit" onBack={() => router.back()}><SkeletonList count={3} /></Screen>;
  const v = visit.data;
  if (!v) return <Screen title="Visit" onBack={() => router.back()}><ErrorState error={visit.error} onRetry={() => void visit.refetch()} /></Screen>;

  const st = visitStatus(v.status, v.noShow);
  const done = v.status === 'COMPLETED';
  const rated = v.feedback ?? (feedback.isSuccess ? { rating: stars, comment } : null);

  return (
    <Screen
      title={v.serviceName}
      eyebrow={longDate(v.scheduledDate)}
      onBack={() => router.back()}
      footer={v.canShowCode ? <Button title="Show check-in code" icon="qr-code-outline" onPress={() => router.push({ pathname: '/check-in/[id]', params: { id: v.occurrenceId } })} /> : undefined}
    >
      <Entrance>
        <Card className="gap-4">
          <View className="flex-row items-center gap-3">
            <IconTile icon={serviceIcon(v.serviceName)} size={52} />
            <View className="flex-1">
              <Text variant="h3">{v.serviceName}</Text>
              <Text variant="body" tone="muted">{v.startsAt ? `Starts ${time(v.startsAt)}` : 'Time to be confirmed'}</Text>
            </View>
            <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
          </View>
          <View className="flex-row items-center gap-3 rounded-lg bg-teal-50 p-3">
            <Avatar name={v.workerName} size={44} />
            <View className="flex-1">
              <Text variant="bodyStrong">{v.workerName ?? 'Worker not assigned yet'}</Text>
              <Text variant="sm" tone="muted">{v.workerName ? 'Nestovin staff assigned to your slot' : 'You will see their name here before the visit'}</Text>
            </View>
          </View>
        </Card>
      </Entrance>

      {v.noShow === 'WORKER_ABSENT' ? <Banner tone="error" title="We missed this visit">Sorry about this. Our team has been alerted. Raise a request if you need help.</Banner> : null}
      {v.noShow === 'RESIDENT_ABSENT' ? <Banner tone="warning" title="No one was home">The worker could not get in for this visit. If that is not right, let us know.</Banner> : null}

      <Entrance index={1}>
        <Card className="gap-4">
          <Text variant="h3">What happened</Text>
          <Timeline
            steps={[
              { title: 'Scheduled', detail: longDate(v.scheduledDate), state: 'done' },
              { title: 'Worker assigned', detail: v.workerName, state: v.workerName ? 'done' : 'current' },
              { title: 'Checked in', detail: v.checkedInAt ? time(v.checkedInAt) : v.canShowCode ? 'Show your code when they arrive' : null, state: v.checkedInAt ? 'done' : v.canShowCode ? 'current' : 'todo' },
              { title: 'Completed', detail: v.completedAt ? time(v.completedAt) : null, state: done ? 'done' : 'todo' },
            ]}
          />
        </Card>
      </Entrance>

      {done ? (
        rated ? (
          <Entrance>
            <Card tone="mint" className="items-center gap-2 py-6">
              {feedback.isSuccess ? <SuccessCheck size={80} /> : <Illustration source={img('ill-visit-done.png')} icon="star" size={88} />}
              <Text variant="h3">Thanks for your rating</Text>
              <Stars value={rated.rating} readOnly />
              {rated.comment ? <Text variant="body" tone="muted" className="text-center">{`“${rated.comment}”`}</Text> : null}
            </Card>
          </Entrance>
        ) : (
          <Card className="gap-4">
            <View className="gap-1">
              <Text variant="h3">How was this visit?</Text>
              <Text variant="sm" tone="muted">Your rating goes to our quality team, not to the worker directly.</Text>
            </View>
            <Stars value={stars} onChange={setStars} />
            <Text variant="label" tone="muted" className="text-center min-h-[20px]">{stars ? LABELS[stars - 1] : 'Tap a star'}</Text>
            {stars ? <Field label="Anything to add?" optional value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="What went well, or what could be better" /> : null}
            {feedback.error ? <Banner tone="error">{errorMessage(feedback.error)}</Banner> : null}
            <Button title="Send rating" disabled={!stars} loading={feedback.isPending} onPress={() => feedback.mutate()} />
          </Card>
        )
      ) : null}
      <Button title="Get help with this visit" variant="tertiary" icon="chatbubbles-outline" onPress={() => router.push({ pathname: '/ticket/new', params: { subject: `${v.serviceName} visit on ${longDate(v.scheduledDate)}` } })} />
    </Screen>
  );
}

function Stars({ value, onChange, readOnly }: { value: number; onChange?: (n: number) => void; readOnly?: boolean }) {
  return (
    <View className="flex-row justify-center gap-2" accessibilityRole={readOnly ? 'text' : 'adjustable'} accessibilityLabel={`Rating ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        readOnly ? (
          <Icon key={n} name={n <= value ? 'star' : 'star-outline'} size={22} color={n <= value ? colors.warning : colors.border} />
        ) : (
          <PressScale key={n} onPress={() => onChange?.(n)} haptic="select" scaleTo={0.85} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}, ${LABELS[n - 1]}`} aria-selected={n === value} className="h-12 w-12 items-center justify-center">
            <Icon name={n <= value ? 'star' : 'star-outline'} size={36} color={n <= value ? colors.warning : colors.textSecondary} />
          </PressScale>
        ),
      )}
    </View>
  );
}
