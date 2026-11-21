import { View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgeCheck, Building2, CalendarCheck2, CalendarOff, ChevronRight, Clock3, GraduationCap, LogOut, Phone, ReceiptIndianRupee, ShieldCheck, TimerReset } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { readinessOf } from '../../../components/readiness';
import { daysLabel, initials, longDay } from '../../../lib/format';
import { unregisterPush } from '../../../lib/push';
import { qk, useMe } from '../../../lib/queries';
import { supabase } from '../../../lib/supabase';
import { Avatar, Button, Card, ErrorState, ListRow, LoadingList, Muted, Pill, Rings, Screen, Section, ServiceIcon, Stagger, Text, c, confirmAction, gradients } from '../../../ui';

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
        <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, overflow: 'hidden', padding: 20 }}>
          <View className="absolute -right-24 -top-24" pointerEvents="none">
            <Rings opacity={0.12} />
          </View>
          <View className="flex-row items-center gap-4">
            <View className="rounded-full border-2 border-white/40">
              <Avatar initials={initials(m.fullName)} size={68} />
            </View>
            <View className="flex-1 gap-1">
              <Text className="font-heading text-2xl text-white">{m.fullName}</Text>
              <View className="flex-row items-center gap-2 self-start rounded-full bg-white/15 px-3 py-1">
                <BadgeCheck size={16} color={c.white} />
                <Text accessibilityLabel={`Employee ID ${m.employeeCode.split('').join(' ')}`} className="font-semibold tracking-wider text-white">
                  {m.employeeCode}
                </Text>
              </View>
            </View>
          </View>
          <View className="mt-4 flex-row items-center justify-between rounded-lg bg-white/10 px-4 py-3">
            <Text className="text-white/90">Status</Text>
            <Pill label={m.readiness === 'READY' ? 'Ready for work' : 'Not ready yet'} tone={m.readiness === 'READY' ? 'success' : 'warning'} />
          </View>
        </LinearGradient>
      </Stagger>

      <Stagger index={1}>
        <Card className="gap-0 py-2">
          <ListRow icon={Phone} title={m.phone} detail="Mobile number" />
          <ListRow icon={Building2} title={m.homeClusterName} detail="Home cluster" />
          {m.joinedOn ? <ListRow icon={CalendarCheck2} title={longDay(m.joinedOn)} detail="Joined Nestovin" /> : null}
        </Card>
      </Stagger>

      <Section title="Qualified for">
        {m.services.length ? (
          <View className="flex-row flex-wrap gap-2.5">
            {m.services.map((s) => (
              <View key={s} className="flex-row items-center gap-2.5 rounded-xl border border-line/70 bg-surface py-2 pl-2 pr-4">
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
          <Card className="gap-0 py-2">
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
          <Card className="gap-0 py-2">
            {m.availability.map((a, i) => (
              <ListRow key={i} icon={Clock3} title={`${a.startTime} – ${a.endTime}`} detail={daysLabel(a.daysOfWeek)} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="More">
        <Card className="gap-0 py-1">
          <ListRow icon={TimerReset} title="Extra work" detail="Offers to accept or decline" onPress={() => router.push('/offers')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={CalendarOff} title="Leave" detail="Requests and decisions" onPress={() => router.push('/leave')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={GraduationCap} title="Training" detail={m.training.length ? `${r.trainingDone} of ${r.trainingTotal} watched` : 'No videos yet'} onPress={() => router.push('/training')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
          <ListRow icon={ReceiptIndianRupee} title="Payslips" detail="Monthly pay" onPress={() => router.push('/payslips')} trailing={<ChevronRight size={20} color={c.textSecondary} />} />
        </Card>
      </Section>

      <Muted className="text-sm">To change your details, contact HR.</Muted>
      <View className="pt-2">
        <Button title="Sign out" variant="secondary" icon={LogOut} onPress={signOut} />
      </View>
      <Muted className="text-center text-label">Nestovin Worker {Constants.expoConfig?.version ?? ''}</Muted>
    </Screen>
  );
}
