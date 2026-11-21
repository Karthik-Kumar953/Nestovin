/**
 * Idempotency keys for money and booking POSTs (ADR-004, review H-4). The API requires one on
 * create booking, join round, pay and renew. It replays the first response for the same key and
 * body, and rejects the same key with a different body (422).
 *
 * One key per user action: the same key is reused for every retry of that action (network
 * failure, a cancelled checkout, a double tap), and a new key is made only when the request
 * changes (another slot, date or preferred times) or the server reached a final outcome.
 * No React Native imports here, so it is unit-testable in Node.
 */

/** 8–100 characters from letters, digits, '-' and '_' (the API's format). */
export const newIdempotencyKey = () => `rn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`;

/** Identifies one action by what it sends: the same path and body are the same action. */
export const actionSignature = (path: string, body?: unknown) => `${path}|${body === undefined ? '' : JSON.stringify(body)}`;

export class ActionKey {
  private signature: string | null = null;
  private key: string | null = null;

  constructor(private readonly make: () => string = newIdempotencyKey) {}

  /** The key for this action, creating one only if the action differs from the last attempt. */
  for(signature: string): string {
    if (!this.key || signature !== this.signature) {
      this.signature = signature;
      this.key = this.make();
    }
    return this.key;
  }

  /** The server reached a final outcome for this action; the next attempt is a new action. */
  settle(): void {
    this.signature = null;
    this.key = null;
  }
}

/** Payment outcomes after which the same order must not be reused (anything else keeps the key for a retry). */
export const isFinalOutcome = (state: string) => state === 'paid' || state === 'processing' || state === 'review' || state === 'failed';
