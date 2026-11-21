import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TicketDetail } from '@nestovin/contracts';
import { Banner, Entrance, IconButton, Screen, SkeletonList, StatusChip, Text, colors, fonts, haptics } from '@nestovin/ui-native';
import { api, errorMessage } from '../../../lib/api';
import { keys, useTicket } from '../../../lib/queries';
import { dateTime } from '../../../lib/format';
import { ticketStatus } from '../../../lib/status';
import { ErrorState } from '../../../components/common';

/** Request thread: the original message, replies as a conversation, and a reply composer. */
export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const ticket = useTicket(id);
  const [body, setBody] = useState('');
  const reply = useMutation({
    mutationFn: () => api<TicketDetail>(`/v1/resident/tickets/${id}/replies`, { method: 'POST', body: { body: body.trim() } }),
    onSuccess: async (t) => {
      haptics.tap();
      setBody('');
      qc.setQueryData(['ticket', id], t);
      await qc.invalidateQueries({ queryKey: keys.tickets });
    },
    onError: () => haptics.error(),
  });

  if (ticket.isLoading) return <Screen title="Request" onBack={() => router.back()}><SkeletonList count={3} /></Screen>;
  const t = ticket.data;
  if (!t) return <Screen title="Request" onBack={() => router.back()}><ErrorState error={ticket.error} onRetry={() => void ticket.refetch()} /></Screen>;
  const st = ticketStatus(t.status);
  const closed = t.status === 'CLOSED';

  return (
    <Screen
      title={t.subject}
      eyebrow={`${t.reference} · ${t.categoryName}`}
      onBack={() => router.back()}
      onRefresh={() => void ticket.refetch()}
      refreshing={ticket.isRefetching}
      footer={
        closed ? (
          <Banner tone="info">This request is closed. Start a new one if you still need help.</Banner>
        ) : (
          <View className="gap-2">
            {reply.error ? <Banner tone="error">{errorMessage(reply.error)}</Banner> : null}
            <View className="flex-row items-end gap-2">
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Write a reply"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={4000}
                accessibilityLabel="Reply"
                style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary, backgroundColor: colors.white }}
              />
              <View className={`rounded-full ${body.trim() ? 'bg-teal' : 'bg-surface-subtle'}`}>
                <IconButton icon="arrow-up" label="Send reply" tone={body.trim() ? 'inverse' : 'plain'} onPress={() => body.trim() && !reply.isPending && reply.mutate()} />
              </View>
            </View>
          </View>
        )
      }
    >
      <StatusChip label={st.label} tone={st.tone} icon={st.icon} />
      <Bubble mine author="You" at={t.createdAt} body={t.description} />
      {t.updates.map((u, i) => (
        <Entrance key={u.id} index={i}>
          {u.authorKind === 'system' ? (
            <View className="items-center py-1">
              <Text variant="caption" tone="muted" className="text-center">{`${u.body} · ${dateTime(u.createdAt)}`}</Text>
            </View>
          ) : (
            <Bubble mine={u.authorKind === 'resident'} author={u.authorName ?? (u.authorKind === 'resident' ? 'You' : 'Nestovin Support')} at={u.createdAt} body={u.body} />
          )}
        </Entrance>
      ))}
    </Screen>
  );
}

function Bubble({ mine, author, at, body }: { mine: boolean; author: string; at: string; body: string }) {
  return (
    <View className={`max-w-[86%] gap-1 ${mine ? 'self-end items-end' : 'self-start'}`} accessible accessibilityLabel={`${author}, ${dateTime(at)}: ${body}`}>
      <Text variant="caption" tone="muted">{`${author} · ${dateTime(at)}`}</Text>
      <View className={`rounded-2xl px-4 py-3 ${mine ? 'bg-teal rounded-br-md' : 'bg-white border border-line rounded-bl-md'}`}>
        <Text variant="body" tone={mine ? 'inverse' : 'default'}>{body}</Text>
      </View>
    </View>
  );
}
