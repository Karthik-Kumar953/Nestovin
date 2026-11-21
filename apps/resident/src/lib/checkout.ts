import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Checkout } from '@nestovin/contracts';
import { haptics } from '@nestovin/ui-native';
import { api, errorMessage } from './api';
import { ActionKey, actionSignature, isFinalOutcome } from './idempotency';
import { completeTestPayment, payWithRazorpay } from './payments';
import { refreshAfterPayment, useMe } from './queries';

/** Why the resident is paying; picks the copy on the result screen. */
export type PayPurpose = 'join' | 'book' | 'balance' | 'renew' | 'retry';

type Created = { checkout: Checkout; id: string; kind: 'booking' | 'request'; reference?: string };

/**
 * One payment path for every screen: create (or reuse) the server order, open Razorpay,
 * verify with the API, refresh caches, then show the result screen. Never decides success locally.
 *
 * The Idempotency-Key is per action (path + body): a retry after a network error, a cancelled
 * checkout or a double tap sends the same key, so the API replays the first response instead of
 * creating a second booking or order. A changed selection, or a final outcome, starts a new key.
 */
export function useCheckout() {
  const qc = useQueryClient();
  const me = useMe();
  const keys = useRef(new ActionKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (opts: {
    purpose: PayPurpose;
    path: string;
    body?: unknown;
    create: (idempotencyKey: string) => Promise<Created>;
    /** TEMPORARY demo bypass: complete the order through the API's test route instead of Razorpay. */
    test?: boolean;
  }) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = keys.current.for(actionSignature(opts.path, opts.body));
    try {
      const { checkout, id, kind, reference } = await opts.create(key);
      const outcome = opts.test
        ? await completeTestPayment(checkout)
        : await payWithRazorpay(checkout, {
            contact: me.data?.phone,
            email: me.data?.email ?? undefined,
          });
      if (isFinalOutcome(outcome.state)) keys.current.settle();
      await refreshAfterPayment(qc);
      if (outcome.state === 'paid') haptics.success();
      else if (outcome.state === 'failed') haptics.error();
      router.push({
        pathname: '/payment-result',
        params: {
          state: outcome.state,
          message: outcome.message,
          purpose: opts.purpose,
          amount: String(checkout.amountPaise),
          id,
          kind,
          reference: reference ?? '',
          ...(opts.test ? { test: '1' } : {}),
        },
      });
    } catch (e) {
      // Keep the key: tapping again retries the same action and the API replays its first answer.
      haptics.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return { start, busy, error, clearError: () => setError(null) };
}

/** POST with the action's Idempotency-Key and no body (pay again, renew); returns the server's response. */
export const postWithKey = <T>(path: string, idempotencyKey: string, body?: unknown) =>
  api<T>(path, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body });

/** Pay an existing booking or request: the server reuses or creates the order. */
export const payExisting = async (path: string, idempotencyKey: string) => {
  const res = await postWithKey<Checkout | { checkout: Checkout }>(path, idempotencyKey);
  return 'checkout' in res ? res.checkout : res;
};
