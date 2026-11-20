import { sql } from 'kysely';
import type { Database } from '../db/database';
import type { Logger } from '../lib/logger';
import type { PaymentService } from '../modules/bookings/payments';
import type { AllocationService } from '../modules/workforce/allocation';
import { escalateOverdue } from '../modules/support/escalation';

/**
 * Minimal in-process scheduler for periodic maintenance (payment reconciliation,
 * order expiry, cycle closing, balance expiry). An atomic lease row makes sure
 * only one API instance runs a tick at a time (session advisory locks are not
 * reliable through the transaction pooler). Replace with pg-boss (ADR-003) when
 * the notification worker lands; the job bodies stay the same.
 */
export async function claimLease(db: Database, seconds: number): Promise<boolean> {
  const { rows } = await sql<{ key: string }>`
    update app.app_settings
       set value = to_jsonb((now() + make_interval(secs => ${seconds}))::text), updated_at = now()
     where key = 'jobs_lease_until' and (value #>> '{}')::timestamptz < now()
    returning key
  `.execute(db);
  return rows.length === 1;
}

export function startJobs(deps: { db: Database; logger: Logger; payments: PaymentService; allocation: AllocationService }, intervalMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (!(await claimLease(deps.db, Math.floor(intervalMs / 1000) - 5))) return;
      const result = await deps.payments.maintenance();
      if (result.reconciled || result.expiredOrders || result.closedCycles || result.expiredBalances) {
        deps.logger.info(result, 'maintenance tick');
      }
      const visits = await deps.allocation.maintain();
      if (visits.generated || visits.assigned) deps.logger.info(visits, 'visits generated');
      const escalated = await escalateOverdue(deps.db, deps.logger);
      if (escalated) deps.logger.info({ escalated }, 'tickets escalated');
    } catch (err) {
      deps.logger.error({ err }, 'maintenance tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
