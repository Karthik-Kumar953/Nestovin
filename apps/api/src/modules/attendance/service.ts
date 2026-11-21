import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import type { AdminFeedback, AttendanceRecord, CheckInInput, CheckInResult, Correction, ResidentVisit, VisitCode } from '@nestovin/contracts';
import { decodeCursor, toPage } from '../../lib/pagination';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { inScope, toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, conflict, notFound } from '../../lib/errors';
import { auditAdmin, auditResident } from '../audit/audit';
import { setting } from '../bookings/payments';
import { visibleCommunity } from '../locations/scope';
import { residentClaims, type ResidentActor } from '../residents/auth';
import { employeeClaims, type EmployeeActor } from '../workforce/employee-service';

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/** Great-circle distance in metres (supporting evidence only; GPS never proves a flat). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Evidence flags (ADR-014): flagged for review, never blocking. */
export function locationFlags(p: {
  point: { lat: number; lng: number; accuracyM?: number | undefined } | null;
  reference: { lat: number; lng: number } | null;
  radiusM: number;
  accuracyThresholdM: number | null;
}): { flags: string[]; distance: number | null } {
  if (!p.point) return { flags: ['NO_LOCATION'], distance: null };
  if (!p.reference) return { flags: ['NO_REFERENCE_PIN'], distance: null };
  const distance = distanceMetres(p.point, p.reference);
  const flags: string[] = [];
  if (distance > p.radiusM) flags.push('OUTSIDE_RADIUS');
  if (p.accuracyThresholdM !== null && p.point.accuracyM !== undefined && p.point.accuracyM > p.accuracyThresholdM) flags.push('LOW_ACCURACY');
  return { flags, distance };
}

/** Today's date in the community timezone (visits are scheduled in local dates). */
const localToday = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

/** EMP-06/07, RES-10/11, ADM-12/12A. */
export class AttendanceService {
  constructor(
    private readonly db: Database,
    private readonly pepper: string,
  ) {}

  private hash(kind: 'otp' | 'qr', challengeId: string, secret: string) {
    return createHmac('sha256', this.pepper).update(`${kind}:${challengeId}:${secret}`).digest('hex');
  }

  // ------------------------------------------------------------------ resident

  async residentVisits(actor: ResidentActor, from: string, to: string): Promise<ResidentVisit[]> {
    return withTx(this.db, residentClaims(actor), async (trx) => {
      const rows = await trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.services as s', 's.id', 'o.service_id')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .leftJoin('app.service_completions as sc', 'sc.occurrence_id', 'o.id')
        .leftJoin('app.no_show_records as ns', 'ns.occurrence_id', 'o.id')
        .leftJoin('app.visit_feedback as f', 'f.occurrence_id', 'o.id')
        .select(['o.id', 'o.scheduled_date', 'o.starts_at', 'o.status', 'c.timezone', 's.name as service_name', 'sc.completed_at', 'ns.kind as no_show', 'f.rating', 'f.comment'])
        .where('o.scheduled_date', '>=', from)
        .where('o.scheduled_date', '<=', to)
        .where('o.status', '!=', 'CANCELLED')
        .orderBy('o.scheduled_date', 'desc')
        .orderBy('o.starts_at')
        .limit(200)
        .execute();
      // Worker names via a narrow lookup (residents cannot read employee rows under RLS).
      const names = rows.length
        ? await sql<{ occurrence_id: string; name: string; checked_in: Date | null }>`select occurrence_id, name, checked_in from app.visit_worker_names(${rows.map((r) => r.id)}::uuid[])`.execute(trx)
        : { rows: [] };
      return rows.map((r) => {
        const w = names.rows.find((n) => n.occurrence_id === r.id);
        return {
          occurrenceId: r.id,
          scheduledDate: r.scheduled_date,
          startsAt: iso(r.starts_at),
          serviceName: r.service_name,
          status: r.status,
          workerName: w?.name ?? null,
          checkedInAt: w?.checked_in ? iso(w.checked_in) : null,
          completedAt: iso(r.completed_at),
          noShow: r.no_show,
          feedback: r.rating ? { rating: r.rating, comment: r.comment } : null,
          canShowCode: r.status === 'ASSIGNED' && r.scheduled_date === localToday(r.timezone),
        };
      });
    });
  }

