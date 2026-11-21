import { useState } from 'react';
import { Alert, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, Play } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { trainingPhoto } from '../../assets/images';
import { errorMessage } from '../../lib/api';
import { haptic } from '../../lib/haptics';
import { qk, useCompleteTraining, useMe } from '../../lib/queries';
import { BrandImage, Button, EmptyState, ErrorState, LoadingList, Muted, PressScale, ProgressRing, Screen, Stagger, Text, c, shadow } from '../../ui';

/**
 * EMP-04 training: open the video link, then confirm it was watched. The
 * completion condition is OPEN, so the worker confirms explicitly.
 */
export default function Training() {
  const qc = useQueryClient();
  const me = useMe();
  const complete = useCompleteTraining();
  const [opened, setOpened] = useState<string[]>([]);

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
      Alert.alert('Could not open the video', 'Check your internet connection and try again.');
    }
  };
  const markDone = (itemId: string) =>
    complete.mutate(itemId, {
      onSuccess: () => haptic.success(),
      onError: (e) => {
        haptic.error();
        Alert.alert('Could not save', errorMessage(e));
      },
    });

  return (
    <Screen edges={['bottom', 'left', 'right']} onRefresh={() => qc.invalidateQueries({ queryKey: qk.me })}>
      {items.length ? (
        <Stagger index={0}>
          <View className="flex-row items-center gap-4 rounded-xl bg-surface p-4" style={shadow.card}>
            <ProgressRing value={items.length ? done / items.length : 0} label={`${done}/${items.length}`} size={68} />
            <View className="flex-1 gap-0.5">
              <Text className="font-heading text-lg text-charcoal">{done === items.length ? 'All videos watched' : 'Your training'}</Text>
              <Muted className="text-sm">{done === items.length ? 'Well done. HR can see your progress.' : 'Watch each video, then tap “I have watched it”.'}</Muted>
            </View>
          </View>
        </Stagger>
      ) : null}
      {items.length ? (
        items.map((t, i) => {
          const isDone = !!t.completedAt;
          return (
            <Stagger key={t.itemId} index={i + 1}>
              <View className="overflow-hidden rounded-2xl border border-line/70 bg-surface" style={shadow.card}>
                <PressScale onPress={() => void watch(t.itemId, t.url)} accessibilityLabel={`Play ${t.title}`} accessibilityHint="Opens the video">
                  <View className="h-40">
                    <BrandImage name={trainingPhoto(i)} className="h-full w-full" />
                    <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(8,28,25,0.55)']} style={{ position: 'absolute', inset: 0 }} />
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="h-16 w-16 items-center justify-center rounded-full bg-white/95" style={shadow.float}>
                        <Play size={28} color={c.tealDeep} fill={c.tealDeep} />
                      </View>
                    </View>
                    {isDone ? (
                      <View className="absolute left-3 top-3 flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
                        <CheckCircle2 size={16} color={c.greenAction} />
                        <Text className="font-semibold text-[13px] text-success-text">Watched</Text>
                      </View>
                    ) : null}
                  </View>
                </PressScale>
                <View className="gap-3 p-4">
                  <Text className="font-heading text-lg text-charcoal">{t.title}</Text>
                  {isDone ? (
                    <Muted className="text-sm">Completed on {new Date(t.completedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</Muted>
                  ) : (
                    <View className="flex-row gap-3">
                      <Button title="Watch" variant="secondary" size="md" icon={Play} onPress={() => void watch(t.itemId, t.url)} className="flex-1" />
                      <Button
                        title="I have watched it"
                        size="md"
                        icon={CheckCircle2}
                        variant={opened.includes(t.itemId) ? 'primary' : 'secondary'}
                        busy={complete.isPending && complete.variables === t.itemId}
                        onPress={() => markDone(t.itemId)}
                        className="flex-[1.4]"
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
