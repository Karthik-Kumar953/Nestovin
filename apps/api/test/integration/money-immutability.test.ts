import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { adminPool, databaseAvailable } from '../helpers/db';

/*
 * Review finding M-2 (BUG-QA-016): "append-only" and "immutable once approved"
 * must be enforced by the database for money records (ADR-004, ADR-006).
 * Read-only: inspects grants and triggers through the catalogue; writes nothing.
 */

const available = await databaseAvailable();

describe.skipIf(!available)('money records are immutable for the API role (M-2)', () => {
  let admin: pg.Pool;
  beforeAll(() => {
    admin = adminPool();
  });
  afterAll(async () => {
    await admin?.end();
  });

  const colPriv = async (table: string, column: string, priv: 'UPDATE' | 'INSERT') =>
    (await admin.query(`select has_column_privilege('app_api', $1, $2, $3) ok`, [`app.${table}`, column, priv])).rows[0].ok as boolean;
  const tablePriv = async (table: string, priv: 'UPDATE' | 'DELETE') =>
    (await admin.query(`select has_table_privilege('app_api', $1, $2) ok`, [`app.${table}`, priv])).rows[0].ok as boolean;
  const triggersOn = async (table: string) =>
    (
      await admin.query<{ tgname: string; events: string }>(
        `select t.tgname,
                concat_ws(',', case when t.tgtype & 8 > 0 then 'DELETE' end, case when t.tgtype & 16 > 0 then 'UPDATE' end) events
           from pg_trigger t where t.tgrelid = $1::regclass and not t.tgisinternal`,
        [`app.${table}`],
      )
    ).rows;

  it('baseline that already holds: payment_transactions cannot be deleted', async () => {
    const t = await triggersOn('payment_transactions');
    expect(t.some((x) => x.events.includes('DELETE'))).toBe(true);
  });

  it.fails('payment_transactions: the API may change only status, never amount, payment id or order (BUG-QA-016)', async () => {
    for (const col of ['amount_paise', 'provider_payment_id', 'order_id', 'currency']) {
      expect(await colPriv('payment_transactions', col, 'UPDATE'), `app_api can UPDATE payment_transactions.${col}`).toBe(false);
    }
  });

  it.fails('provider_events: the raw payload and signature verdict are not writable (BUG-QA-016)', async () => {
    for (const col of ['payload', 'signature_valid', 'event_id']) {
      expect(await colPriv('provider_events', col, 'UPDATE'), `app_api can UPDATE provider_events.${col}`).toBe(false);
    }
  });

  it.fails('approved payroll lines are frozen: no DELETE grant and a trigger guards UPDATE (BUG-QA-016)', async () => {
    expect(await tablePriv('payroll_lines', 'DELETE'), 'app_api can DELETE payroll_lines').toBe(false);
    expect(await tablePriv('payroll_line_items', 'DELETE'), 'app_api can DELETE payroll_line_items').toBe(false);
    const lineTriggers = await triggersOn('payroll_lines');
    const itemTriggers = await triggersOn('payroll_line_items');
    expect(lineTriggers.some((x) => x.events.includes('UPDATE')), 'no UPDATE trigger on payroll_lines').toBe(true);
    expect(itemTriggers.some((x) => x.events.includes('UPDATE')), 'no UPDATE trigger on payroll_line_items').toBe(true);
  });
});