  /** Resident shows this to the worker (ADR-014: OTP or rotating QR). A new code replaces the old one. */
  async issueCode(actor: ResidentActor, occurrenceId: string): Promise<VisitCode> {
    return withTx(this.db, residentClaims(actor), async (trx) => {
      const o = await trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .select(['o.id', 'o.status', 'o.flat_id', 'o.cluster_id', 'o.scheduled_date', 'c.timezone'])
        .where('o.id', '=', occurrenceId)
        .executeTakeFirst();
      if (!o) throw notFound('Visit');
      if (o.status !== 'ASSIGNED' || o.scheduled_date !== localToday(o.timezone)) throw businessRule('A code can be shown only on the day of an assigned visit');
      const ttl = await setting<number>(trx, 'attendance_code_ttl_minutes', 10);
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const nonce = randomBytes(18).toString('base64url');
      const id = randomUUID();
      const expires = new Date(Date.now() + ttl * 60_000);
      // Older unused codes for this visit stop working.
      await trx.updateTable('app.attendance_challenges').set({ expires_at: sql`now()` }).where('occurrence_id', '=', o.id).where('used_at', 'is', null).where('expires_at', '>', sql<Date>`now()`).execute();
      await trx
        .insertInto('app.attendance_challenges')
        .values({ id, occurrence_id: o.id, flat_id: o.flat_id, cluster_id: o.cluster_id, otp_hash: this.hash('otp', id, otp), qr_hash: this.hash('qr', id, nonce), issued_to: actor.id, expires_at: expires })
        .execute();
      return { occurrenceId: o.id, otp, qr: `NVQR1.${id}.${nonce}`, expiresAt: expires.toISOString() };
    });
  }

  async feedback(actor: ResidentActor, requestId: string, occurrenceId: string, input: { rating: number; comment?: string | undefined }) {
    return withTx(this.db, residentClaims(actor), async (trx) => {
      const o = await trx.selectFrom('app.service_occurrences').select(['id', 'status', 'flat_id', 'cluster_id']).where('id', '=', occurrenceId).executeTakeFirst();
      if (!o) throw notFound('Visit');
      if (o.status !== 'COMPLETED') throw businessRule('Feedback can be given after the visit is completed');
      const done = await trx.selectFrom('app.service_completions').select('employee_id').where('occurrence_id', '=', o.id).executeTakeFirst();
      try {
        await trx
          .insertInto('app.visit_feedback')
          .values({ occurrence_id: o.id, resident_id: actor.id, flat_id: o.flat_id, cluster_id: o.cluster_id, employee_id: done?.employee_id ?? null, rating: input.rating, comment: input.comment ?? null })
          .execute();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw conflict('Feedback for this visit was already given');
        throw err;
      }
      await auditResident(trx, actor.id, requestId, { action: 'visit.feedback', targetType: 'service_occurrence', targetId: o.id, after: { rating: input.rating } });
      return { received: true as const };
    });
  }

  // ------------------------------------------------------------------ employee

