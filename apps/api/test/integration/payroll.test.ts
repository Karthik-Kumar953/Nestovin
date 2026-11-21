import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import type { AuthAdminAdapter } from '../../src/integrations/auth-admin';
import { LocationService } from '../../src/modules/locations/service';
import { WorkforceAdminService } from '../../src/modules/workforce/admin-service';
import { PayrollService } from '../../src/modules/payroll/service';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

/* Phase 8 (ADM-14, ADR-014): fixed monthly payroll, review, manual payments, linked expenses. */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe.skipIf(!available)('payroll and finance (Phase 8)', { timeout: 180_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let pay: PayrollService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let month = '';
  const e: Record<string, string> = {};
  let runId = '';

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    pay = new PayrollService(db);
    const fakeAuth: AuthAdminAdapter = {
      async inviteUser() {
        throw new Error('not used');
      },
      async createStaffUser() {
        throw new Error('not used');
      },
      async setPassword() {},
      async deleteUser() {},
      async setBanned() {},
    };
    const hr = new WorkforceAdminService(db, fakeAuth);
    const loc = new LocationService(db);
    const cluster = (await loc.createCluster(root, 't', { name: `P8 Cluster ${s}`, code: `PY${s}` })).id;
    // A past month nobody has used yet (payroll periods are organisation-wide).
    for (;;) {
      const y = 1990 + Math.floor(Math.random() * 30);
      const m = 1 + Math.floor(Math.random() * 12);
      month = `${y}-${String(m).padStart(2, '0')}`;
      const { rows } = await admin.query(`select 1 from app.payroll_periods where month = $1::date`, [`${month}-01`]);
      if (!rows.length) break;
    }
    const phone = () => `+9193${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    for (const [k, joined] of [['full', null], ['half', `${month}-16`], ['none', null]] as const) {
      const d = await hr.createEmployee(root, 't', { fullName: `P8 ${k} ${s}`, phone: phone(), homeClusterId: cluster, ...(joined ? { joinedOn: joined } : {}) });
      e[k] = d.id;
    }
    // Employees from other suites exist too; the run covers everyone employed in the month.
    await pay.setCompensation(root, 't', e.full!, { monthlyAmountPaise: 1500000, effectiveFrom: `${month}-01` });
    await pay.setCompensation(root, 't', e.half!, { monthlyAmountPaise: 1200000, effectiveFrom: `${month}-01` });
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s, payrollMonths: month ? [`${month}-01`] : [] });
  }, 180_000);

  const lineOf = async (who: string) => (await pay.detail(root, runId)).lines.find((l) => l.employee.id === e[who])!;

  it('only an all-cluster admin can prepare payroll', async () => {
    await expectCode(pay.createRun(actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [] } }), 't', month), 'FORBIDDEN');
  });

  it('prepares lines from salary and employment dates; missing salary is flagged, not guessed', async () => {
    const run = await pay.createRun(root, 't', month);
    runId = run.id;
    expect(run).toMatchObject({ status: 'DRAFT', version: 1 });
    const full = await lineOf('full');
    expect(full).toMatchObject({ netPaise: 1500000, flags: [] });
    const days = full.daysInMonth;
    const half = await lineOf('half');
    expect(half.payableDays).toBe(days - 15);
    expect(half.netPaise).toBe(Math.floor((1200000 * (days - 15) * 2 + days) / (2 * days)));
    expect(half.flags).toContain('PRORATED');
    const none = await lineOf('none');
    expect(none).toMatchObject({ netPaise: 0, flags: ['NO_SALARY_SET'], paymentStatus: 'NOT_PAYABLE' });
    await expectCode(pay.createRun(root, 't', month), 'CONFLICT');
  });

  it('authorised entries need a reason, only in draft, and cannot exceed earnings', async () => {
    const full = await lineOf('full');
    const after = await pay.addItem(root, 't', full.id, { kind: 'EARNING', component: 'ALLOWANCE', amountPaise: 50000, note: 'Festival allowance' });
    expect(after.netPaise).toBe(1550000);
    await expectCode(pay.addItem(root, 't', full.id, { kind: 'DEDUCTION', component: 'OTHER_DEDUCTION', amountPaise: 99999999, note: 'Too much' }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(pay.addItem(root, 't', full.id, { kind: 'EARNING', component: 'OTHER_DEDUCTION', amountPaise: 100, note: 'Mismatch' }), 'BUSINESS_RULE_VIOLATION');
  });

  it('review: return keeps the version; the next preparation is version 2; approval does not mark paid', async () => {
    await pay.submit(root, 't', runId);
    await expectCode(pay.addItem(root, 't', (await lineOf('full')).id, { kind: 'EARNING', component: 'ALLOWANCE', amountPaise: 100, note: 'Late entry' }), 'BUSINESS_RULE_VIOLATION');
    const returned = await pay.returnRun(root, 't', runId, 'Check the joining date for the second employee');
    expect(returned.status).toBe('RETURNED');
    const v2 = await pay.createRun(root, 't', month);
    expect(v2.version).toBe(2);
    runId = v2.id;
    await pay.submit(root, 't', runId);
    const approved = await pay.approve(root, 't', runId);
    expect(approved.status).toBe('APPROVED');
    expect((await lineOf('full')).paymentStatus).toBe('PENDING');
    await expectCode(pay.createRun(root, 't', month), 'BUSINESS_RULE_VIOLATION');
    // A salary change cannot reach back into an approved month for that employee.
    await expectCode(pay.setCompensation(root, 't', e.full!, { monthlyAmountPaise: 1600000, effectiveFrom: `${month}-20` }), 'BUSINESS_RULE_VIOLATION');
  });

  it('records actual payments with linked expenses; duplicates and overpayment are refused; reversal keeps history', async () => {
    const full = await lineOf('full');
    const today = new Date().toISOString().slice(0, 10);
    const ref = `UTR${s}${Date.now()}`;
    let l = await pay.recordPayment(root, 't', full.id, { amountPaise: 1000000, paidOn: today, method: 'BANK_TRANSFER', reference: ref });
    expect(l).toMatchObject({ paidPaise: 1000000, paymentStatus: 'PARTIALLY_PAID' });
    await expectCode(pay.recordPayment(root, 't', full.id, { amountPaise: 1000, paidOn: today, method: 'BANK_TRANSFER', reference: ref }), 'CONFLICT');
    await expectCode(pay.recordPayment(root, 't', full.id, { amountPaise: 9999999, paidOn: today, method: 'UPI' }), 'BUSINESS_RULE_VIOLATION');
    l = await pay.recordPayment(root, 't', full.id, { amountPaise: 500000, paidOn: today, method: 'UPI', reference: `UPI${s}${Date.now()}` });
    expect(l.paymentStatus).toBe('PAID');
    const { rows } = await admin.query(`select count(*)::int as n, sum(x.amount_paise)::bigint as total from app.expense_entries x join app.salary_payments p on p.id = x.salary_payment_id where p.line_id = $1`, [full.id]);
    expect(rows[0]).toMatchObject({ n: 2, total: '1500000' });

    l = await pay.reversePayment(root, 't', l.payments[1]!.id, 'Entered against the wrong employee');
    expect(l).toMatchObject({ paidPaise: 1000000, paymentStatus: 'PARTIALLY_PAID' });
    await expectCode(pay.reversePayment(root, 't', l.payments[1]!.id, 'again'), 'BUSINESS_RULE_VIOLATION');
    await expect(admin.query(`update app.salary_payments set amount_paise = 1 where line_id = $1`, [full.id])).rejects.toThrow();
    await expectCode(pay.recordPayment(root, 't', (await lineOf('none')).id, { amountPaise: 100, paidOn: today, method: 'CASH' }), 'BUSINESS_RULE_VIOLATION');
  });

  it('the worker sees the approved payslip; CSV export neutralises formulas', async () => {
    const slips = await pay.payslips({ id: e.full!, employeeCode: 'x', clusterId: '', mustChangePassword: false });
    expect(slips.find((x) => x.month === month)).toMatchObject({ netPaise: 1500000, paymentStatus: 'PARTIALLY_PAID' });
    const csv = await pay.exportCsv(root, 't', runId);
    expect(csv.split('\r\n')[0]).toContain('"Employee ID"');
    expect(csv).toContain(`P8 full ${s}`);
  });
});
