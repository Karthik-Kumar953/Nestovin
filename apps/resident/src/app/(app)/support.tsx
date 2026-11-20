import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TicketDetail, TicketSummary } from '@nestovin/contracts';
import { api, errorMessage } from '../../lib/api';
import { Badge, Banner, Button, Card, Choice, Empty, Field, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

export const TICKET_LABEL: Record<string, [string, 'success' | 'warning' | 'error' | 'info' | 'neutral']> = {
  OPEN: ['Open', 'warning'],
  ASSIGNED: ['Being handled', 'info'],
  IN_PROGRESS: ['In progress', 'info'],
  WAITING: ['Waiting for you', 'warning'],
  RESOLVED: ['Resolved', 'success'],
  CLOSED: ['Closed', 'neutral'],
};

/** RES-12: raise and track support tickets for the household. */
export default function Support() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ items: TicketSummary[] }>('/v1/resident/tickets') });
  const categories = useQuery({ queryKey: ['ticket-categories'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/resident/ticket-categories') });
  const [creating, setCreating] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () => api<TicketDetail>('/v1/resident/tickets', { method: 'POST', body: { categoryId, subject, description } }),
    onSuccess: async (t) => {
      setCreating(false);
      setSubject('');
      setDescription('');
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      router.push(`/ticket/${t.id}`);
    },
  });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Support</H1>
        {!creating ? <Button title="New ticket" onPress={() => setCreating(true)} /> : null}
      </Row>
      {creating ? (
        <Card>
          <H2>What do you need help with?</H2>
          <Choice options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={setCategoryId} />
          <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={140} />
          <Field label="Details" value={description} onChangeText={setDescription} multiline maxLength={4000} style={{ minHeight: 120, textAlignVertical: 'top' }} />
          {create.error ? <Banner tone="error">{errorMessage(create.error)}</Banner> : null}
          <Button title="Send" disabled={!categoryId || subject.trim().length < 3 || description.trim().length < 5} busy={create.isPending} onPress={() => create.mutate()} />
          <Button title="Cancel" variant="ghost" onPress={() => setCreating(false)} />
        </Card>
      ) : null}
      {tickets.isLoading ? <Loading /> : null}
      {tickets.data?.items.length === 0 && !creating ? <Empty title="No tickets" body="Raise a ticket if something is not right. Your family members can see household tickets too." /> : null}
      {(tickets.data?.items ?? []).map((t) => {
        const [label, tone] = TICKET_LABEL[t.status] ?? [t.status, 'neutral'];
        return (
          <Card key={t.id} onPress={() => router.push(`/ticket/${t.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <P style={{ fontWeight: '600' }}>{t.subject}</P>
              <Badge label={label} tone={tone} />
            </Row>
            <P muted>{t.reference} · {t.categoryName} · {new Date(t.createdAt).toLocaleDateString('en-IN')}</P>
          </Card>
        );
      })}
    </Screen>
  );
}