  private async assignedVisit(trx: Tx, actor: EmployeeActor, occurrenceId: string) {
    const o = await trx
      .selectFrom('app.service_occurrences as o')
      .innerJoin('app.occurrence_assignments as a', (j) => j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'))
      .innerJoin('app.communities as c', 'c.id', 'o.community_id')
      .select(['o.id', 'o.status', 'o.flat_id', 'o.cluster_id', 'o.scheduled_date', 'o.starts_at', 'o.ends_at', 'a.employee_id', 'c.timezone', 'c.location_lat', 'c.location_lng', 'c.geofence_radius_m'])
      .where('o.id', '=', occurrenceId)
      // Lock the ACTIVE assignment too (review M-17): a replacement that commits first makes this row
      // no longer ACTIVE, so a worker who was just replaced cannot check in.
      .forUpdate(['o', 'a'])
      .executeTakeFirst();
    if (!o || o.employee_id !== actor.id) throw notFound('Visit');
    return o;
  }

  /**
   * Check-in with the resident's OTP or QR. Rejected attempts are recorded as
   * evidence; five wrong codes void the code. Retries with the same
   * clientEventId return the first outcome.
   */
  async checkIn(actor: EmployeeActor, occurrenceId: string, input: CheckInInput): Promise<CheckInResult> {
    const outcome = await withTx(this.db, employeeClaims(actor), async (trx): Promise<CheckInResult> => {
      const prior = await trx.selectFrom('app.attendance_events').select(['result', 'reject_reason', 'flags']).where('employee_id', '=', actor.id).where('client_event_id', '=', input.clientEventId).executeTakeFirst();
      if (prior) return { result: prior.result, message: prior.result === 'VERIFIED' ? 'Checked in' : (prior.reject_reason ?? 'Rejected'), flags: prior.flags };

      const o = await this.assignedVisit(trx, actor, occurrenceId);
      if (o.status !== 'ASSIGNED') throw businessRule(o.status === 'IN_PROGRESS' ? 'You are already checked in' : 'This visit is not open for check-in');
      if (o.scheduled_date !== localToday(o.timezone)) throw businessRule('You can check in only on the day of the visit');

      const challenge = await trx
        .selectFrom('app.attendance_challenges')
        .selectAll()
        .where('occurrence_id', '=', o.id)
        .where('used_at', 'is', null)
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc')
        .forUpdate()
        .executeTakeFirst();

      const reject = async (reason: string) => {
        await trx
          .insertInto('app.attendance_events')
          .values({
            occurrence_id: o.id, employee_id: actor.id, cluster_id: o.cluster_id, kind: 'CHECK_IN', method: input.method, result: 'REJECTED', reject_reason: reason,
            lat: input.lat ?? null, lng: input.lng ?? null, accuracy_m: input.accuracyM ?? null, device_time: input.deviceTime ?? null, client_event_id: input.clientEventId,
          })
          .execute();
        return { result: 'REJECTED' as const, message: reason, flags: [] };
      };

      if (!challenge) return reject('No valid code. Ask the resident to open the visit code in their app.');
      let ok: boolean;
      if (input.method === 'OTP') {
        ok = /^\d{6}$/.test(input.code) && safeEq(this.hash('otp', challenge.id, input.code), challenge.otp_hash);
      } else {
        const [prefix, cid, nonce] = input.code.split('.');
        ok = prefix === 'NVQR1' && cid === challenge.id && Boolean(nonce) && safeEq(this.hash('qr', challenge.id, nonce!), challenge.qr_hash);
      }
      if (!ok) {
        const attempts = challenge.failed_attempts + 1;
        await trx
          .updateTable('app.attendance_challenges')
          .set({ failed_attempts: attempts, ...(attempts >= 5 ? { expires_at: sql`now()` } : {}) })
          .where('id', '=', challenge.id)
          .execute();
        return reject(attempts >= 5 ? 'Too many wrong codes. Ask the resident for a new code.' : 'The code is not correct.');
      }

      const accuracyThreshold = await setting<number | null>(trx, 'gps_accuracy_threshold_m', null);
      const { flags, distance } = locationFlags({
        point: input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM } : null,
        reference: o.location_lat !== null && o.location_lng !== null ? { lat: Number(o.location_lat), lng: Number(o.location_lng) } : null,
        radiusM: o.geofence_radius_m,
        accuracyThresholdM: accuracyThreshold,
      });
      await trx.updateTable('app.attendance_challenges').set({ used_at: sql`now()` }).where('id', '=', challenge.id).execute();
      await trx
        .insertInto('app.attendance_events')
        .values({
          occurrence_id: o.id, employee_id: actor.id, cluster_id: o.cluster_id, kind: 'CHECK_IN', method: input.method, result: 'VERIFIED', flags,
          lat: input.lat ?? null, lng: input.lng ?? null, accuracy_m: input.accuracyM ?? null, distance_m: distance, device_time: input.deviceTime ?? null,
          client_event_id: input.clientEventId, review_status: flags.length ? 'OPEN' : 'NONE',
        })
        .execute();
      await trx.updateTable('app.service_occurrences').set({ status: 'IN_PROGRESS' }).where('id', '=', o.id).execute();
      return { result: 'VERIFIED', message: flags.length ? 'Checked in. Your location will be reviewed.' : 'Checked in', flags };
    });
    if (outcome.result === 'REJECTED') throw businessRule(outcome.message);
    return outcome;
  }

