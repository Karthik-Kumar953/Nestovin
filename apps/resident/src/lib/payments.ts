import type { Checkout, PaymentResult } from '@nestovin/contracts';
import { api, errorMessage } from './api';
import { demoMode } from './env';

type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type RazorpayModule = { open: (options: Record<string, unknown>) => Promise<RazorpayResult> };

function razorpay(): RazorpayModule | null {
  try {
    // Native module: present in development and production builds, not in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-razorpay') as { default?: RazorpayModule } & RazorpayModule;
    const rp = mod.default ?? mod;
    return typeof rp.open === 'function' ? rp : null;
  } catch {
    return null;
  }
}

/** True in a development or store build; false in Expo Go (no native Razorpay). */
export const paymentsAvailable = () => razorpay() !== null;

/** What the payment-result screen shows. The app never decides on its own that a payment succeeded. */
export type PaymentOutcome =
  | { state: 'paid'; message: string }
  | { state: 'processing'; message: string }
  | { state: 'review'; message: string }
  | { state: 'failed'; message: string }
  | { state: 'cancelled'; message: string }
  | { state: 'unavailable'; message: string };

/**
 * Opens Razorpay Checkout for a server-created order, then asks the API to verify the payment
 * (signature plus a server-side fetch). If verification is slow, reconciliation completes it later.
 */
export async function payWithRazorpay(
  checkout: Checkout,
  prefill: { contact?: string; email?: string },
): Promise<PaymentOutcome> {
  if (demoMode) return { state: 'paid', message: 'Demo payment.' };
  const rp = razorpay();
  if (!rp) {
    return {
      state: 'unavailable',
      message:
        'Payments open in the Nestovin app build, not in Expo Go. Your booking is saved; pay from Bookings in the app build.',
    };
  }
  let result: RazorpayResult;
  try {
    result = await rp.open({
      key: checkout.keyId,
      order_id: checkout.providerOrderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: 'Nestovin',
      description: checkout.description,
      prefill,
      theme: { color: '#00796B' },
    });
  } catch {
    return {
      state: 'cancelled',
      message: 'No money was taken. Your booking is saved, so you can try again.',
    };
  }
  try {
    const v = await api<PaymentResult>('/v1/resident/payments/verify', {
      method: 'POST',
      body: {
        paymentOrderId: checkout.paymentOrderId,
        providerPaymentId: result.razorpay_payment_id,
        signature: result.razorpay_signature,
      },
    });
    return toOutcome(v);
  } catch (e) {
    // Paid at Razorpay but verification did not reach us: reconciliation will confirm it.
    return {
      state: 'processing',
      message: `We are confirming your payment with the bank. ${errorMessage(e)}`,
    };
  }
}

/**
 * TEMPORARY (client demos): completes a server-created order without Razorpay. The API only accepts
 * this while its test-payments switch is on (GET /v1/resident/test-mode); the server still decides the outcome.
 */
export async function completeTestPayment(checkout: Checkout): Promise<PaymentOutcome> {
  try {
    const v = await api<PaymentResult>('/v1/resident/payments/test-complete', {
      method: 'POST',
      body: { paymentOrderId: checkout.paymentOrderId },
    });
    return toOutcome(v);
  } catch (e) {
    return {
      state: 'cancelled',
      message: `The test booking did not go through. ${errorMessage(e)}`,
    };
  }
}

function toOutcome(v: PaymentResult): PaymentOutcome {
  switch (v.orderStatus) {
    case 'PAID':
      return { state: 'paid', message: v.message };
    case 'REVIEW_REQUIRED':
      return { state: 'review', message: v.message };
    case 'FAILED':
    case 'EXPIRED':
      return { state: 'failed', message: v.message };
    default:
      return { state: 'processing', message: v.message };
  }
}
