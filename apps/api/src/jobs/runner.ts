import { sql } from 'kysely';
import type { Database } from '../db/database';
import type { Logger } from '../lib/logger';
import type { PaymentService } from '../modules/bookings/payments';
import type { AllocationService } from '../modules/workforce/allocation';
import { escalateOverdue } from '../modules/support/escalation';
import type { NotificationService } from '../modules/notifications/service';

/**
 * Minimal in-process scheduler for periodic maintenance (payment reconciliation,
 * order expiry, cycle closing, balance expiry, visit generation, escalation,
 * notification delivery). An atomic lease row makes sure only one API instance
 * runs a tick at a time (session advisory locks are not reliable through the
 * transaction pooler).
 *
 * Review H-5: the lease is long enough for a worst-case tick and is released
 * when the tick ends, and each job is isolated so one failing job never stops
 * the others. Rows the outbox worker delivers are additionally claimed per row.
 */
export const LEASE_SECONDS = 10 * 60;

export async function claimLease(db: Database, seconds = LEASE_SECONDS): Promise<boolean> {
  const { rows } = await sql<{ key: string }>`
    update app.app_settings
       set value = to_jsonb((now() + make_interval(secs => ${seconds}))::text), updated_at = now()
     where key = 'jobs_lease_until' and (value #>> '{}')::timestamptz < now()
    returning key
  `.execute(db);
  return rows.length === 1;
}

/** Ends this instance's lease early so the next tick (on any instance) can start. */
export async function releaseLease(db: Database): Promise<void> {
  await sql`update app.app_settings set value = to_jsonb(now()::text), updated_at = now() where key = 'jobs_lease_until'`.execute(db);
}

type JobDeps = { db: Database; logger: Logger; payments: PaymentService; allocation: AllocationService; notifications: NotificationService };

/** Runs every job once, each in isolation. Exported for tests. */
export async function runTick(deps: JobDeps): Promise<Record<string, 'ok' | 'failed'>> {
  const outcome: Record<string, 'ok' | 'failed'> = {};
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      outcome[name] = 'ok';
    } catch (err) {
      outcome[name] = 'failed';
      deps.logger.error({ err, job: name }, 'job failed; other jobs continue');
    }
  };
  await step('payments', async () => {
    const result = await deps.payments.maintenance();
    if (Object.values(result).some((n) => n > 0)) deps.logger.info(result, 'maintenance tick');
  });
  await step('visits', async () => {
    const visits = await deps.allocation.maintain();
    if (visits.generated || visits.assigned) deps.logger.info(visits, 'visits generated');
  });
  await step('escalation', async () => {
    const escalated = await escalateOverdue(deps.db, deps.logger);
    if (escalated) deps.logger.info({ escalated }, 'tickets escalated');
  });
  await step('notifications', async () => {
    const delivered = await deps.notifications.processOutbox();
    if (delivered.sent || delivered.failed) deps.logger.info(delivered, 'notifications processed');
  });
  return outcome;
}

export function startJobs(deps: JobDeps, intervalMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    let leased = false;
    try {
      leased = await claimLease(deps.db);
      if (!leased) return;
      await runTick(deps);
    } catch (err) {
      deps.logger.error({ err }, 'maintenance tick failed');
    } finally {
      if (leased) await releaseLease(deps.db).catch((err: unknown) => deps.logger.error({ err }, 'could not release job lease'));
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
