import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import type { Payslip } from '@nestovin/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { monthLabel, rupees } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { qk, usePayslips } from '../../lib/queries';
import { BrandImage, Divider, EmptyState, ErrorState, LoadingList, Muted, Pill, PressScale, Screen, Stagger, Text, c, shadow, type Tone } from '../../ui';

const PAID: Record<Payslip['paymentStatus'], { label: string; tone: Tone }> = {
  PAID: { label: 'Paid', tone: 'success' },
  PARTIALLY_PAID: { label: 'Partly paid', tone: 'info' },
  PENDING: { label: 'Not paid yet', tone: 'warning' },
  NOT_PAYABLE: { label: 'Nothing to pay', tone: 'neutral' },
};

/** Approved payslips only (ADM-14). Approval does not mean paid, so the paid status is shown separately. */
export default function Payslips() {
  const qc = useQueryClient();
  const q = usePayslips();
  const [open, setOpen] = useState<string | null>(null);
  const items = [...(q.data ?? [])].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <Screen edges={['bottom', 'left', 'right']} onRefresh={() => qc.invalidateQueries({ queryKey: qk.payslips })}>
      {q.isPending ? (
        <LoadingList rows={3} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length ? (
        <>
          <Stagger index={0}>
            <View className="overflow-hidden rounded-2xl bg-teal-deep p-5">
              <View className="absolute -bottom-6 -right-4 opacity-90">
                <BrandImage name="ill-payslip" variant="illustration" className="h-28 w-28" iconSize={30} />
              </View>
              <Text className="font-medium text-white/85">{monthLabel(items[0]!.month)}</Text>
              <Text className="font-display text-[34px] leading-[42px] text-white">{rupees(items[0]!.netPaise)}</Text>
              <Text className="text-white/85">Net pay</Text>
              <View className="mt-3 self-start">
                <Pill label={PAID[items[0]!.paymentStatus].label} tone={PAID[items[0]!.paymentStatus].tone} />
              </View>
            </View>
          </Stagger>
          {items.map((p, i) => {
            const isOpen = open === p.month;
            const s = PAID[p.paymentStatus];
            return (
              <Stagger key={p.month} index={i + 1}>
                <View className="overflow-hidden rounded-xl border border-line/70 bg-surface" style={shadow.card}>
                  <PressScale
                    onPress={() => {
                      haptic.select();
                      setOpen(isOpen ? null : p.month);
                    }}
                    accessibilityLabel={`${monthLabel(p.month)}, net ${rupees(p.netPaise)}, ${s.label}`}
                    accessibilityState={{ selected: isOpen }}
                    accessibilityHint={isOpen ? 'Hides the details' : 'Shows the details'}
                  >
                    <View className="min-h-[72px] flex-row items-center gap-3 p-4">
                      <View className="flex-1 gap-1">
                        <Text className="font-semibold">{monthLabel(p.month)}</Text>
                        <Pill label={s.label} tone={s.tone} />
                      </View>
                      <Text className="font-heading text-xl text-charcoal">{rupees(p.netPaise)}</Text>
                      {isOpen ? <ChevronUp size={22} color={c.textSecondary} /> : <ChevronDown size={22} color={c.textSecondary} />}
                    </View>
                  </PressScale>
                  {isOpen ? (
                    <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)} className="gap-2.5 border-t border-line/60 bg-mint-soft p-4">
                      <Line label="Payable days" value={`${p.payableDays} of ${p.daysInMonth}`} />
                      <Line label="Earnings" value={rupees(p.earningsPaise)} />
                      <Line label="Deductions" value={p.deductionsPaise ? `− ${rupees(p.deductionsPaise)}` : rupees(0)} />
                      <Divider />
                      <Line label="Net pay" value={rupees(p.netPaise)} strong />
                      <Line label="Paid so far" value={rupees(p.paidPaise)} />
                      {p.paidPaise < p.netPaise && p.paymentStatus !== 'NOT_PAYABLE' ? <Line label="Still to be paid" value={rupees(p.netPaise - p.paidPaise)} /> : null}
                    </Animated.View>
                  ) : null}
                </View>
              </Stagger>
            );
          })}
          <Muted className="text-sm">Questions about your pay? Talk to your supervisor or HR.</Muted>
        </>
      ) : (
        <EmptyState image="ill-payslip" title="No payslips yet" body="Your payslip appears here after the month’s payroll is approved." />
      )}
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={strong ? 'font-semibold' : 'text-ink-secondary'}>{label}</Text>
      <Text className={strong ? 'font-heading text-lg text-charcoal' : 'font-semibold'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
