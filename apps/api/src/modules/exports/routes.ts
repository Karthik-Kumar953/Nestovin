import { Router, type Response } from 'express';
import { z } from 'zod';
import { uuidSchema, type AdminBooking } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { adminOf } from '../../http/context';
import { authorize, parseQuery } from '../../http/middleware';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import { withTx } from '../../db/database';
import { allPages, toCsv } from '../../lib/csv';
import { auditAdmin } from '../audit/audit';
import { LocationService } from '../locations/service';
import { ResidentAdminService } from '../residents/admin-service';
import { BookingAdminService } from '../bookings/admin-service';
import { WorkforceAdminService } from '../workforce/admin-service';
import { SupportService } from '../support/service';
import { AttendanceService } from '../attendance/service';
import { businessToday } from '../../lib/dates';

const rupees = (paise: number) => (paise / 100).toFixed(2);
const today = () => businessToday();

/**
 * CSV exports for every module with an `export` action. Each export uses the
 * same scoped list as the screen (so cluster scope and RLS apply), is capped at
 * 10,000 rows and is written to the audit log (exports can contain personal data).
 */
export function exportRoutes(deps: AppDeps): Router {
  const r = Router();
  const send = async (res: Response, actor: AdminActor, requestId: string, name: string, header: string[], rows: unknown[][]) => {
    await withTx(deps.db, toDbClaims(actor), (trx) =>
      auditAdmin(trx, actor, requestId, { action: `${name.replace(/-/g, '_')}.exported`, targetType: 'export', targetId: null, after: { rows: rows.length } }),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nestovin-${name}-${today()}.csv"`);
    res.send(toCsv(header, rows));
  };

  r.get('/exports/communities', authorize('locations', 'export'), async (req, res) => {
    const svc = new LocationService(deps.db);
    const items = await allPages((cursor) => svc.listCommunities(adminOf(req), { limit: 100, cursor }));
    await send(res, adminOf(req), req.requestId, 'communities', ['Name', 'Code', 'City', 'Cluster', 'Status', 'Address', 'Postal code'], items.map((c) => [c.name, c.code, c.cityName, c.clusterName, c.status, c.addressLine, c.postalCode]));
  });

  r.get('/exports/residents', authorize('residents', 'export'), async (req, res) => {
    const svc = new ResidentAdminService(deps.db, deps.storage);
    const items = await allPages((cursor) => svc.list(adminOf(req), { limit: 100, cursor }));
    await send(
      res, adminOf(req), req.requestId, 'residents',
      ['Name', 'Phone', 'Email', 'Account', 'Community', 'Tower', 'Flat', 'Role', 'Occupancy', 'Residence status', 'Joined'],
      items.map((x) => [x.fullName, x.phone, x.email, x.status, x.membership?.communityName, x.membership?.towerName, x.membership?.flatNumber, x.membership?.kind, x.membership?.occupancy, x.membership?.status, x.createdAt]),
    );
  });

  r.get('/exports/bookings', authorize('demand_payments', 'export'), async (req, res) => {
    const q = parseQuery(z.object({ communityId: uuidSchema.optional() }), req);
    const svc = new BookingAdminService(deps.db);
    const items = (await allPages((cursor) => svc.bookings(adminOf(req), { limit: 100, cursor, communityId: q.communityId }))) as AdminBooking[];
    await send(
      res, adminOf(req), req.requestId, 'bookings',
      ['Reference', 'Resident', 'Phone', 'Community', 'Tower', 'Flat', 'Mode', 'Plan', 'Option', 'Slot', 'Start date', 'Total (₹)', 'Paid (₹)', 'Outstanding (₹)', 'Booking status', 'Subscription status', 'Period start', 'Period end'],
      items.map((b) => [
        b.reference, b.resident.fullName, b.resident.phone, b.flat.communityName, b.flat.towerName, b.flat.flatNumber, b.mode, b.planName, b.selectionLabel,
        `${b.slot.label} ${b.slot.startTime}`, b.startDate, rupees(b.totalPaise), rupees(b.paidPaise), rupees(b.outstandingPaise), b.status,
        b.subscription?.status, b.subscription?.periodStart, b.subscription?.periodEnd,
      ]),
    );
  });

  r.get('/exports/payments', authorize('demand_payments', 'export'), async (req, res) => {
    const svc = new BookingAdminService(deps.db);
    const items = await allPages((cursor) => svc.payments(adminOf(req), { limit: 100, cursor }));
    await send(
      res, adminOf(req), req.requestId, 'payments',
      ['Created', 'Resident', 'Phone', 'Reference', 'Purpose', 'Amount (₹)', 'Order status', 'Razorpay order', 'Razorpay payment', 'Method', 'Verified at', 'Refunded (₹)'],
      items.map((p) => [
        p.createdAt, p.resident.fullName, p.resident.phone, p.reference, p.purpose, rupees(p.amountPaise), p.status, p.providerOrderId,
        p.transaction?.providerPaymentId, p.transaction?.method, p.transaction?.verifiedAt, p.transaction ? rupees(p.transaction.refundedPaise) : null,
      ]),
    );
  });

  r.get('/exports/employees', authorize('employees', 'export'), async (req, res) => {
    const svc = new WorkforceAdminService(deps.db, deps.authAdmin);
    const items = await allPages((cursor) => svc.listEmployees(adminOf(req), { limit: 100, cursor }));
    await send(
      res, adminOf(req), req.requestId, 'employees',
      ['Employee ID', 'Name', 'Phone', 'Home cluster', 'Status', 'Readiness', 'Services', 'Joined on', 'Login enabled'],
      items.map((e) => [e.employeeCode, e.fullName, e.phone, e.homeClusterName, e.status, e.readiness, e.services.map((s) => s.name).join('; '), e.joinedOn, e.loginEnabled ? 'Yes' : 'No']),
    );
  });

  r.get('/exports/attendance', authorize('attendance', 'export'), async (req, res) => {
    const q = parseQuery(z.object({ communityId: uuidSchema.optional(), from: z.iso.date(), to: z.iso.date() }), req);
    const svc = new AttendanceService(deps.db, deps.env.IP_HASH_SALT);
    const items = await svc.records(adminOf(req), { communityId: q.communityId, from: q.from, to: q.to, flaggedOnly: false });
    await send(
      res, adminOf(req), req.requestId, 'attendance',
      ['Date', 'Time', 'Service', 'Community', 'Tower', 'Flat', 'Worker ID', 'Worker', 'Check-in', 'Method', 'Distance (m)', 'Flags', 'Review', 'Completed at', 'No-show', 'Rating', 'Status'],
      items.map((x) => [
        x.scheduledDate, x.startsAt, x.serviceName, x.flat.communityName, x.flat.towerName, x.flat.flatNumber, x.worker?.employeeCode, x.worker?.fullName,
        x.checkIn?.at, x.checkIn?.method, x.checkIn?.distanceM, x.checkIn?.flags.join('; '), x.checkIn?.reviewStatus, x.completedAt, x.noShow?.kind, x.feedback?.rating, x.status,
      ]),
    );
  });

  r.get('/exports/tickets', authorize('support', 'export'), async (req, res) => {
    const svc = new SupportService(deps.db);
    const items = await allPages((cursor) => svc.adminList(adminOf(req), { limit: 100, cursor }));
    await send(
      res, adminOf(req), req.requestId, 'tickets',
      ['Reference', 'Subject', 'Category', 'Priority', 'Urgent', 'Status', 'Escalation', 'Due', 'Resident', 'Phone', 'Community', 'Tower', 'Flat', 'Owner', 'Raised'],
      items.map((t) => [
        t.reference, t.subject, t.categoryName, t.priority, t.urgent ? 'Yes' : 'No', t.status, t.escalationLevel, t.dueAt, t.resident.fullName, t.resident.phone,
        t.flat?.communityName, t.flat?.towerName, t.flat?.flatNumber, t.ownerName, t.createdAt,
      ]),
    );
  });

  return r;
}
