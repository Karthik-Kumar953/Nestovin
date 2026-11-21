import { describe, expect, it } from 'vitest';
import { runTick } from '../../src/jobs/runner';
import { createLogger } from '../../src/lib/logger';

/* Review H-5: one failing job must not stop the others. */
describe('job runner', () => {
  it('runs every job even when an earlier one throws', async () => {
    let notified = false;
    const deps = {
      db: {} as never, // escalation will fail against this fake db: also isolated
      logger: createLogger('silent', false),
      payments: { maintenance: async () => { throw new Error('bad row'); } },
      allocation: { maintain: async () => ({ generated: 0, assigned: 0 }) },
      notifications: { processOutbox: async () => { notified = true; return { sent: 0, skipped: 0, failed: 0 }; } },
    };
    const outcome = await runTick(deps as unknown as Parameters<typeof runTick>[0]);
    expect(outcome.payments).toBe('failed');
    expect(outcome.visits).toBe('ok');
    expect(outcome.notifications).toBe('ok');
    expect(notified).toBe(true);
  });
});
