import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { Banner, Button, Card, Choice, Field, H1, P, Screen } from '../../components/ui';

/** RES-02A: interest vote for a city or community Nestovin does not serve yet. */
export default function Vote() {
  const [level, setLevel] = useState<'CITY' | 'COMMUNITY'>('COMMUNITY');
  const [cityId, setCityId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const cities = useQuery({ queryKey: ['cities'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/resident/cities') });
  const vote = useMutation({
    mutationFn: () =>
      api('/v1/resident/expansion-votes', {
        method: 'POST',
        body: level === 'CITY' ? { level, cityName: name } : { level, cityId, communityName: name },
      }),
    onSuccess: () => setDone(true),
  });
  if (done) {
    return (
      <Screen>
        <H1>Thank you</H1>
        <Banner tone="success">Your vote is recorded. We use votes to decide where Nestovin goes next.</Banner>
        <Button title="Back to home" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return (
    <Screen>
      <H1>Bring Nestovin to you</H1>
      <P muted>Tell us where you live. One vote per place.</P>
      <Choice options={[{ value: 'COMMUNITY', label: 'My community is not listed' }, { value: 'CITY', label: 'My city is not listed' }]} value={level} onChange={setLevel} />
      {level === 'COMMUNITY' ? (
        <Card>
          <P>City</P>
          <Choice options={(cities.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} value={cityId} onChange={setCityId} />
        </Card>
      ) : null}
      <Field label={level === 'CITY' ? 'City name' : 'Community name'} value={name} onChangeText={setName} maxLength={120} />
      {vote.error ? <Banner tone="error">{errorMessage(vote.error)}</Banner> : null}
      <Button title="Submit vote" disabled={name.trim().length < 2 || (level === 'COMMUNITY' && !cityId)} busy={vote.isPending} onPress={() => vote.mutate()} />
    </Screen>
  );
}
