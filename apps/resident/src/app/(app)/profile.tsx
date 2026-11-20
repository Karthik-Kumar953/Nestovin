import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResidentMe } from '@nestovin/contracts';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useMe } from './index';
import { Banner, Button, Card, ErrorText, Field, H1, H2, Loading, P, Screen } from '../../components/ui';

/** RES-14: self-service name/email; household, change requests and sign-out. */
export default function Profile() {
  const me = useMe();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (me.data) {
      setFullName(me.data.fullName ?? '');
      setEmail(me.data.email ?? '');
    }
  }, [me.data]);
  const save = useMutation({
    mutationFn: () => api<ResidentMe>('/v1/resident/me', { method: 'PATCH', body: { fullName: fullName.trim() || undefined, email: email.trim() || null, version: me.data!.version } }),
    onSuccess: (d) => qc.setQueryData(['me'], d),
  });
  if (me.isLoading) return <Screen><Loading /></Screen>;
  if (!me.data) return <Screen><ErrorText error={me.error} /></Screen>;
  const m = me.data.membership;
  return (
    <Screen>
      <H1>Profile</H1>
      <Card>
        <P muted>Signed in as {me.data.phone}</P>
        <Field label="Full name" value={fullName} onChangeText={setFullName} maxLength={120} />
        <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        {save.error ? <Banner tone="error">{errorMessage(save.error)}</Banner> : null}
        {save.isSuccess ? <Banner tone="success">Saved</Banner> : null}
        <Button title="Save" busy={save.isPending} onPress={() => save.mutate()} />
      </Card>
      {m ? (
        <Card>
          <H2>Household</H2>
          <P>{m.communityName} · {m.towerName} · {m.flatNumber}</P>
          <P muted>{m.kind === 'PRIMARY' ? 'You are the Primary Resident' : 'Family member'} · {m.status.toLowerCase()}</P>
          <Button title="Household and requests" variant="secondary" onPress={() => router.push('/household')} />
        </Card>
      ) : null}
      <Button title="Notifications" variant="secondary" onPress={() => router.push('/notifications')} />
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
