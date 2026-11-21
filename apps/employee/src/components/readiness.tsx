import { View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, Circle, CircleX, GraduationCap, Hourglass, ShieldCheck, Sparkles } from 'lucide-react-native';
import type { Me } from '../lib/types';
import { BrandImage, Button, Card, Muted, Pill, ProgressRing, Stagger, Text, c } from '../ui';

/** Readiness numbers from /me: required checks, qualifications, training. */
export function readinessOf(me: Me) {
  const checks = me.verifications;
  const verified = checks.filter((v) => v.status === 'VERIFIED').length;
  const rejected = checks.filter((v) => v.status === 'REJECTED').length;
  const trainingDone = me.training.filter((t) => t.completedAt).length;
  const parts = [checks.length ? verified / checks.length : 1, me.services.length ? 1 : 0, me.training.length ? trainingDone / me.training.length : 1];
  return { verified, rejected, total: checks.length, trainingDone, trainingTotal: me.training.length, progress: parts.reduce((a, b) => a + b, 0) / parts.length };
}

function Step({ done, failed, title, detail }: { done: boolean; failed?: boolean; title: string; detail: string }) {
  const Icon = failed ? CircleX : done ? CheckCircle2 : Circle;
  return (
    <View className="flex-row items-start gap-3 py-2" accessibilityLabel={`${title}: ${detail}`}>
      <Icon size={24} color={failed ? c.errorText : done ? c.greenAction : c.textMuted} strokeWidth={2} />
      <View className="flex-1">
        <Text className="font-semibold">{title}</Text>
        <Muted>{detail}</Muted>
      </View>
    </View>
  );
}

/**
 * "Not ready yet" (ADR-016): HR marks a worker READY when every required check
 * is verified and at least one service qualification is recorded. The app
 * only shows progress; it never decides readiness.
 */
export function NotReadyCard({ me }: { me: Me }) {
  const r = readinessOf(me);
  return (
    <View className="gap-4">
      <Stagger index={0}>
        <Card className="overflow-hidden p-0">
          <View className="flex-row items-center gap-4 bg-warning-surface/60 p-5">
            <ProgressRing value={r.progress} label={`${Math.round(r.progress * 100)}%`} color={c.tealAction} />
            <View className="flex-1 gap-1">
              <Pill label="Not ready yet" tone="warning" icon={Hourglass} />
              <Text className="font-heading text-xl text-charcoal">Almost ready to start work</Text>
              <Muted>HR will assign visits once these are done.</Muted>
            </View>
          </View>
          <View className="px-5 pb-3 pt-2">
            <Step
              done={r.total > 0 && r.verified === r.total}
              failed={r.rejected > 0}
              title="Document checks"
              detail={r.total ? `${r.verified} of ${r.total} verified${r.rejected ? ` · ${r.rejected} need attention, HR will contact you` : ''}` : 'HR will add your checks'}
            />
            <Step done={me.services.length > 0} title="Work you are qualified for" detail={me.services.length ? me.services.join(', ') : 'HR records this after your checks'} />
            <Step done={r.trainingTotal > 0 && r.trainingDone === r.trainingTotal} title="Training videos" detail={r.trainingTotal ? `${r.trainingDone} of ${r.trainingTotal} watched` : 'No videos assigned yet'} />
          </View>
        </Card>
      </Stagger>
      {me.verifications.length ? (
        <Stagger index={1}>
          <Card className="gap-1">
            <View className="mb-1 flex-row items-center gap-2">
              <ShieldCheck size={20} color={c.tealDeep} />
              <Text className="font-heading text-lg text-charcoal">Your checks</Text>
            </View>
            {me.verifications.map((v, i) => (
              <View key={v.name} className={`min-h-[44px] flex-row items-center justify-between py-2 ${i < me.verifications.length - 1 ? 'border-b border-line/60' : ''}`}>
                <Text className="flex-1">{v.name}</Text>
                <Text className={`font-semibold text-sm ${v.status === 'VERIFIED' ? 'text-success-text' : v.status === 'REJECTED' ? 'text-error-text' : 'text-warning-text'}`}>
                  {v.status === 'VERIFIED' ? 'Verified' : v.status === 'REJECTED' ? 'Not accepted' : 'Pending'}
                </Text>
              </View>
            ))}
          </Card>
        </Stagger>
      ) : null}
      {r.trainingTotal > r.trainingDone ? (
        <Stagger index={2}>
          <View className="flex-row items-center gap-4 overflow-hidden rounded-xl bg-teal-deep p-5">
            <BrandImage name="ill-training" variant="illustration" className="h-16 w-16" iconSize={22} />
            <View className="flex-1 gap-3">
              <Text className="font-heading text-lg text-white">Watch your training videos</Text>
              <Button title="Open training" variant="light" size="md" icon={GraduationCap} onPress={() => router.push('/training')} />
            </View>
          </View>
        </Stagger>
      ) : (
        <View className="flex-row items-center gap-2 px-1">
          <Sparkles size={16} color={c.tealDeep} />
          <Muted>You will get an update when HR marks you ready.</Muted>
        </View>
      )}
    </View>
  );
}
