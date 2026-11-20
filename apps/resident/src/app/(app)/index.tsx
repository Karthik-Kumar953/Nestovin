import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ResidentMe, ResidentVisit } from '@nestovin/contracts';
import { api } from '../../lib/api';
import { Badge, Banner, Button, Card, ErrorText, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<ResidentMe>('/v1/resident/me') });
}

/** Home: residence status first, then the next visits and shortcuts. */
export default function Home() {
  const me = useMe();
  const unread = useQuery({ queryKey: ['inbox', 'count'], queryFn: () => api<{ unread: number }>('/v1/resident/notifications?unread=true') });
  const verified = me.data?.membership?.status === 'VERIFIED';
  const visits = useQuery({
    queryKey: ['visits', 'upcoming'],
    enabled: verified,
    queryFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      return api<{ items: ResidentVisit[] }>(`/v1/resident/visits?from=${today}&to=${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}`);
    },
  });

  if (me.isLoading) return <Screen><Loading /></Screen>;
  if (me.error || !me.data) return <Screen><ErrorText error={me.error} /><Button title="Try again" onPress={() => void me.refetch()} /></Screen>;
  const m = me.data.membership;
  const v = me.data.verification;
  const next = (visits.data?.items ?? []).filter((x) => ['ASSIGNED', 'SCHEDULED', 'IN_PROGRESS'].includes(x.status)).slice(0, 3);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>{me.data.fullName ? `Hello, ${me.data.fullName.split(' ')[0]}` : 'Hello'}</H1>
        <Button title={unread.data?.unread ? `Updates (${unread.data.unread})` : 'Updates'} variant="ghost" onPress={() => router.push('/notifications')} />
      </Row>

      {!m ? (
        <Card>
          <H2>Register your flat</H2>
          <P muted>Choose your community and flat, and upload one proof of residence. Our team verifies it before you can book.</P>
          {v?.decision === 'REJECTED' ? <Banner tone="error">Your last registration was not approved: {v.reason}</Banner> : null}
          <Button title="Register my flat" onPress={() => router.push('/register')} />
          <Button title="My community is not listed" variant="ghost" onPress={() => router.push('/vote')} />
        </Card>
      ) : m.status === 'PENDING' ? (
        <Card>
          <Row><H2>Verification in progress</H2><Badge label="Pending" tone="warning" /></Row>
          <P>{m.communityName} · {m.towerName} · {m.flatNumber}</P>
          {v && !v.documentUploaded ? (
            <>
              <Banner tone="warning">Your document did not finish uploading.</Banner>
              <Button title="Upload again" onPress={() => router.push('/register')} />
            </>
          ) : (
            <P muted>We are checking your document. You will get an update here.</P>
          )}
        </Card>
      ) : (
        <>
          <Card>
            <Row><H2>{m.communityName}</H2><Badge label={m.kind === 'PRIMARY' ? 'Primary Resident' : 'Family member'} tone="success" /></Row>
            <P muted>{m.towerName} · Flat {m.flatNumber}</P>
          </Card>
          <H2>Coming up</H2>
          {visits.isLoading ? <Loading /> : null}
          {next.length === 0 && !visits.isLoading ? (
            <Card>
              <P muted>No visits in the next 7 days.</P>
              <Button title="Book a service" onPress={() => router.push('/book')} />
            </Card>
          ) : (
            next.map((x) => (
              <Card key={x.occurrenceId} onPress={() => router.push('/visits')}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <P style={{ fontWeight: '600' }}>{x.serviceName}</P>
                  {x.canShowCode ? <Badge label="Today" tone="info" /> : null}
                </Row>
                <P muted>
                  {x.scheduledDate}
                  {x.startsAt ? ` · ${new Date(x.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  {x.workerName ? ` · ${x.workerName}` : ''}
                </P>
              </Card>
            ))
          )}
          <Button title="My bookings and payments" variant="secondary" onPress={() => router.push('/bookings')} />
        </>
      )}
    </Screen>
  );
}
