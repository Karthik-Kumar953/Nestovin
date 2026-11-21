import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Banner,
  Button,
  ChoiceTile,
  Field,
  Illustration,
  Screen,
  SegmentedControl,
  SkeletonList,
  SuccessCheck,
  Text,
  haptics,
} from '@nestovin/ui-native';
import { api, ApiError, errorMessage } from '../../lib/api';
import { img } from '../../assets/images';
import { ErrorState } from '../../components/common';

/** RES-02A: interest vote for a city or community Nestovin does not serve yet. */
export default function Vote() {
  const [level, setLevel] = useState<'COMMUNITY' | 'CITY'>('COMMUNITY');
  const [cityId, setCityId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const cities = useQuery({
    queryKey: ['cities'],
    queryFn: () =>
      api<{ items: { id: string; name: string; state: string }[] }>('/v1/resident/cities'),
  });
  const vote = useMutation({
    mutationFn: () =>
      api('/v1/resident/expansion-votes', {
        method: 'POST',
        body:
          level === 'CITY'
            ? { level, cityName: name.trim() }
            : { level, cityId, communityName: name.trim() },
      }),
    onSuccess: () => haptics.success(),
    onError: () => haptics.error(),
  });

  // RES-02A: one vote per place. A repeat vote is not an error for the resident; it is already counted.
  const already = vote.error instanceof ApiError && vote.error.status === 409;
  if (vote.isSuccess || already) {
    return (
      <Screen title="Thank you" onBack={() => router.back()}>
        <View className="items-center gap-4 pt-8">
          <SuccessCheck />
          <Text variant="h2" className="text-center">
            {already ? 'Your vote is already counted' : 'Your vote is in'}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {already
              ? `You have voted for ${name.trim()} before, and that vote still counts. Each person gets one vote per place.`
              : `Thank you for voting for ${name.trim()}. We use votes to decide where Nestovin goes next. A vote does not register you for service.`}
          </Text>
        </View>
        <Button title="Done" icon="checkmark" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Bring Nestovin to you"
      onBack={() => router.back()}
      footer={
        <>
          {vote.error ? <Banner tone="error">{errorMessage(vote.error)}</Banner> : null}
          <Button
            title="Send my vote"
            icon="megaphone-outline"
            loading={vote.isPending}
            disabled={name.trim().length < 2 || (level === 'COMMUNITY' && !cityId)}
            onPress={() => vote.mutate()}
          />
        </>
      }
    >
      <View className="items-center">
        <Illustration source={img('ill-vote.png')} icon="megaphone-outline" size={132} />
      </View>
      <Text variant="body" tone="muted" className="text-center">
        Tell us where you live. One vote per place, and we count every one.
      </Text>
      <SegmentedControl
        label="What is missing"
        value={level}
        onChange={setLevel}
        options={[
          { value: 'COMMUNITY', label: 'My community' },
          { value: 'CITY', label: 'My city' },
        ]}
      />
      {level === 'COMMUNITY' ? (
        <View className="gap-3">
          <Text variant="h3">City</Text>
          {cities.isLoading ? <SkeletonList count={2} /> : null}
          {cities.error && !cities.data ? (
            <ErrorState error={cities.error} onRetry={() => void cities.refetch()} compact />
          ) : null}
          {(cities.data?.items ?? []).map((c) => (
            <ChoiceTile
              key={c.id}
              compact
              title={c.name}
              description={c.state}
              selected={cityId === c.id}
              onPress={() => setCityId(c.id)}
            />
          ))}
          {cities.data && !cities.data.items.length ? (
            <Text variant="body" tone="muted">
              No cities yet. Vote for your city instead.
            </Text>
          ) : null}
        </View>
      ) : null}
      <Field
        label={level === 'CITY' ? 'City name' : 'Community name'}
        value={name}
        onChangeText={setName}
        maxLength={120}
        placeholder={level === 'CITY' ? 'For example: Pune' : 'For example: Green Meadows'}
        autoCapitalize="words"
      />
    </Screen>
  );
}