  async complete(actor: EmployeeActor, occurrenceId: string, note?: string) {
    return withTx(this.db, employeeClaims(actor), async (trx) => {
      const o = await this.assignedVisit(trx, actor, occurrenceId);
      if (o.status !== 'IN_PROGRESS') throw businessRule('Check in before completing the visit');
      await trx.insertInto('app.service_completions').values({ occurrence_id: o.id, employee_id: actor.id, cluster_id: o.cluster_id, flat_id: o.flat_id, note: note ?? null }).execute();
      // Resident confirmation mechanism is OPEN (EMP-07): completion is recorded directly.
      await trx.updateTable('app.service_occurrences').set({ status: 'COMPLETED' }).where('id', '=', o.id).execute();
      return { status: 'COMPLETED' as const };
    });
  }

  /** Confirmed SOW rule: the worker waits 15 minutes (setting) before recording a resident no-show. */
  async residentAbsent(actor: EmployeeActor, occurrenceId: string, input: { note?: string | undefined; lat?: number | undefined; lng?: number | undefined }) {
    return withTx(this.db, employeeClaims(actor), async (trx) => {
      const o = await this.assignedVisit(trx, actor, occurrenceId);
      if (o.status !== 'ASSIGNED') throw businessRule('This visit is not waiting for check-in');
      const wait = await setting<number>(trx, 'resident_no_show_wait_minutes', 15);
      if (!o.starts_at || Date.now() < new Date(o.starts_at).getTime() + wait * 60_000) {
        throw businessRule(`Wait ${wait} minutes after the visit time before recording that the resident is not available`);
      }
      await trx
        .insertInto('app.no_show_records')
        .values({ occurrence_id: o.id, cluster_id: o.cluster_id, flat_id: o.flat_id, kind: 'RESIDENT_ABSENT', recorded_by_kind: 'employee', recorded_by: actor.id, employee_id: actor.id, note: input.note ?? null, lat: input.lat ?? null, lng: input.lng ?? null })
        .execute();
      await trx.updateTable('app.service_occurrences').set({ status: 'NO_SHOW' }).where('id', '=', o.id).execute();
      return { status: 'NO_SHOW' as const };
    });
  }

  async requestCorrection(actor: EmployeeActor, occurrenceId: string, input: { requestedChange: 'MARK_ATTENDED' | 'MARK_COMPLETED'; explanation: string }) {
    return withTx(this.db, employeeClaims(actor), async (trx) => {
      const o = await this.assignedVisit(trx, actor, occurrenceId);
      if (['COMPLETED', 'CANCELLED'].includes(o.status)) throw businessRule('This visit does not need a correction');
      const last = await trx.selectFrom('app.attendance_events').select('id').where('occurrence_id', '=', o.id).where('employee_id', '=', actor.id).orderBy('server_time', 'desc').executeTakeFirst();
      try {
        await trx
          .insertInto('app.attendance_corrections')
          .values({ occurrence_id: o.id, employee_id: actor.id, cluster_id: o.cluster_id, original_event_id: last?.id ?? null, requested_change: input.requestedChange, explanation: input.explanation })
          .execute();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw conflict('A correction for this visit is already waiting for review');
        throw err;
      }
      return { status: 'PENDING' as const };
    });
  }

  // ------------------------------------------------------------------ admin

