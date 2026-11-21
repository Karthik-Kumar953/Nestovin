import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  Entrance,
  Illustration,
  StatusChip,
  SuccessCheck,
  Text,
  type ResultTone,
  type StatusTone,
} from '@nestovin/ui-native';
import { rupees } from '../../lib/format';
import type { PayPurpose } from '../../lib/checkout';
import type { PaymentOutcome } from '../../lib/payments';
import { img } from '../../assets/images';
import { KeyValue } from '../../components/common';

type Copy = {
  title: string;
  body: string;
  chip: string;
  chipTone: StatusTone;
  tone: ResultTone;
  mark: 'check' | 'cross' | 'clock' | 'alert';
  primary: string;
  amountLabel: string;
};

function copyFor(state: PaymentOutcome['state'], purpose: PayPurpose, message: string): Copy {
  switch (state) {
    case 'paid':
      if (purpose === 'join')
        return {
          title: 'You have joined the booking round',
          body: 'This is not a confirmed service yet. When the round closes we will publish your slot and the balance due date.',
          chip: 'Joined · awaiting slot',
          chipTone: 'info',
          tone: 'success',
          mark: 'check',
          primary: 'View booking',
          amountLabel: 'Paid now',
        };
      if (purpose === 'balance')
        return {
          title: 'Balance paid',
          body: 'Your booking is confirmed. We will show who is coming before your first visit.',
          chip: 'Confirmed',
          chipTone: 'success',
          tone: 'success',
          mark: 'check',
          primary: 'View booking',
          amountLabel: 'Paid',
        };
      if (purpose === 'renew')
        return {
          title: 'Plan renewed',
          body: 'Your next period is booked. Visits continue on the same slot.',
          chip: 'Renewed',
          chipTone: 'success',
          tone: 'success',
          mark: 'check',
          primary: 'View booking',
          amountLabel: 'Paid',
        };
      return {
        title: 'Your service is confirmed',
        body: 'We will show who is coming before your first visit.',
        chip: 'Confirmed',
        chipTone: 'success',
        tone: 'success',
        mark: 'check',
        primary: 'View booking',
        amountLabel: 'Paid in full',
      };
    case 'processing':
      return {
        title: 'Checking your payment',
        body: `${message} You can leave this screen; your booking updates when the bank confirms.`,
        chip: 'Processing',
        chipTone: 'neutral',
        tone: 'neutral',
        mark: 'clock',
        primary: 'View booking',
        amountLabel: 'Amount',
      };
    case 'review':
      return {
        title: 'Payment received, under review',
        body:
          message || 'Our team will contact you about your options. You will not be charged again.',
        chip: 'Under review',
        chipTone: 'warning',
        tone: 'warning',
        mark: 'alert',
        primary: 'View booking',
        amountLabel: 'Received',
      };
    case 'unavailable':
      return {
        title: 'Pay in the Nestovin app build',
        body: message,
        chip: 'Saved · not paid',
        chipTone: 'warning',
        tone: 'info',
        mark: 'alert',
        primary: 'View booking',
        amountLabel: 'Amount due',
      };
    case 'cancelled':
      return {
        title: 'Payment not completed',
        body: message,
        chip: 'Not paid',
        chipTone: 'warning',
        tone: 'warning',
        mark: 'alert',
        primary: 'Try again',
        amountLabel: 'Amount due',
      };
    default:
      return {
        title: 'Payment did not go through',
        body: message || 'No money was taken. Your booking is saved, so you can try again.',
        chip: 'Not paid',
        chipTone: 'error',
        tone: 'error',
        mark: 'cross',
        primary: 'Try again',
        amountLabel: 'Amount due',
      };
  }
}

/** The single result screen after every payment attempt. State comes from the API's verification, never assumed. */
export default function PaymentResult() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{
    state: PaymentOutcome['state'];
    message?: string;
    purpose?: PayPurpose;
    amount?: string;
    id?: string;
    kind?: 'booking' | 'request';
    reference?: string;
  }>();
  const c = copyFor(p.state ?? 'processing', p.purpose ?? 'book', p.message ?? '');
  const openBooking = () =>
    p.id
      ? router.replace({
          pathname: '/bookings/[id]',
          params: { id: p.id, kind: p.kind ?? 'booking' },
        })
      : router.replace('/bookings');
  const art =
    p.state === 'paid'
      ? img(p.purpose === 'join' ? 'ill-round-joined.png' : 'ill-payment-success.png')
      : null;

  return (
    <View
      className="flex-1 bg-white"
      style={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 px-gutter gap-6">
        <View
          className="items-center gap-4"
          accessibilityLiveRegion="polite"
          accessible
          accessibilityLabel={`${c.title}. ${c.body}`}
        >
          {art ? (
            <Illustration source={art} icon="checkmark" size={150} />
          ) : (
            <SuccessCheck size={120} tone={c.tone} mark={c.mark} />
          )}
          <Entrance delay={250} className="items-center gap-3">
            <Text variant="title" className="text-center">
              {c.title}
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              {c.body}
            </Text>
            <StatusChip label={c.chip} tone={c.chipTone} align="center" />
          </Entrance>
        </View>
        <Entrance delay={400}>
          <Card tone="subtle" className="gap-2.5">
            {p.amount ? (
              <KeyValue label={c.amountLabel} value={rupees(Number(p.amount))} strong />
            ) : null}
            {p.reference ? <KeyValue label="Reference" value={p.reference} /> : null}
          </Card>
        </Entrance>
      </View>
      <View className="px-gutter gap-2">
        <Button title={c.primary} onPress={openBooking} />
        <Button
          title={p.state === 'review' ? 'Contact support' : 'Back to Home'}
          variant="tertiary"
          onPress={() =>
            p.state === 'review'
              ? router.replace({
                  pathname: '/ticket/new',
                  params: { subject: `Payment ${p.reference ?? ''}`.trim() },
                })
              : router.replace('/')
          }
        />
      </View>
    </View>
  );
}
