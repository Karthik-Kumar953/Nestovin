import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TicketDetail } from '@nestovin/contracts';
import {
  Banner,
  Button,
  ChoiceTile,
  Field,
  Screen,
  SkeletonList,
  Text,
  haptics,
  type IconName,
} from '@nestovin/ui-native';
import { api, ApiError, errorMessage } from '../../../lib/api';
import { keys, useTicketCategories } from '../../../lib/queries';

const iconFor = (name: string): IconName => {
  const n = name.toLowerCase();
  if (n.includes('pay') || n.includes('bill') || n.includes('refund')) return 'card-outline';
  if (n.includes('visit') || n.includes('service') || n.includes('quality')) return 'home-outline';
  if (n.includes('staff') || n.includes('worker') || n.includes('behav')) return 'person-outline';
  if (n.includes('time') || n.includes('schedule')) return 'time-outline';
  if (n.includes('account') || n.includes('flat') || n.includes('resid')) return 'business-outline';
  return 'help-circle-outline';
};

/** New support request: category, subject, details. Can be opened prefilled from a booking or visit. */
export default function NewTicket() {
  const p = useLocalSearchParams<{ subject?: string }>();
  const qc = useQueryClient();
  const categories = useTicketCategories();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState(p.subject ?? '');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api<TicketDetail>('/v1/resident/tickets', {
        method: 'POST',
        body: { categoryId, subject: subject.trim(), description: description.trim() },
      }),
    onSuccess: async (t) => {
      haptics.success();
      await qc.invalidateQueries({ queryKey: keys.tickets });
      router.replace({ pathname: '/ticket/[id]', params: { id: t.id } });
    },
    onError: () => haptics.error(),
  });
  const fieldErr = (path: string) =>
    create.error instanceof ApiError ? create.error.field(path) : undefined;
  const subjectErr =
    touched && subject.trim().length < 3
      ? 'Add a short subject (at least 3 characters)'
      : fieldErr('subject');
  const descErr =
    touched && description.trim().length < 5
      ? 'Tell us a little more (at least 5 characters)'
      : fieldErr('description');
  const submit = () => {
    setTouched(true);
    if (!categoryId || subject.trim().length < 3 || description.trim().length < 5)
      return haptics.error();
    create.mutate();
  };

  return (
    <Screen
      title="New request"
      onBack={() => router.back()}
      footer={
        <>
          {create.error && !fieldErr('subject') && !fieldErr('description') ? (
            <Banner tone="error">{errorMessage(create.error)}</Banner>
          ) : null}
          <Button title="Send request" icon="send" loading={create.isPending} onPress={submit} />
        </>
      }
    >
      <View className="gap-3">
        <Text variant="h3">What is it about?</Text>
        {categories.isLoading ? <SkeletonList count={2} /> : null}
        {(categories.data ?? []).map((c) => (
          <ChoiceTile
            key={c.id}
            compact
            icon={iconFor(c.name)}
            title={c.name}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
        {touched && !categoryId ? (
          <Text variant="sm" tone="error" accessibilityRole="alert">
            Choose what your request is about
          </Text>
        ) : null}
      </View>
      <Field
        label="Subject"
        value={subject}
        onChangeText={setSubject}
        maxLength={140}
        error={subjectErr}
        placeholder="For example: Cook arrived late today"
      />
      <Field
        label="Details"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={4000}
        error={descErr}
        helper="Dates, times and what happened help us fix it faster."
      />
    </Screen>
  );
}
