import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button, Card, Empty, H1, Loading, P, Row, Screen } from '../../components/ui';

interface Inbox { items: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[]; unread: number }

/** RES-13: in-app notification inbox (always delivered, with or without push). */
export default function Notifications() {
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api<Inbox>('/v1/resident/notifications') });
  const readAll = useMutation({
    mutationFn: () => api<Inbox>('/v1/resident/notifications/read-all', { method: 'POST' }),
    onSuccess: async (d) => {
      qc.setQueryData(['inbox'], d);
      await qc.invalidateQueries({ queryKey: ['inbox', 'count'] });
    },
  });
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>Updates</H1>
        {inbox.data?.unread ? <Button title="Mark all read" variant="ghost" busy={readAll.isPending} onPress={() => readAll.mutate()} /> : null}
      </Row>
      {inbox.isLoading ? <Loading /> : null}
      {inbox.data?.items.length === 0 ? <Empty title="No updates yet" /> : null}
      {(inbox.data?.items ?? []).map((n) => (
        <Card key={n.id} style={n.readAt ? undefined : { borderLeftWidth: 4, borderLeftColor: '#00796B' }}>
          <P style={{ fontWeight: n.readAt ? '400' : '600' }}>{n.title}</P>
          <P muted>{n.body}</P>
          <P muted>{new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</P>
        </Card>
      ))}
    </Screen>
  );
}
