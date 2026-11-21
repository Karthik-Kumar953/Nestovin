import { useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Checkout } from '@nestovin/contracts';
import { haptics } from '@nestovin/ui-native';
import { api, errorMessage, idempotencyKey } from './api';
import { payWithRazorpay } from './payments';
import { refreshAfterPayment, useMe } from './queries';

/** Why the resident is paying; picks the copy on the result screen. */
export type PayPurpose = 'join' | 'book' | 'balance' | 'renew' | 'retry';

/**
 * One payment path for every screen: create (or reuse) the server order, open Razorpay,
 * verify with the API, refresh caches, then show the result screen. Never decides success locally.
 */
export function useCheckout() {
  const qc = useQueryClient();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (opts: { purpose: PayPurpose; create: () => Promise<{ checkout: Checkout; id: string; kind: 'booking' | 'request'; reference?: string }> }) => {
    setBusy(true);
    setError(null);
    try {
      const { checkout, id, kind, reference } = await opts.create();
      const outcome = await payWithRazorpay(checkout, { contact: me.data?.phone, email: me.data?.email ?? undefined });
      await refreshAfterPayment(qc);
      if (outcome.state === 'paid') haptics.success();
      else if (outcome.state === 'failed') haptics.error();
      router.push({
        pathname: '/payment-result',
        params: { state: outcome.state, message: outcome.message, purpose: opts.purpose, amount: String(checkout.amountPaise), id, kind, reference: reference ?? '' },
      });
    } catch (e) {
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, error, clearError: () => setError(null) };
}

/** POST helpers for paying an existing booking, request or renewal (reuses the server's idempotency). */
export const payExisting = async (path: string) => {
  const res = await api<Checkout | { checkout: Checkout }>(path, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } });
  return 'checkout' in res ? res.checkout : res;
};
