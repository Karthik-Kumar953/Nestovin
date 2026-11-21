import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Household } from '@nestovin/contracts';
import {
  Avatar,
  Banner,
  Button,
  Card,
  Divider,
  Entrance,
  Field,
  ListRow,
  Photo,
  Screen,
  Sheet,
  SkeletonList,
  StatusChip,
  Text,
  haptics,
} from '@nestovin/ui-native';
import { api, ApiError, errorMessage } from '../../lib/api';
import { toE164 } from '../../lib/auth';
import {
  keys,
  useChangeRequests,
  useHousehold,
  useMe,
  type ChangeRequest,
} from '../../lib/queries';
import { CHANGE_STATUS } from '../../lib/status';
import { phone, shortDate, ymd } from '../../lib/format';
import { img } from '../../assets/images';
import { ErrorState } from '../../components/common';

const FAMILY_STATUS = {
  PENDING: { label: 'Awaiting in-person check', tone: 'info' as const },
  APPROVED: { label: 'Approved', tone: 'success' as const },
  REJECTED: { label: 'Not approved', tone: 'error' as const },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' as const },
};

/** RES-04/05: household members, family requests (Primary only) and residence change requests. */
export default function HouseholdScreen() {
  const qc = useQueryClient();
  const me = useMe();
  const household = useHousehold();
  const changes = useChangeRequests();
  const [adding, setAdding] = useState(false);
  const set = (h: Household) => qc.setQueryData(keys.household, h);
  const cancelReq = useMutation({
    mutationFn: (id: string) =>
      api<Household>(`/v1/resident/household/family-requests/${id}`, { method: 'DELETE' }),
    onSuccess: set,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<Household>(`/v1/resident/household/members/${id}`, { method: 'DELETE' }),
    onSuccess: set,
  });
  const cancelChange = useMutation({
    mutationFn: (id: string) =>
      api<{ items: ChangeRequest[] }>(`/v1/resident/change-requests/${id}/cancel`, {
        method: 'POST',
      }),
    onSuccess: (d) => {
      haptics.success();
      qc.setQueryData(keys.changes, d);
    },
    onError: () => haptics.error(),
  });
  const m = me.data?.membership;
  const h = household.data;
  const confirmRemove = (id: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'They lose access to your flat in the app straight away.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(id) },
    ]);

  const confirmCancelRequest = (id: string, name: string) =>
    Alert.alert(`Cancel the request for ${name}?`, 'You can send a new request later.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancelReq.mutate(id) },
    ]);
  const confirmCancelChange = (id: string) =>
    Alert.alert('Withdraw this change request?', 'Your current details stay as they are.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => cancelChange.mutate(id) },
    ]);

  return (
    <Screen
      title="Household"
      onBack={() => router.back()}
      onRefresh={() => void Promise.all([household.refetch(), changes.refetch()])}
      refreshing={household.isRefetching || changes.isRefetching}
    >
      {m ? (
        <Card raised className="flex-row items-center gap-4">
          <Photo
            source={img('community-towers.jpg')}
            fallbackIcon="business-outline"
            className="rounded-md"
            style={{ width: 72, height: 72 }}
            alt={`${m.communityName} community`}
          />
          <View className="flex-1 gap-1">
            <Text variant="h3">{m.communityName}</Text>
            <Text variant="body" tone="muted">{`${m.towerName} · Flat ${m.flatNumber}`}</Text>
            <StatusChip label="Verified residence" tone="success" icon="shield-checkmark" />
          </View>
        </Card>
      ) : null}
      {household.isLoading ? <SkeletonList count={2} /> : null}
      {household.error ? (
        <ErrorState error={household.error} onRetry={() => void household.refetch()} compact />
      ) : null}
      {remove.error || cancelReq.error ? (
        <Banner tone="error">{errorMessage(remove.error ?? cancelReq.error)}</Banner>
      ) : null}

      {h ? (
        <Entrance>
          <SectionLabel>Members</SectionLabel>
          <Card className="gap-1 py-2">
            {h.members.map((x, i) => (
              <View key={x.membershipId}>
                {i ? <Divider inset={60} /> : null}
                <ListRow
                  leading={<Avatar name={x.fullName ?? x.phone} size={44} />}
                  title={x.fullName ?? phone(x.phone)}
                  subtitle={x.kind === 'PRIMARY' ? 'Primary resident' : 'Family member'}
                  chevron={false}
                  trailing={
                    h.isPrimary && x.kind === 'FAMILY' ? (
                      <Button
                        title="Remove"
                        variant="tertiary"
                        size="sm"
                        icon="person-remove-outline"
                        block={false}
                        loading={remove.isPending && remove.variables === x.membershipId}
                        onPress={() => confirmRemove(x.membershipId, x.fullName ?? x.phone)}
                      />
                    ) : undefined
                  }
                />
              </View>
            ))}
          </Card>
        </Entrance>
      ) : null}

      {h?.isPrimary ? (
        <Entrance index={1}>
          <SectionLabel>Family members</SectionLabel>
          <Card className="gap-3">
            <Text variant="sm" tone="muted">
              They sign in with their own number. Our team checks them in person before access
              starts.
            </Text>
            {h.requests.map((r) => {
              const st = FAMILY_STATUS[r.status];
              return (
                <View
                  key={r.id}
                  className="flex-row items-center gap-3 rounded-md border border-line p-3"
                >
                  <Avatar name={r.fullName} size={40} />
                  <View className="flex-1 gap-1">
                    <Text variant="bodyStrong">{`${r.fullName} · ${r.relationship}`}</Text>
                    <StatusChip label={st.label} tone={st.tone} />
                    {r.reason ? (
                      <Text variant="sm" tone="muted">
                        {r.reason}
                      </Text>
                    ) : null}
                  </View>
                  {r.status === 'PENDING' ? (
                    <Button
                      title="Cancel"
                      variant="tertiary"
                      size="sm"
                      icon="close-circle-outline"
                      block={false}
                      loading={cancelReq.isPending && cancelReq.variables === r.id}
                      onPress={() => confirmCancelRequest(r.id, r.fullName)}
                    />
                  ) : null}
                </View>
              );
            })}
            <Button
              title="Add a family member"
              variant="secondary"
              icon="person-add-outline"
              onPress={() => setAdding(true)}
            />
          </Card>
        </Entrance>
      ) : null}

      <Entrance index={2}>
        <SectionLabel>Residence changes</SectionLabel>
        <Card className="gap-3">
          <Text variant="sm" tone="muted">
            Changes to verified details are reviewed by our team.
          </Text>
          {changes.isLoading ? <SkeletonList count={1} /> : null}
          {changes.error && !changes.data ? (
            <ErrorState error={changes.error} onRetry={() => void changes.refetch()} compact />
          ) : null}
          {cancelChange.error ? (
            <Banner tone="error">{errorMessage(cancelChange.error)}</Banner>
          ) : null}
          {(changes.data ?? []).map((c) => {
            const st = CHANGE_STATUS[c.status] ?? {
              label: c.status.toLowerCase(),
              tone: 'neutral' as const,
            };
            return (
              <View key={c.id} className="gap-1 rounded-md border border-line p-3">
                <View className="flex-row items-center justify-between gap-2">
                  <Text variant="bodyStrong" className="flex-1">
                    {c.kind === 'MOVE_OUT'
                      ? `Moving out on ${c.requested.moveOutDate ? shortDate(c.requested.moveOutDate) : ''}`
                      : `Change to ${String(c.requested.occupancy ?? '').toLowerCase()}`}
                  </Text>
                  <StatusChip label={st.label} tone={st.tone} />
                </View>
                {c.createdAt ? (
                  <Text
                    variant="sm"
                    tone="muted"
                  >{`Sent ${shortDate(ymd(new Date(c.createdAt)))}`}</Text>
                ) : null}
                {c.reviewNote ? (
                  <Text variant="sm" tone="muted">
                    {c.reviewNote}
                  </Text>
                ) : null}
                {c.status === 'PENDING' ? (
                  <Button
                    title="Withdraw request"
                    variant="tertiary"
                    size="sm"
                    icon="close-circle-outline"
                    block={false}
                    loading={cancelChange.isPending && cancelChange.variables === c.id}
                    onPress={() => confirmCancelChange(c.id)}
                  />
                ) : null}
              </View>
            );
          })}
          <Button
            title="Request a change"
            variant="secondary"
            icon="swap-horizontal-outline"
            onPress={() => router.push('/change-request')}
          />
        </Card>
      </Entrance>

      <AddFamilySheet visible={adding} onClose={() => setAdding(false)} onDone={set} />
    </Screen>
  );
}

function AddFamilySheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (h: Household) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [touched, setTouched] = useState(false);
  const invite = useMutation({
    mutationFn: () =>
      api<Household>('/v1/resident/household/family-requests', {
        method: 'POST',
        body: {
          fullName: name.trim(),
          phone: toE164(phone) ?? phone,
          relationship: relationship.trim(),
        },
      }),
    onSuccess: (h) => {
      haptics.success();
      onDone(h);
      setName('');
      setPhone('');
      setRelationship('');
      setTouched(false);
      onClose();
    },
    onError: () => haptics.error(),
  });
  const err = (p: string) => (invite.error instanceof ApiError ? invite.error.field(p) : undefined);
  const e = {
    name: touched && name.trim().length < 2 ? 'Enter their full name' : err('fullName'),
    phone: touched && !toE164(phone) ? 'Enter a 10-digit mobile number' : err('phone'),
    rel:
      touched && relationship.trim().length < 2
        ? 'For example: spouse, parent, child'
        : err('relationship'),
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add a family member"
      subtitle="We verify them in person before they get access."
      footer={
        <>
          {invite.error && !e.name && !e.phone && !e.rel ? (
            <Banner tone="error">{errorMessage(invite.error)}</Banner>
          ) : null}
          <Button
            title="Send request"
            loading={invite.isPending}
            onPress={() => {
              setTouched(true);
              if (name.trim().length >= 2 && toE164(phone) && relationship.trim().length >= 2)
                invite.mutate();
            }}
          />
        </>
      }
    >
      <Field
        label="Full name"
        value={name}
        onChangeText={setName}
        maxLength={120}
        error={e.name}
        autoComplete="name"
      />
      <Field
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        error={e.phone}
        prefix={
          <Text variant="bodyStrong" tone="muted">
            +91
          </Text>
        }
      />
      <Field
        label="Relationship"
        value={relationship}
        onChangeText={setRelationship}
        maxLength={40}
        error={e.rel}
        placeholder="Spouse, parent, child"
      />
    </Sheet>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" tone="muted" accessibilityRole="header" className="px-1 mb-2">
      {children}
    </Text>
  );
}
