import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import type { Payslip } from '@nestovin/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { monthLabel, rupees } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { qk, usePayslips } from '../../lib/queries';
import { Divider, EmptyState, ErrorState, LoadingList, Muted, Pill, PressScale, Screen, Stagger, Text, c, shadow, useLargeText, type Tone } from '../../ui';

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
  // undefined = not touched yet: the latest month starts open.
  const [touched, setOpen] = useState<string | null | undefined>(undefined);
  const large = useLargeText();
  const items = [...(q.data ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  const open = touched === undefined ? (items[0]?.month ?? null) : touched;

  return (
    <Screen edges={['bottom', 'left', 'right']} onRefresh={() => qc.invalidateQueries({ queryKey: qk.payslips })}>
      {q.isPending ? (
        <LoadingList rows={3} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length ? (
        <>
          <Muted className="px-1">Approved payslips. Tap a month for the details.</Muted>
          {items.map((p, i) => {
            const isOpen = open === p.month;
            const s = PAID[p.paymentStatus];
            return (
              <Stagger key={p.month} index={i + 1}>
                <View className="overflow-hidden rounded-lg border border-line bg-surface" style={i === 0 ? shadow.float : shadow.card}>
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
                        <Text className="font-semibold text-charcoal">{monthLabel(p.month)}</Text>
                        {large ? <Text className="font-display text-headline text-charcoal">{rupees(p.netPaise)}</Text> : null}
                        <Pill label={s.label} tone={s.tone} />
                      </View>
                      {large ? null : (
                        <Text className="font-display text-headline text-charcoal" style={{ fontVariant: ['tabular-nums'] }}>
                          {rupees(p.netPaise)}
                        </Text>
                      )}
                      {isOpen ? <ChevronUp size={22} color={c.textSecondary} /> : <ChevronDown size={22} color={c.textSecondary} />}
                    </View>
                  </PressScale>
                  {isOpen ? (
                    <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
                      <View className="gap-2.5 border-t border-line bg-subtle/60 p-4">
                      <Line label="Payable days" value={`${p.payableDays} of ${p.daysInMonth}`} />
                      <Line label="Earnings" value={rupees(p.earningsPaise)} />
                      <Line label="Deductions" value={p.deductionsPaise ? `− ${rupees(p.deductionsPaise)}` : rupees(0)} />
                      <Divider />
                      <Line label="Net pay" value={rupees(p.netPaise)} strong />
                      <Line label="Paid so far" value={rupees(p.paidPaise)} />
                      {p.paidPaise < p.netPaise && p.paymentStatus !== 'NOT_PAYABLE' ? <Line label="Still to be paid" value={rupees(p.netPaise - p.paidPaise)} /> : null}
                      </View>
                    </Animated.View>
                  ) : null}
                </View>
              </Stagger>
            );
          })}
          <Muted className="px-1 text-sm">Questions about your pay? Talk to your supervisor or HR.</Muted>
        </>
      ) : (
        <EmptyState image="ill-payslip" title="No payslips yet" body="Your payslip appears here after the month’s payroll is approved." />
      )}
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-x-3">
      <Text className={`shrink ${strong ? 'font-semibold' : 'text-ink-secondary'}`}>{label}</Text>
      <Text className={strong ? 'font-heading text-lg text-charcoal' : 'font-semibold'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
