import type { Checkout, PaymentResult } from '@nestovin/contracts';
import { api } from './api';

type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayModule = { open: (options: Record<string, unknown>) => Promise<RazorpayResult> };

function razorpay(): RazorpayModule | null {
  try {
    // Native module: present in development/production builds, not in Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-razorpay') as { default?: RazorpayModule } & RazorpayModule;
    const rp = mod.default ?? mod;
    return typeof rp.open === 'function' ? rp : null;
  } catch {
    return null;
  }
}

export class PaymentCancelled extends Error {}

/**
 * Opens Razorpay Checkout for a server-created order, then asks the API to
 * verify the payment (signature + server-side fetch). The app never decides a
 * payment succeeded; if verification is delayed, reconciliation completes it.
 */
export async function payWithRazorpay(checkout: Checkout, prefill: { contact?: string }): Promise<PaymentResult> {
  const rp = razorpay();
  if (!rp) throw new Error('Payments need the Nestovin app build (not Expo Go). Your booking is saved; pay from Bookings later.');
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
    throw new PaymentCancelled('Payment was not completed. You can try again from Bookings.');
  }
  return api<PaymentResult>('/v1/resident/payments/verify', {
    method: 'POST',
    body: { paymentOrderId: checkout.paymentOrderId, providerPaymentId: result.razorpay_payment_id, signature: result.razorpay_signature },
  });
}
