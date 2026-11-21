import { useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle2, Play } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { trainingPhoto } from '../../assets/images';
import { errorMessage } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { qk, useCompleteTraining, useMe } from '../../lib/queries';
import { BrandImage, Button, EmptyState, ErrorState, LoadingList, Muted, PressScale, ProgressBar, Screen, Stagger, Text, c, notify, shadow, useLargeText } from '../../ui';

/**
 * EMP-04 training: open the video link, then confirm it was watched. The
 * completion condition is OPEN, so the worker confirms explicitly.
 */
export default function Training() {
  const qc = useQueryClient();
  const me = useMe();
  const complete = useCompleteTraining();
  const [opened, setOpened] = useState<string[]>([]);
  const large = useLargeText();

  if (!me.data) {
    return <Screen edges={['bottom', 'left', 'right']}>{me.error ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : <LoadingList rows={3} />}</Screen>;
  }
  const items = me.data.training;
  const done = items.filter((t) => t.completedAt).length;

  const watch = async (itemId: string, url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, { toolbarColor: c.tealDeep, controlsColor: c.white, enableBarCollapsing: true });
      setOpened((o) => (o.includes(itemId) ? o : [...o, itemId]));
    } catch {
      notify('Could not open the video', 'Check your internet connection and try again.');
    }
  };
  const markDone = (itemId: string) =>
    complete.mutate(itemId, {
      onSuccess: () => haptic.success(),
      onError: (e) => {
        haptic.error();
        notify('Could not save', errorMessage(e));
      },
    });

  return (
    <Screen edges={['bottom', 'left', 'right']} onRefresh={() => qc.invalidateQueries({ queryKey: qk.me })}>
      {items.length ? (
        <Stagger index={0}>
          <View className="gap-3 rounded-lg border border-line bg-surface p-4" style={shadow.card}>
            <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
              <Text accessibilityRole="header" className="font-heading text-base text-charcoal">{done === items.length ? 'All videos watched' : 'Your training'}</Text>
              <Text className="text-sm text-ink-secondary">
                <Text className="font-semibold text-sm text-charcoal">
                  {done} of {items.length}
                </Text>{' '}
                watched
              </Text>
            </View>
            <ProgressBar value={items.length ? done / items.length : 0} label={`${done} of ${items.length} training videos watched`} />
            <Muted className="text-sm">{done === items.length ? 'Well done. HR can see your progress.' : 'Watch each video, then tap “I have watched it”.'}</Muted>
          </View>
        </Stagger>
      ) : null}
      {items.length ? (
        items.map((t, i) => {
          const isDone = !!t.completedAt;
          return (
            <Stagger key={t.itemId} index={i + 1}>
              <View className="overflow-hidden rounded-lg border border-line bg-surface" style={shadow.card}>
                <PressScale onPress={() => void watch(t.itemId, t.url)} accessibilityLabel={`Play ${t.title}`} accessibilityHint="Opens the video">
                  {/* Image slot wrk-training-1..3 (16:9 thumbnail); designed fallback until added. */}
                  <View style={{ aspectRatio: 16 / 9 }}>
                    <BrandImage name={trainingPhoto(i)} className="h-full w-full" />
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="h-14 w-14 items-center justify-center rounded-full bg-white" style={shadow.float}>
                        <Play size={24} color={c.tealDeep} fill={c.tealDeep} />
                      </View>
                    </View>
                    {isDone ? (
                      <View className="absolute left-3 top-3 flex-row items-center gap-1 rounded-full bg-success-surface px-2.5 py-1">
                        <CheckCircle2 size={16} color={c.greenAction} />
                        <Text className="font-semibold text-label text-success-text">Watched</Text>
                      </View>
                    ) : null}
                  </View>
                </PressScale>
                <View className="gap-3 p-4">
                  <Text className="font-heading text-base text-charcoal">{t.title}</Text>
                  {isDone ? (
                    <Muted className="text-sm">Completed on {new Date(t.completedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</Muted>
                  ) : (
                    <View className={large ? 'gap-3' : 'flex-row gap-3'}>
                      <Button title="Watch" variant="secondary" size="md" icon={Play} onPress={() => void watch(t.itemId, t.url)} className={large ? undefined : 'flex-1'} />
                      <Button
                        title="I have watched it"
                        size="md"
                        icon={CheckCircle2}
                        variant={opened.includes(t.itemId) ? 'primary' : 'secondary'}
                        busy={complete.isPending && complete.variables === t.itemId}
                        onPress={() => markDone(t.itemId)}
                        className={large ? undefined : 'flex-[1.4]'}
                      />
                    </View>
                  )}
                </View>
              </View>
            </Stagger>
          );
        })
      ) : (
        <EmptyState image="ill-training" title="No training videos yet" body="HR adds videos here. You will see them as soon as they are ready." />
      )}
    </Screen>
  );
}
