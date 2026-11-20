import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Household } from '@nestovin/contracts';
import { api, errorMessage } from '../../lib/api';
import { toE164 } from '../../lib/auth';
import { Badge, Banner, Button, Card, Choice, Field, H1, H2, Loading, P, Row, Screen } from '../../components/ui';

interface ChangeRequest { id: string; kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT'; requested: { occupancy?: string; moveOutDate?: string }; status: string; reviewNote: string | null }

/** RES-04/05/14: family members (Primary only) and reviewed residence changes. */
export default function HouseholdScreen() {
  const qc = useQueryClient();
  const household = useQuery({ queryKey: ['household'], queryFn: () => api<Household>('/v1/resident/household') });
  const changes = useQuery({ queryKey: ['change-requests'], queryFn: () => api<{ items: ChangeRequest[] }>('/v1/resident/change-requests') });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [kind, setKind] = useState<'OCCUPANCY_CHANGE' | 'MOVE_OUT' | null>(null);
  const [occupancy, setOccupancy] = useState<'OWNER' | 'TENANT' | null>(null);
  const [moveOut, setMoveOut] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['household'] });

  const invite = useMutation({
    mutationFn: () => api<Household>('/v1/resident/household/family-requests', { method: 'POST', body: { fullName: name, phone: toE164(phone) ?? phone, relationship } }),
    onSuccess: (h) => { qc.setQueryData(['household'], h); setName(''); setPhone(''); setRelationship(''); },
  });
  const cancelReq = useMutation({ mutationFn: (id: string) => api<Household>(`/v1/resident/household/family-requests/${id}`, { method: 'DELETE' }), onSuccess: (h) => qc.setQueryData(['household'], h) });
  const remove = useMutation({ mutationFn: (id: string) => api<Household>(`/v1/resident/household/members/${id}`, { method: 'DELETE' }), onSuccess: (h) => qc.setQueryData(['household'], h) });
  const change = useMutation({
    mutationFn: () => api('/v1/resident/change-requests', { method: 'POST', body: kind === 'OCCUPANCY_CHANGE' ? { kind, occupancy } : { kind, moveOutDate: moveOut } }),
    onSuccess: async () => { setKind(null); await qc.invalidateQueries({ queryKey: ['change-requests'] }); },
  });

  if (household.isLoading) return <Screen><Loading /></Screen>;
  const h = household.data;
  return (
    <Screen>
      <H1>Household</H1>
      {household.error ? <Banner tone="error">{errorMessage(household.error)}</Banner> : null}
      {h ? (
        <>
          <Card>
            <H2>Members</H2>
            {h.members.map((m) => (
              <Row key={m.membershipId} style={{ justifyContent: 'space-between' }}>
                <P>{m.fullName ?? m.phone}</P>
                <Row>
                  <Badge label={m.kind === 'PRIMARY' ? 'Primary' : 'Family'} tone={m.kind === 'PRIMARY' ? 'success' : 'info'} />
                  {h.isPrimary && m.kind === 'FAMILY' ? <Button title="Remove" variant="ghost" busy={remove.isPending} onPress={() => remove.mutate(m.membershipId)} /> : null}
                </Row>
              </Row>
            ))}
          </Card>
          {h.isPrimary ? (
            <Card>
              <H2>Add a family member</H2>
              <P muted>They sign in with their own phone number. Our team verifies them in person before access starts.</P>
              <Field label="Full name" value={name} onChangeText={setName} maxLength={120} />
              <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Field label="Relationship" value={relationship} onChangeText={setRelationship} placeholder="e.g. Spouse, Parent" maxLength={40} />
              {invite.error ? <Banner tone="error">{errorMessage(invite.error)}</Banner> : null}
              <Button title="Send request" disabled={name.trim().length < 2 || !toE164(phone) || relationship.trim().length < 2} busy={invite.isPending} onPress={() => invite.mutate()} />
              {h.requests.map((r) => (
                <Row key={r.id} style={{ justifyContent: 'space-between' }}>
                  <P>{r.fullName} · {r.relationship}</P>
                  <Row>
                    <Badge label={r.status.toLowerCase()} tone={r.status === 'APPROVED' ? 'success' : r.status === 'PENDING' ? 'warning' : 'neutral'} />
                    {r.status === 'PENDING' ? <Button title="Cancel" variant="ghost" onPress={() => cancelReq.mutate(r.id)} /> : null}
                  </Row>
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <H2>Change your residence details</H2>
        <P muted>Changes to verified details are reviewed by our team.</P>
        <Choice options={[...(h?.isPrimary ? [{ value: 'OCCUPANCY_CHANGE' as const, label: 'Change owner / tenant' }] : []), { value: 'MOVE_OUT' as const, label: 'I am moving out' }]} value={kind} onChange={setKind} />
        {kind === 'OCCUPANCY_CHANGE' ? <Choice options={[{ value: 'OWNER', label: 'Owner' }, { value: 'TENANT', label: 'Tenant' }]} value={occupancy} onChange={setOccupancy} /> : null}
        {kind === 'MOVE_OUT' ? <Field label="Move-out date (YYYY-MM-DD)" value={moveOut} onChangeText={setMoveOut} placeholder="2026-12-31" /> : null}
        {change.error ? <Banner tone="error">{errorMessage(change.error)}</Banner> : null}
        {kind ? <Button title="Send request" disabled={kind === 'OCCUPANCY_CHANGE' ? !occupancy : !/^\d{4}-\d{2}-\d{2}$/.test(moveOut)} busy={change.isPending} onPress={() => change.mutate()} /> : null}
        {(changes.data?.items ?? []).map((c) => (
          <P key={c.id} muted>
            {c.kind === 'MOVE_OUT' ? `Move out on ${c.requested.moveOutDate}` : `Change to ${String(c.requested.occupancy).toLowerCase()}`} · {c.status.toLowerCase()}{c.reviewNote ? ` · ${c.reviewNote}` : ''}
          </P>
        ))}
      </Card>
      <Button title="Refresh" variant="ghost" onPress={() => void refresh()} />
    </Screen>
  );
}