  async records(actor: AdminActor, p: { communityId?: string | undefined; from: string; to: string; flaggedOnly: boolean }): Promise<AttendanceRecord[]> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      let q = trx
        .selectFrom('app.service_occurrences as o')
        .innerJoin('app.services as s', 's.id', 'o.service_id')
        .innerJoin('app.flats as f', 'f.id', 'o.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .leftJoin('app.occurrence_assignments as a', (j) => j.onRef('a.occurrence_id', '=', 'o.id').on('a.status', '=', 'ACTIVE'))
        .leftJoin('app.employees as e', 'e.id', 'a.employee_id')
        .leftJoin('app.attendance_events as ev', (j) => j.onRef('ev.occurrence_id', '=', 'o.id').on('ev.result', '=', 'VERIFIED'))
        .leftJoin('app.service_completions as sc', 'sc.occurrence_id', 'o.id')
        .leftJoin('app.no_show_records as ns', 'ns.occurrence_id', 'o.id')
        .leftJoin('app.visit_feedback as fb', 'fb.occurrence_id', 'o.id')
        .select([
          'o.id', 'o.scheduled_date', 'o.starts_at', 'o.status', 's.name as service_name', 'f.flat_number', 't.name as tower_name', 'c.name as community_name',
          'e.id as employee_id', 'e.employee_code', 'e.full_name', 'ev.id as event_id', 'ev.method', 'ev.server_time', 'ev.flags', 'ev.distance_m', 'ev.accuracy_m',
          'ev.review_status', 'ev.review_note', 'sc.completed_at', 'ns.kind as no_show_kind', 'ns.note as no_show_note', 'fb.rating', 'fb.comment',
        ])
        .select((eb) =>
          eb.selectFrom('app.attendance_events as r').select((e2) => e2.fn.countAll<string>().as('n')).whereRef('r.occurrence_id', '=', 'o.id').where('r.result', '=', 'REJECTED').as('rejected'),
        )
        .where('o.scheduled_date', '>=', p.from)
        .where('o.scheduled_date', '<=', p.to)
        .where('o.status', '!=', 'CANCELLED');
      if (p.communityId) q = q.where('o.community_id', '=', p.communityId);
      if (p.flaggedOnly) q = q.where((eb) => eb.or([eb('ev.review_status', '=', 'OPEN'), eb('o.status', 'in', ['NO_SHOW', 'EXCEPTION'])]));
      const rows = await q.orderBy('o.scheduled_date', 'desc').orderBy('o.starts_at').limit(500).execute();
      return rows.map((r) => ({
        occurrenceId: r.id,
        scheduledDate: r.scheduled_date,
        startsAt: iso(r.starts_at),
        status: r.status,
        serviceName: r.service_name,
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
        worker: r.employee_id ? { id: r.employee_id, employeeCode: r.employee_code!, fullName: r.full_name! } : null,
        checkIn: r.event_id
          ? {
              eventId: r.event_id, method: r.method!, at: iso(r.server_time)!, flags: r.flags ?? [], distanceM: r.distance_m, accuracyM: r.accuracy_m === null ? null : Number(r.accuracy_m),
              reviewStatus: r.review_status!, reviewNote: r.review_note,
            }
          : null,
        rejectedAttempts: Number(r.rejected ?? 0),
        completedAt: iso(r.completed_at),
        noShow: r.no_show_kind ? { kind: r.no_show_kind, note: r.no_show_note } : null,
        feedback: r.rating ? { rating: r.rating, comment: r.comment } : null,
      }));
    });
  }

  /**
   * ADM-12: resident feedback on completed visits, newest first, keyset paged.
   * RLS keeps it inside the admin's clusters; a community filter outside scope is NOT_FOUND.
   */
  async feedbackList(
    actor: AdminActor,
    p: {
      limit: number;
      cursor?: string | undefined;
      communityId?: string | undefined;
      employeeId?: string | undefined;
      minRating?: number | undefined;
      maxRating?: number | undefined;
      withComment?: boolean | undefined;
    },
  ): Promise<{ items: AdminFeedback[]; nextCursor: string | null }> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      if (p.communityId) await visibleCommunity(trx, actor, p.communityId);
      const cursor = decodeCursor(p.cursor);
      let q = trx
        .selectFrom('app.visit_feedback as fb')
        .innerJoin('app.service_occurrences as o', 'o.id', 'fb.occurrence_id')
        .innerJoin('app.services as s', 's.id', 'o.service_id')
        .innerJoin('app.flats as f', 'f.id', 'fb.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .leftJoin('app.resident_profiles as rp', 'rp.id', 'fb.resident_id')
        .leftJoin('app.employees as e', 'e.id', 'fb.employee_id')
        .select([
          'fb.occurrence_id', 'fb.rating', 'fb.comment', 'fb.created_at', 'fb.resident_id', 'rp.full_name as resident_name',
          'o.scheduled_date', 's.name as service_name', 'f.flat_number', 't.name as tower_name', 'c.id as community_id', 'c.name as community_name',
          'e.id as employee_id', 'e.full_name as employee_name', 'e.employee_code',
        ]);
      if (p.communityId) q = q.where('o.community_id', '=', p.communityId);
      if (p.employeeId) q = q.where('fb.employee_id', '=', p.employeeId);
      if (p.minRating !== undefined) q = q.where('fb.rating', '>=', p.minRating);
      if (p.maxRating !== undefined) q = q.where('fb.rating', '<=', p.maxRating);
      if (p.withComment) q = q.where('fb.comment', 'is not', null).where(sql`length(trim(fb.comment))`, '>', 0);
      if (cursor) {
        q = q.where((eb) =>
          eb.or([
            eb('fb.created_at', '<', new Date(cursor.v)),
            eb.and([eb('fb.created_at', '=', new Date(cursor.v)), eb('fb.occurrence_id', '<', cursor.id)]),
          ]),
        );
      }
      const rows = await q.orderBy('fb.created_at', 'desc').orderBy('fb.occurrence_id', 'desc').limit(p.limit + 1).execute();
      const page = toPage(rows, p.limit, (r) => ({ v: new Date(r.created_at).toISOString(), id: r.occurrence_id }));
      return {
        items: page.items.map((r) => ({
          occurrenceId: r.occurrence_id,
          rating: r.rating,
          comment: r.comment,
          createdAt: iso(r.created_at)!,
          visitDate: r.scheduled_date,
          serviceName: r.service_name,
          resident: { id: r.resident_id, fullName: r.resident_name },
          worker: r.employee_id ? { id: r.employee_id, fullName: r.employee_name!, employeeCode: r.employee_code! } : null,
          community: { id: r.community_id, name: r.community_name },
          flat: { flatNumber: r.flat_number, towerName: r.tower_name },
        })),
        nextCursor: page.nextCursor,
      };
    });
  }

  async reviewFlag(actor: AdminActor, requestId: string, eventId: string, input: { decision: 'ACCEPTED' | 'REJECTED'; note: string }) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const ev = await trx.selectFrom('app.attendance_events').select(['id', 'review_status', 'occurrence_id', 'cluster_id']).where('id', '=', eventId).forUpdate().executeTakeFirst();
      if (!ev || !inScope(actor, ev.cluster_id)) throw notFound('Attendance record');
      if (ev.review_status !== 'OPEN') throw businessRule('This check-in is not waiting for review');
      await trx.updateTable('app.attendance_events').set({ review_status: input.decision, reviewed_by: actor.id, review_note: input.note }).where('id', '=', eventId).execute();
      if (input.decision === 'REJECTED') {
        await trx.updateTable('app.service_occurrences').set({ status: 'EXCEPTION' }).where('id', '=', ev.occurrence_id).execute();
      }
      await auditAdmin(trx, actor, requestId, { action: `attendance.flag_${input.decision.toLowerCase()}`, targetType: 'attendance_event', targetId: eventId, reason: input.note });
      return { reviewStatus: input.decision };
    });
  }

  /** The worker did not come (recorded by Operations after the visit window). Deduction rules: OPEN. */
  async workerNoShow(actor: AdminActor, requestId: string, occurrenceId: string, note: string) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const o = await trx.selectFrom('app.service_occurrences').selectAll().where('id', '=', occurrenceId).forUpdate().executeTakeFirst();
      if (!o || !inScope(actor, o.cluster_id)) throw notFound('Visit');
      if (!['ASSIGNED', 'SCHEDULED'].includes(o.status)) throw businessRule('Only a visit without a check-in can be marked as a worker no-show');
      if (!o.ends_at || new Date(o.ends_at) > new Date()) throw businessRule('Wait until the visit time has passed');
      const a = await trx.selectFrom('app.occurrence_assignments').select('employee_id').where('occurrence_id', '=', o.id).where('status', '=', 'ACTIVE').executeTakeFirst();
      await trx
        .insertInto('app.no_show_records')
        .values({ occurrence_id: o.id, cluster_id: o.cluster_id, flat_id: o.flat_id, kind: 'WORKER_ABSENT', recorded_by_kind: 'admin', recorded_by: actor.id, employee_id: a?.employee_id ?? null, note })
        .execute();
      await trx.updateTable('app.service_occurrences').set({ status: 'NO_SHOW' }).where('id', '=', o.id).execute();
      await auditAdmin(trx, actor, requestId, { action: 'visit.worker_no_show', targetType: 'service_occurrence', targetId: o.id, reason: note });
      return { status: 'NO_SHOW' as const };
    });
  }

  async corrections(actor: AdminActor, status: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<Correction[]> {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const rows = await trx
        .selectFrom('app.attendance_corrections as k')
        .innerJoin('app.service_occurrences as o', 'o.id', 'k.occurrence_id')
        .innerJoin('app.flats as f', 'f.id', 'o.flat_id')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'o.community_id')
        .innerJoin('app.employees as e', 'e.id', 'k.employee_id')
        .leftJoin('app.attendance_events as ev', 'ev.id', 'k.original_event_id')
        .select([
          'k.id', 'k.occurrence_id', 'k.requested_change', 'k.explanation', 'k.status', 'k.review_note', 'k.created_at', 'o.scheduled_date', 'f.flat_number',
          't.name as tower_name', 'c.name as community_name', 'e.id as employee_id', 'e.employee_code', 'e.full_name', 'ev.result', 'ev.flags', 'ev.server_time',
        ])
        .where('k.status', '=', status)
        .orderBy('k.created_at')
        .limit(200)
        .execute();
      return rows.map((r) => ({
        id: r.id,
        occurrenceId: r.occurrence_id,
        scheduledDate: r.scheduled_date,
        flat: { flatNumber: r.flat_number, towerName: r.tower_name, communityName: r.community_name },
        worker: { id: r.employee_id, employeeCode: r.employee_code, fullName: r.full_name },
        requestedChange: r.requested_change,
        explanation: r.explanation,
        status: r.status,
        reviewNote: r.review_note,
        originalEvent: r.result ? { result: r.result, flags: r.flags ?? [], at: iso(r.server_time)! } : null,
        createdAt: iso(r.created_at)!,
      }));
    });
  }

  /** ADM-12A: the original evidence stays; the decision and resulting state are audited. */
  async decideCorrection(actor: AdminActor, requestId: string, id: string, input: { decision: 'APPROVED' | 'REJECTED'; note: string }) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      const k = await trx.selectFrom('app.attendance_corrections').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!k || !inScope(actor, k.cluster_id)) throw notFound('Correction');
      if (k.status !== 'PENDING') throw businessRule('This correction has already been decided');
      await trx.updateTable('app.attendance_corrections').set({ status: input.decision, reviewed_by: actor.id, reviewed_at: sql`now()`, review_note: input.note }).where('id', '=', id).execute();
      if (input.decision === 'APPROVED') {
        const o = await trx.selectFrom('app.service_occurrences').select(['id', 'status', 'cluster_id', 'flat_id']).where('id', '=', k.occurrence_id).forUpdate().executeTakeFirstOrThrow();
        if (k.requested_change === 'MARK_COMPLETED') {
          await trx
            .insertInto('app.service_completions')
            .values({ occurrence_id: o.id, employee_id: k.employee_id, cluster_id: o.cluster_id, flat_id: o.flat_id, note: `Recorded by correction: ${input.note}` })
            .onConflict((oc) => oc.column('occurrence_id').doNothing())
            .execute();
          await trx.updateTable('app.service_occurrences').set({ status: 'COMPLETED' }).where('id', '=', o.id).execute();
        } else {
          await trx.updateTable('app.service_occurrences').set({ status: 'IN_PROGRESS' }).where('id', '=', o.id).where('status', 'in', ['ASSIGNED', 'NO_SHOW', 'EXCEPTION']).execute();
        }
      }
      await auditAdmin(trx, actor, requestId, { action: `attendance.correction_${input.decision.toLowerCase()}`, targetType: 'attendance_correction', targetId: id, reason: input.note, after: { change: k.requested_change } });
      await trx
        .insertInto('app.notification_outbox')
        .values({ event_type: 'attendance.correction_decided', dedupe_key: `correction:${id}`, channel: 'PUSH', recipient: k.employee_id, payload: JSON.stringify({ correctionId: id, decision: input.decision }) })
        .execute();
      return { status: input.decision };
    });
  }

  async setGeofence(actor: AdminActor, requestId: string, communityId: string, radiusM: number) {
    return withTx(this.db, toDbClaims(actor), async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      await trx.updateTable('app.communities').set({ geofence_radius_m: radiusM }).where('id', '=', communityId).execute();
      await auditAdmin(trx, actor, requestId, { action: 'community.geofence_set', targetType: 'community', targetId: communityId, after: { radiusM } });
      return { radiusM };
    });
  }
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
