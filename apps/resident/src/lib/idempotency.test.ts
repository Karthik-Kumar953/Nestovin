import { describe, expect, it } from 'vitest';
import { ActionKey, actionSignature, isFinalOutcome, newIdempotencyKey } from './idempotency';

const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/; // the API's accepted format (apps/api/src/http/idempotency.ts)

describe('idempotency keys for booking and payment POSTs', () => {
  it('generates keys in the format the API accepts', () => {
    for (let i = 0; i < 200; i++) expect(newIdempotencyKey()).toMatch(KEY_RE);
  });

  it('reuses one key for every retry of the same action', () => {
    const k = new ActionKey();
    const sig = actionSignature('/v1/resident/bookings', { slotId: 's1', startDate: '2026-11-23' });
    const first = k.for(sig);
    expect(k.for(sig)).toBe(first); // network failure, retry
    expect(
      k.for(actionSignature('/v1/resident/bookings', { slotId: 's1', startDate: '2026-11-23' })),
    ).toBe(first); // equal body, new object
  });

  it('makes a new key when the request changes, so a key never carries a different body', () => {
    const k = new ActionKey();
    const a = k.for(actionSignature('/v1/resident/bookings', { slotId: 's1' }));
    const b = k.for(actionSignature('/v1/resident/bookings', { slotId: 's2' }));
    expect(b).not.toBe(a);
  });

  it('makes a new key after the server settles the action', () => {
    const k = new ActionKey();
    const sig = actionSignature('/v1/resident/bookings/b1/pay');
    const a = k.for(sig);
    k.settle();
    expect(k.for(sig)).not.toBe(a);
  });

  it('settles only on final payment outcomes; cancel, Expo Go and errors keep the key for a retry', () => {
    expect(['paid', 'processing', 'review', 'failed'].every(isFinalOutcome)).toBe(true);
    expect(['cancelled', 'unavailable'].some(isFinalOutcome)).toBe(false);
  });
});
