import { Router } from 'express';
import {
  addLineItemSchema,
  createPayrollRunSchema,
  recordSalaryPaymentSchema,
  returnRunSchema,
  reverseSalaryPaymentSchema,
  setCompensationSchema,
  uuidSchema,
} from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseParam, validateBody } from '../../http/middleware';
import { employeeOf } from '../workforce/employee-service';
import { PayrollService } from './service';

const id = (v: unknown) => parseParam(uuidSchema, v, 'id');

/** ADM-14 under /v1/admin. */
export function payrollAdminRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new PayrollService(deps.db);

  r.get('/finance/summary', authorize('finance_payroll', 'view'), async (req, res) => {
    res.json(await svc.financeSummary(adminOf(req)));
  });

  r.get('/employees/:id/compensation', authorize('finance_payroll', 'view'), async (req, res) => {
    res.json({ items: await svc.compensation(adminOf(req), id(req.params.id)) });
  });
  r.post('/employees/:id/compensation', authorize('finance_payroll', 'edit'), validateBody(setCompensationSchema), async (req, res) => {
    res.status(201).json({ items: await svc.setCompensation(adminOf(req), req.requestId, id(req.params.id), req.body) });
  });

  r.get('/payroll-runs', authorize('finance_payroll', 'view'), async (req, res) => {
    res.json({ items: await svc.runs(adminOf(req)) });
  });
  r.post('/payroll-runs', authorize('finance_payroll', 'create'), validateBody(createPayrollRunSchema), async (req, res) => {
    res.status(201).json(await svc.createRun(adminOf(req), req.requestId, req.body.month));
  });
  r.get('/payroll-runs/:id', authorize('finance_payroll', 'view'), async (req, res) => {
    res.json(await svc.detail(adminOf(req), id(req.params.id)));
  });
  r.get('/payroll-runs/:id/export', authorize('finance_payroll', 'export'), async (req, res) => {
    const csv = await svc.exportCsv(adminOf(req), req.requestId, id(req.params.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${req.params.id}.csv"`);
    res.send(csv);
  });
  r.post('/payroll-runs/:id/submit', authorize('finance_payroll', 'edit'), async (req, res) => {
    res.json(await svc.submit(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.post('/payroll-runs/:id/approve', authorize('finance_payroll', 'approve'), async (req, res) => {
    res.json(await svc.approve(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.post('/payroll-runs/:id/return', authorize('finance_payroll', 'approve'), validateBody(returnRunSchema), async (req, res) => {
    res.json(await svc.returnRun(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  r.post('/payroll-lines/:id/items', authorize('finance_payroll', 'edit'), validateBody(addLineItemSchema), async (req, res) => {
    res.status(201).json(await svc.addItem(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.delete('/payroll-items/:id', authorize('finance_payroll', 'edit'), async (req, res) => {
    res.json(await svc.removeItem(adminOf(req), req.requestId, id(req.params.id)));
  });
  r.post('/payroll-lines/:id/payments', authorize('finance_payroll', 'record_payment'), validateBody(recordSalaryPaymentSchema), async (req, res) => {
    res.status(201).json(await svc.recordPayment(adminOf(req), req.requestId, id(req.params.id), req.body));
  });
  r.post('/salary-payments/:id/reverse', authorize('finance_payroll', 'record_payment'), validateBody(reverseSalaryPaymentSchema), async (req, res) => {
    res.json(await svc.reversePayment(adminOf(req), req.requestId, id(req.params.id), req.body.reason));
  });
  return r;
}

/** Inside /v1/employee: approved payslips only. */
export function employeePayslipRoutes(deps: AppDeps): Router {
  const r = Router();
  const svc = new PayrollService(deps.db);
  r.get('/payslips', async (req, res) => {
    res.json({ items: await svc.payslips(employeeOf(req)) });
  });
  return r;
}
