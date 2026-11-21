import { View } from 'react-native';
import { router } from 'expo-router';
import { Building2, CalendarCheck2, CalendarOff, ChevronRight, Clock3, GraduationCap, LogOut, Phone, ReceiptIndianRupee, ShieldCheck, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { readinessOf } from '../../../components/readiness';
import { daysLabel, initials, longDay } from '../../../lib/format';
import { unregisterPush } from '../../../lib/push';
import { qk, useMe } from '../../../lib/queries';
import { supabase } from '../../../lib/supabase';
import { Avatar, Button, Card, Divider, ErrorState, ListRow, LoadingList, Muted, Pill, Screen, Section, ServiceIcon, Stagger, Text, c, confirmAction } from '../../../ui';

/** EMP-03: own profile (read-only in V1; HR edits), links and sign-out. */
export default function Profile() {
  const qc = useQueryClient();
  const me = useMe();
  const signOut = () =>
    confirmAction({
      title: 'Sign out?',
      message: 'You will need your Employee ID and password to sign in again.',
      confirmLabel: 'Sign out',
      onConfirm: () =>
        void (async () => {
          await unregisterPush();
          await supabase.auth.signOut();
          qc.clear();
          router.replace('/welcome');
        })(),
    });

  if (!me.data) {
    return <Screen title="Me">{me.error ? <ErrorState error={me.error} onRetry={() => void me.refetch()} /> : <LoadingList rows={3} />}</Screen>;
  }
  const m = me.data;
  const r = readinessOf(m);

  return (
    <Screen title="Me" onRefresh={() => qc.invalidateQueries({ queryKey: qk.me })}>
      <Stagger index={0}>
        <Card raised className="gap-4">
          <View className="flex-row items-center gap-4">
            <Avatar initials={initials(m.fullName)} size={64} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text accessibilityRole="header" className="font-display text-headline text-charcoal">
                {m.fullName}
              </Text>
              <Text accessibilityLabel={`Employee ID ${m.employeeCode.split('').join(' ')}`} className="font-semibold text-sm text-ink-secondary">
                {m.employeeCode}
              </Text>
            </View>
          </View>
          <Divider />
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-body-sm text-ink-secondary">Status</Text>
            <Pill label={m.readiness === 'READY' ? 'Ready for work' : 'Not ready yet'} tone={m.readiness === 'READY' ? 'success' : 'warning'} />
          </View>
        </Card>
      </Stagger>

      <Stagger index={1}>
        <Card pad="list">
          <ListRow icon={Phone} title={m.phone} detail="Mobile number" />
          <ListRow icon={Building2} title={m.homeClusterName} detail="Home cluster" />
          {m.joinedOn ? <ListRow icon={CalendarCheck2} title={longDay(m.joinedOn)} detail="Joined Nestovin" /> : null}
        </Card>
      </Stagger>

      <Section title="Qualified for">
        {m.services.length ? (
          <View className="flex-row flex-wrap gap-2.5">
            {m.services.map((s) => (
              <View key={s} className="min-h-[48px] flex-row items-center gap-2.5 rounded-md border border-line bg-surface py-1.5 pl-1.5 pr-4">
                <ServiceIcon serviceName={s} size="sm" />
                <Text className="font-semibold">{s}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Muted>HR records your services after your checks.</Muted>
        )}
      </Section>

      {m.verifications.length ? (
        <Section title="Checks">
          <Card pad="list">
            <ListRow
              icon={ShieldCheck}
              title={`${r.verified} of ${r.total} verified`}
              detail={m.verifications.map((v) => `${v.name}: ${v.status === 'VERIFIED' ? 'verified' : v.status === 'REJECTED' ? 'not accepted' : 'pending'}`).join(' · ')}
            />
          </Card>
        </Section>
      ) : null}

      {m.availability.length ? (
        <Section title="Working hours">
          <Card pad="list">
            {m.availability.map((a, i) => (
              <ListRow key={i} icon={Clock3} title={`${a.startTime} – ${a.endTime}`} detail={daysLabel(a.daysOfWeek)} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="More">
        <Card pad="list">
          <ListRow icon={TimerReset} title="Extra work" detail="Offers to accept or decline" onPress={() => router.push('/offers')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={CalendarOff} title="Leave" detail="Requests and decisions" onPress={() => router.push('/leave')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={GraduationCap} title="Training" detail={m.training.length ? `${r.trainingDone} of ${r.trainingTotal} watched` : 'No videos yet'} onPress={() => router.push('/training')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={ReceiptIndianRupee} title="Payslips" detail="Monthly pay" onPress={() => router.push('/payslips')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
        </Card>
      </Section>

      <Muted className="px-1 text-sm">To change your details, contact HR.</Muted>
      <View className="pt-4">
        <Button title="Sign out" variant="secondary" icon={LogOut} onPress={signOut} />
      </View>
      <Muted className="text-center text-label">Nestovin Worker {Constants.expoConfig?.version ?? ''}</Muted>
    </Screen>
  );
}
