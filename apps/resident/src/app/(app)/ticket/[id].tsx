import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TicketDetail } from '@nestovin/contracts';
import { api, errorMessage } from '../../../lib/api';
import { TICKET_LABEL } from '../support';
import { Badge, Banner, Button, Card, ErrorText, Field, H1, Loading, P, Row, Screen } from '../../../components/ui';

export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const ticket = useQuery({ queryKey: ['ticket', id], queryFn: () => api<TicketDetail>(`/v1/resident/tickets/${id}`) });
  const [body, setBody] = useState('');
  const reply = useMutation({
    mutationFn: () => api<TicketDetail>(`/v1/resident/tickets/${id}/replies`, { method: 'POST', body: { body } }),
    onSuccess: async (t) => {
      setBody('');
      qc.setQueryData(['ticket', id], t);
      await qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
  if (ticket.isLoading) return <Screen><Loading /></Screen>;
  if (!ticket.data) return <Screen><ErrorText error={ticket.error} /></Screen>;
  const t = ticket.data;
  const [label, tone] = TICKET_LABEL[t.status] ?? [t.status, 'neutral'];
  return (
    <Screen>
      <Button title="‹ Back to support" variant="ghost" onPress={() => router.push('/support')} />
      <H1>{t.subject}</H1>
      <Row>
        <Badge label={label} tone={tone} />
        <P muted>{t.reference} · {t.categoryName}</P>
      </Row>
      <Card>
        <P>{t.description}</P>
      </Card>
      {t.updates.map((u) => (
        <Card key={u.id} style={u.authorKind === 'resident' ? { marginLeft: 32 } : { marginRight: 32 }}>
          <P muted>{u.authorKind === 'system' ? 'Update' : (u.authorName ?? (u.authorKind === 'resident' ? 'You' : 'Nestovin Support'))} · {new Date(u.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</P>
          <P>{u.body}</P>
        </Card>
      ))}
      {t.status !== 'CLOSED' ? (
        <>
          <Field label="Reply" value={body} onChangeText={setBody} multiline maxLength={4000} style={{ minHeight: 90, textAlignVertical: 'top' }} />
          {reply.error ? <Banner tone="error">{errorMessage(reply.error)}</Banner> : null}
          <Button title="Send reply" disabled={!body.trim()} busy={reply.isPending} onPress={() => reply.mutate()} />
        </>
      ) : (
        <Banner>This ticket is closed. Raise a new ticket if you still need help.</Banner>
      )}
    </Screen>
  );
}
