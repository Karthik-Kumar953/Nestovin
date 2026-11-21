import { useState } from 'react';
import { Alert, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResidentMe } from '@nestovin/contracts';
import { Avatar, Banner, Button, Card, Divider, Entrance, Field, ListRow, Screen, Sheet, SkeletonList, StatusChip, Text, haptics } from '@nestovin/ui-native';
import { api, ApiError, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { keys, useMe, useUnread } from '../../../lib/queries';
import { phone } from '../../../lib/format';
import { ErrorState } from '../../../components/common';

/** RES-14: the resident's details, household, requests and settings. Sign-out sits apart from everything else. */
export default function Profile() {
  const me = useMe();
  const unread = useUnread();
  const { signOut } = useAuth();
  const [editing, setEditing] = useState(false);

  if (me.isLoading) return <Screen title="Profile"><SkeletonList count={3} /></Screen>;
  if (!me.data) return <Screen title="Profile"><ErrorState error={me.error} onRetry={() => void me.refetch()} /></Screen>;
  const d = me.data;
  const m = d.membership;
  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will need a new code to sign in again.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen title="Profile" onRefresh={() => void me.refetch()} refreshing={me.isRefetching}>
      <Entrance>
        <Card raised className="items-center gap-3 py-7">
          <Avatar name={d.fullName} size={84} />
          <View className="items-center gap-0.5">
            <Text variant="h2">{d.fullName ?? 'Add your name'}</Text>
            <Text variant="body" tone="muted">{phone(d.phone)}</Text>
            {d.email ? <Text variant="sm" tone="muted">{d.email}</Text> : null}
          </View>
          {m ? <StatusChip label={m.status === 'VERIFIED' ? (m.kind === 'PRIMARY' ? 'Primary resident' : 'Family member') : 'Verification in progress'} tone={m.status === 'VERIFIED' ? 'success' : 'info'} icon={m.status === 'VERIFIED' ? 'shield-checkmark' : 'time'} /> : null}
          <Button title="Edit details" variant="secondary" size="sm" icon="create-outline" block={false} onPress={() => setEditing(true)} />
        </Card>
      </Entrance>

      <Card padded={false} className="px-5 py-1 gap-0">
        {m ? <ListRow icon="business-outline" title={`${m.communityName}`} subtitle={`${m.towerName} · Flat ${m.flatNumber} · ${m.occupancy === 'OWNER' ? 'Owner' : m.occupancy === 'TENANT' ? 'Tenant' : 'Family'}`} onPress={() => router.push('/household')} /> : <ListRow icon="home-outline" title="Register your flat" subtitle="Needed before you can book" onPress={() => router.push('/register')} />}
        {m?.status === 'VERIFIED' ? (
          <>
            <Divider inset={52} />
            <ListRow icon="people-outline" title="Household" subtitle={m.kind === 'PRIMARY' ? 'Family members and access' : 'Members of your flat'} onPress={() => router.push('/household')} />
            <Divider inset={52} />
            <ListRow icon="swap-horizontal-outline" title="Change residence details" subtitle="Owner or tenant, or moving out" onPress={() => router.push('/change-request')} />
          </>
        ) : null}
      </Card>

      <Card padded={false} className="px-5 py-1 gap-0">
        <ListRow icon="receipt-outline" title="Bookings and payments" onPress={() => router.push('/bookings')} />
        <Divider inset={52} />
        <ListRow icon="notifications-outline" title="Updates" trailing={unread.data ? <StatusChip label={`${unread.data} new`} tone="brand" icon={null} /> : undefined} onPress={() => router.push('/notifications')} />
        <Divider inset={52} />
        <ListRow icon="chatbubbles-outline" title="Help and support" onPress={() => router.push('/support')} />
        <Divider inset={52} />
        <ListRow icon="megaphone-outline" title="Bring Nestovin to another community" onPress={() => router.push('/vote')} />
      </Card>

      <Card padded={false} className="px-5 py-1">
        <ListRow icon="log-out-outline" title="Sign out" destructive chevron={false} onPress={confirmSignOut} />
      </Card>
      <Text variant="caption" tone="muted" className="text-center">{`Nestovin ${Constants.expoConfig?.version ?? ''}`}</Text>

      <EditSheet visible={editing} onClose={() => setEditing(false)} me={d} />
    </Screen>
  );
}

function EditSheet({ visible, onClose, me }: { visible: boolean; onClose: () => void; me: ResidentMe }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(me.fullName ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const save = useMutation({
    mutationFn: () => api<ResidentMe>('/v1/resident/me', { method: 'PATCH', body: { fullName: fullName.trim() || undefined, email: email.trim() || null, version: me.version } }),
    onSuccess: (d) => {
      haptics.success();
      qc.setQueryData(keys.me, d);
      onClose();
    },
    onError: () => haptics.error(),
  });
  const err = (p: string) => (save.error instanceof ApiError ? save.error.field(p) : undefined);
  const nameErr = fullName.trim() && fullName.trim().length < 2 ? 'Use at least 2 characters' : err('fullName');
  const emailErr = email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter an email like name@example.com' : err('email');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Your details"
      subtitle="Your phone number is how you sign in, so it cannot be changed here."
      footer={
        <>
          {save.error && !err('fullName') && !err('email') ? <Banner tone="error">{save.error instanceof ApiError && save.error.status === 409 ? 'Your details changed on another device. Close and try again.' : errorMessage(save.error)}</Banner> : null}
          <Button title="Save" loading={save.isPending} disabled={Boolean(nameErr || emailErr)} onPress={() => save.mutate()} />
        </>
      }
    >
      <Field label="Full name" value={fullName} onChangeText={setFullName} maxLength={120} autoComplete="name" textContentType="name" error={nameErr} />
      <Field label="Email" optional value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={emailErr} helper="For receipts and important updates." />
    </Sheet>
  );
}
