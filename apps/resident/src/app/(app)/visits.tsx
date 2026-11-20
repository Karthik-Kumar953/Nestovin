import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, spacing } from '@nestovin/design-tokens';
import type { ResidentVisit, VisitCode } from '@nestovin/contracts';
import { api, errorMessage } from '../../lib/api';
import { Badge, Banner, Button, Card, Empty, Field, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

const STATUS: Record<string, [string, 'success' | 'warning' | 'error' | 'info' | 'neutral']> = {
  SCHEDULED: ['Scheduled', 'neutral'],
  ASSIGNED: ['Worker assigned', 'info'],
  IN_PROGRESS: ['In progress', 'info'],
  COMPLETED: ['Completed', 'success'],
  NO_SHOW: ['Missed', 'warning'],
  EXCEPTION: ['Under review', 'warning'],
};

/** RES-10/11 + EMP-06 resident side: visits, check-in code (OTP + QR), feedback. */
export default function Visits() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const visits = useQuery({
    queryKey: ['visits', 'all'],
    queryFn: () => api<{ items: ResidentVisit[] }>(`/v1/resident/visits?from=${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)}`),
  });
  const [code, setCode] = useState<VisitCode | null>(null);
  const [rating, setRating] = useState<{ id: string; stars: number; comment: string } | null>(null);
  const issue = useMutation({ mutationFn: (id: string) => api<VisitCode>(`/v1/resident/visits/${id}/code`, { method: 'POST' }), onSuccess: setCode });
  const feedback = useMutation({
    mutationFn: () => api(`/v1/resident/visits/${rating!.id}/feedback`, { method: 'POST', body: { rating: rating!.stars, comment: rating!.comment || undefined } }),
    onSuccess: async () => {
      setRating(null);
      await qc.invalidateQueries({ queryKey: ['visits'] });
    },
  });

  const items = visits.data?.items ?? [];
  const upcoming = items.filter((v) => v.scheduledDate >= today && !['COMPLETED', 'NO_SHOW'].includes(v.status)).reverse();
  const past = items.filter((v) => v.scheduledDate < today || ['COMPLETED', 'NO_SHOW'].includes(v.status));

  const row = (v: ResidentVisit) => {
    const [label, tone] = STATUS[v.status] ?? [v.status, 'neutral'];
    return (
      <Card key={v.occurrenceId}>
        <Row style={{ justifyContent: 'space-between' }}>
          <P style={{ fontWeight: '600' }}>{v.serviceName}</P>
          <Badge label={label} tone={tone} />
        </Row>
        <P muted>
          {new Date(`${v.scheduledDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          {v.startsAt ? ` · ${new Date(v.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
          {v.workerName ? ` · ${v.workerName}` : ''}
        </P>
        {v.checkedInAt ? <P muted>Checked in {new Date(v.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</P> : null}
        {v.canShowCode ? <Button title="Show check-in code" busy={issue.isPending && issue.variables === v.occurrenceId} onPress={() => issue.mutate(v.occurrenceId)} /> : null}
        {v.status === 'COMPLETED' && !v.feedback ? <Button title="Rate this visit" variant="secondary" onPress={() => setRating({ id: v.occurrenceId, stars: 5, comment: '' })} /> : null}
        {v.feedback ? <P muted>You rated {v.feedback.rating}/5</P> : null}
      </Card>
    );
  };

  return (
    <Screen>
      <H1>Visits</H1>
      {issue.error ? <Banner tone="error">{errorMessage(issue.error)}</Banner> : null}
      {visits.isLoading ? <Loading /> : null}
      <H2>Upcoming</H2>
      {upcoming.length ? upcoming.map(row) : <Empty title="No upcoming visits" body="Visits appear here once your booking has a worker." />}
      <H2>Recent</H2>
      {past.length ? past.map(row) : <Empty title="No past visits yet" />}

      <Modal visible={Boolean(code)} animationType="slide" onRequestClose={() => setCode(null)}>
        {code ? <CodeSheet code={code} onClose={() => setCode(null)} onRefresh={() => issue.mutate(code.occurrenceId)} /> : null}
      </Modal>

      <Modal visible={Boolean(rating)} animationType="slide" transparent onRequestClose={() => setRating(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
          {rating ? (
            <View style={{ backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm }}>
              <H2>How was the visit?</H2>
              <Row>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating({ ...rating, stars: n })} accessibilityLabel={`${n} stars`} style={{ padding: 6 }}>
                    <Text style={{ fontSize: 30, color: n <= rating.stars ? colors.warning : colors.border }}>★</Text>
                  </Pressable>
                ))}
              </Row>
              <Field label="Comment (optional)" value={rating.comment} onChangeText={(t) => setRating({ ...rating, comment: t })} multiline maxLength={1000} />
              {feedback.error ? <Banner tone="error">{errorMessage(feedback.error)}</Banner> : null}
              <Button title="Send" busy={feedback.isPending} onPress={() => feedback.mutate()} />
              <Button title="Cancel" variant="ghost" onPress={() => setRating(null)} />
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

/** Shown to the worker at the door: 6-digit code or QR (single use, short-lived). */
function CodeSheet({ code, onClose, onRefresh }: { code: VisitCode; onClose: () => void; onRefresh: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(code.expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((new Date(code.expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [code.expiresAt]);
  return (
    <Screen>
      <H1>Check-in code</H1>
      <P muted>Show this to your worker when they arrive. Do not share it on the phone.</P>
      <Card style={{ alignItems: 'center', gap: spacing.md }}>
        <Text style={{ fontSize: 44, letterSpacing: 8, fontWeight: '700', color: colors.charcoal }} accessibilityLabel={`Code ${code.otp.split('').join(' ')}`}>{code.otp}</Text>
        <QRCode value={code.qr} size={200} />
        <P muted>{left > 0 ? `Valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired'}</P>
      </Card>
      <Button title="Get a new code" variant="secondary" onPress={onRefresh} />
      <Button title="Done" onPress={onClose} />
    </Screen>
  );
}
