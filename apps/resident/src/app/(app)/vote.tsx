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
  SuccessCheck,
  Text,
  haptics,
} from '@nestovin/ui-native';
import { api, errorMessage } from '../../lib/api';
import { img } from '../../assets/images';

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

  if (vote.isSuccess) {
    return (
      <Screen title="Thank you" onBack={() => router.back()}>
        <View className="items-center gap-4 pt-8">
          <SuccessCheck />
          <Text variant="h2" className="text-center">
            Your vote is in
          </Text>
          <Text
            variant="body"
            tone="muted"
            className="text-center"
          >{`We use votes to decide where Nestovin goes next. We will let you know if ${name.trim()} goes live.`}</Text>
        </View>
        <Button title="Done" onPress={() => router.back()} />
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
      />
    </Screen>
  );
}
