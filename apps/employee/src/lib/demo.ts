import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { CheckInInput, CheckInResult, LeaveRequest, Payslip, VisitTask } from '@nestovin/contracts';
import { ApiError } from './api';
import { addDays, isoDay } from './format';
import type { Inbox, Me, OvertimeOffer, Visit, VisitDetail } from './types';

/*
 * DEV-ONLY demo data for design review and screenshots (EXPO_PUBLIC_DEMO=1 in
 * a development build; gated on __DEV__ in env.ts, so a release build never
 * serves it). Names, flats, tasks and amounts are illustrative, not real data.
 *
 * On web, add ?demo=<state> to the URL:
 *   (none)     ready worker with today's visits, an open offer, pending leave
 *   live       a visit is in progress (Complete visit is the main action)
 *   done       every visit today is finished
 *   empty      no visits today
 *   notready   readiness, checks and training progress instead of visits
 *   signedout  no session, to review welcome, apply and sign-in
 *
 * Check-in codes: 000000 is rejected, 111111 is verified but flagged for
 * review, any other 6 digits (or a scanned NVQR1.* QR) is verified.
 * Resident not available always answers with the API's waiting-time rule.
 */

type DemoState = 'ready' | 'live' | 'done' | 'empty' | 'notready' | 'signedout';
function readState(): DemoState {
  if (Platform.OS !== 'web') return 'ready';
  const m = ((globalThis as { location?: { search?: string } }).location?.search ?? '').match(/demo=(\w+)/);
  const s = m?.[1] as DemoState | undefined;
  return s && ['live', 'done', 'empty', 'notready', 'signedout'].includes(s) ? s : 'ready';
}
/** Read once at startup: the entry redirect drops the query string. */
const STATE = readState();
export const demoState = (): DemoState => STATE;

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const day = (d: number) => addDays(isoDay(), d);
const at = (d: number, h: number, m = 0) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};
const end = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const ME_ID = uuid();
const community = 'Green Meadows';
const flat = (n: string, t: string) => ({ flatNumber: n, towerName: t, communityName: community });
const task = (name: string, frequency: VisitTask['frequency'] = 'PER_VISIT', timesPerPeriod = 1): VisitTask => ({ name, frequency, timesPerPeriod });
const MAID_TASKS = [task('Sweeping and mopping'), task('Dishes'), task('Dusting'), task('Bathroom cleaning', 'WEEKLY', 2), task('Laundry folding', 'WEEKLY')];
const COOK_TASKS = [task('Breakfast and lunch'), task('Kitchen counter cleaning'), task('Utensil washing'), task('Refrigerator wipe-down', 'WEEKLY')];

type Row = VisitDetail;
function visit(d: number, service: 'Maid' | 'Cook', h: number, m: number, minutes: number, f: ReturnType<typeof flat>, status: string, source = 'STANDING'): Row {
  const startsAt = at(d, h, m);
  return {
    occurrenceId: uuid(),
    scheduledDate: day(d),
    startsAt,
    endsAt: end(startsAt, minutes),
    serviceName: service,
    flat: f,
    status,
    source,
    durationMinutes: minutes,
    isAddon: false,
    tasks: service === 'Maid' ? MAID_TASKS : COOK_TASKS,
    checkIn: status === 'COMPLETED' || status === 'IN_PROGRESS' ? { at: end(startsAt, 3), method: 'OTP', result: 'VERIFIED', flags: [] } : null,
    completedAt: status === 'COMPLETED' ? end(startsAt, minutes - 4) : null,
    noShow: null,
    correction: null,
  };
}

/** Mutable store, so a review can walk check-in → complete, accept an offer, request leave. */
function seed() {
  const s = demoState();
  const today: Row[] =
    s === 'empty' || s === 'notready'
      ? []
      : [
          visit(0, 'Maid', 7, 0, 60, flat('A-1204', 'Tower A'), 'COMPLETED'),
          visit(0, 'Cook', 9, 0, 90, flat('B-0703', 'Tower B'), s === 'live' ? 'IN_PROGRESS' : s === 'done' ? 'COMPLETED' : 'ASSIGNED'),
          visit(0, 'Maid', 12, 0, 60, flat('C-0402', 'Tower C'), s === 'done' ? 'COMPLETED' : 'ASSIGNED', 'REPLACEMENT'),
        ];
  const rest: Row[] =
    s === 'notready'
      ? []
      : [
          visit(1, 'Maid', 7, 0, 60, flat('A-1204', 'Tower A'), 'ASSIGNED'),
          visit(1, 'Cook', 9, 0, 90, flat('B-0703', 'Tower B'), 'ASSIGNED'),
          visit(2, 'Maid', 7, 0, 60, flat('A-1204', 'Tower A'), 'ASSIGNED'),
          visit(3, 'Cook', 17, 30, 90, flat('D-1101', 'Tower D'), 'ASSIGNED', 'OVERTIME'),
          visit(-1, 'Maid', 7, 0, 60, flat('A-1204', 'Tower A'), 'COMPLETED'),
          { ...visit(-2, 'Cook', 9, 0, 90, flat('B-0703', 'Tower B'), 'NO_SHOW'), noShow: 'RESIDENT_ABSENT' as const },
        ];
  const offerVisit = (d: number, h: number, f: ReturnType<typeof flat>, service: 'Maid' | 'Cook') => ({
    occurrenceId: uuid(),
    scheduledDate: day(d),
    startsAt: at(d, h),
    endsAt: end(at(d, h), 90),
    serviceName: service,
    flat: f,
  });
  const mine = (response: 'PENDING' | 'ACCEPTED' | 'REJECTED') => [{ employeeId: ME_ID, employeeCode: 'NV-000123', fullName: 'Meena Kumari', response, respondedAt: response === 'PENDING' ? null : at(-3, 9) }];
  return {
    visits: [...today, ...rest],
    offers:
      s === 'notready'
        ? []
        : ([
            { id: uuid(), status: 'OPEN', note: 'Guests for dinner', createdAt: at(0, 6), visit: offerVisit(1, 18, flat('D-1101', 'Tower D'), 'Cook'), responses: mine('PENDING'), confirmedEmployeeId: null },
            { id: uuid(), status: 'FILLED', note: null, createdAt: at(-5, 6), visit: offerVisit(3, 17, flat('D-1101', 'Tower D'), 'Cook'), responses: mine('ACCEPTED'), confirmedEmployeeId: ME_ID },
            { id: uuid(), status: 'FILLED', note: null, createdAt: at(-8, 6), visit: offerVisit(-6, 16, flat('A-0301', 'Tower A'), 'Maid'), responses: mine('ACCEPTED'), confirmedEmployeeId: uuid() },
          ] satisfies OvertimeOffer[]),
    leave: [
      { id: uuid(), employee: { id: ME_ID, employeeCode: 'NV-000123', fullName: '' }, startDate: day(10), endDate: day(12), reason: 'Family function in my village', status: 'PENDING', reviewNote: null, affectedAssignments: 0, createdAt: at(-1, 10), version: 1 },
      { id: uuid(), employee: { id: ME_ID, employeeCode: 'NV-000123', fullName: '' }, startDate: day(-20), endDate: day(-20), reason: null, status: 'APPROVED', reviewNote: 'Approved. Your visits that day were covered.', affectedAssignments: 0, createdAt: at(-25, 10), version: 2 },
    ] as LeaveRequest[],
    inbox: {
      unread: 2,
      items: [
        { id: uuid(), eventType: 'overtime.offered', title: 'Additional work offered', body: 'You have a new overtime offer. Accept or decline in the app.', data: {}, readAt: null, createdAt: at(0, 6) },
        { id: uuid(), eventType: 'leave.decided', title: 'Leave request updated', body: 'Your leave request was approved.', data: {}, readAt: null, createdAt: at(-1, 15) },
        { id: uuid(), eventType: 'payslip.available', title: 'Payslip available', body: 'Your payslip for the month is available.', data: {}, readAt: at(-3, 9), createdAt: at(-3, 9) },
        { id: uuid(), eventType: 'assignment.standing', title: 'New regular work', body: 'You have a new regular assignment. Check your schedule.', data: {}, readAt: at(-9, 9), createdAt: at(-9, 9) },
      ],
    } as Inbox,
    training: [
      { itemId: uuid(), title: 'Welcome to Nestovin', url: 'https://example.com/training/welcome', completedAt: at(-3, 10) },
      { itemId: uuid(), title: 'Kitchen hygiene basics', url: 'https://example.com/training/hygiene', completedAt: s === 'notready' ? null : at(-2, 10) },
      { itemId: uuid(), title: 'Respectful conduct in homes', url: 'https://example.com/training/conduct', completedAt: null },
    ],
  };
}

let store: ReturnType<typeof seed> | null = null;
const db = () => (store ??= seed());

function me(): Me {
  const notReady = demoState() === 'notready';
  return {
    id: ME_ID,
    employeeCode: 'NV-000123',
    fullName: 'Meena Kumari',
    phone: '+919800000123',
    readiness: notReady ? 'NOT_READY' : 'READY',
    mustChangePassword: false,
    services: notReady ? [] : ['Maid', 'Cook'],
    verifications: [
      { name: 'Aadhaar', status: 'VERIFIED' },
      { name: 'Police verification', status: notReady ? 'PENDING' : 'VERIFIED' },
      { name: 'Address proof', status: notReady ? 'REJECTED' : 'VERIFIED' },
    ],
    availability: [{ daysOfWeek: 63, startTime: '07:00', endTime: '15:00' }],
    training: db().training,
    homeClusterName: 'Whitefield cluster',
    joinedOn: day(-120),
  };
}

const PAYSLIPS: Payslip[] = [
  { month: '2026-10', payableDays: 30, daysInMonth: 31, earningsPaise: 1_800_000, deductionsPaise: 58_000, netPaise: 1_742_000, paidPaise: 1_742_000, paymentStatus: 'PAID' },
  { month: '2026-09', payableDays: 30, daysInMonth: 30, earningsPaise: 1_800_000, deductionsPaise: 0, netPaise: 1_800_000, paidPaise: 900_000, paymentStatus: 'PARTIALLY_PAID' },
  { month: '2026-08', payableDays: 26, daysInMonth: 31, earningsPaise: 1_509_677, deductionsPaise: 0, netPaise: 1_509_677, paidPaise: 1_509_677, paymentStatus: 'PAID' },
];

const rule = (message: string) => new ApiError(422, 'BUSINESS_RULE_VIOLATION', message);
const toItem = ({ checkIn: _c, completedAt: _d, noShow: _n, correction: _r, ...v }: Row): Visit => v;
const find = (id: string) => {
  const v = db().visits.find((x) => x.occurrenceId === id);
  if (!v) throw new ApiError(404, 'NOT_FOUND', 'Visit not found');
  return v;
};

function checkIn(id: string, input: CheckInInput): CheckInResult {
  const v = find(id);
  if (v.status === 'IN_PROGRESS') throw rule('You are already checked in');
  if (v.status !== 'ASSIGNED') throw rule('This visit is not open for check-in');
  if (v.scheduledDate !== isoDay()) throw rule('You can check in only on the day of the visit');
  const valid = input.method === 'QR' ? input.code.startsWith('NVQR1.') : /^\d{6}$/.test(input.code) && input.code !== '000000';
  if (!valid) throw rule('The code is not correct.');
  const flags = input.code === '111111' ? ['OUTSIDE_RADIUS'] : [];
  Object.assign(v, { status: 'IN_PROGRESS', checkIn: { at: new Date().toISOString(), method: input.method, result: 'VERIFIED', flags } });
  return { result: 'VERIFIED', message: flags.length ? 'Checked in. Your location will be reviewed.' : 'Checked in', flags };
}

/** Answers the routes the Worker app calls, from the fixtures above. Unknown routes fail like a 404. */
export async function demoApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 300));
  const [route = '', qs = ''] = path.replace('/v1/employee', '').split('?');
  const q = new URLSearchParams(qs);
  const method = init.method ?? 'GET';
  const body = (init.body ?? {}) as Record<string, unknown>;
  const m = (re: RegExp) => route.match(re);
  const s = db();
  let out: unknown;
  let x: RegExpMatchArray | null;

  if (path.startsWith('/v1/public/applicants')) out = { received: true };
  else if (route === '/me' || route === '/me/password-changed') out = me();
  else if (route === '/schedule') {
    const from = q.get('from') ?? day(0);
    const to = q.get('to') ?? day(14);
    out = { items: s.visits.filter((v) => v.scheduledDate >= from && v.scheduledDate <= to).map(toItem) };
  } else if ((x = m(/^\/visits\/([^/]+)$/))) out = find(x[1]!);
  else if ((x = m(/^\/visits\/([^/]+)\/check-in$/))) out = checkIn(x[1]!, body as unknown as CheckInInput);
  else if ((x = m(/^\/visits\/([^/]+)\/complete$/))) {
    const v = find(x[1]!);
    if (v.status !== 'IN_PROGRESS') throw rule('Check in before completing the visit');
    Object.assign(v, { status: 'COMPLETED', completedAt: new Date().toISOString() });
    out = { status: 'COMPLETED' };
  } else if (m(/^\/visits\/[^/]+\/resident-absent$/)) throw rule('Wait 15 minutes after the visit time before recording that the resident is not available');
  else if ((x = m(/^\/visits\/([^/]+)\/corrections$/))) {
    const v = find(x[1]!);
    if (v.correction?.status === 'PENDING') throw new ApiError(409, 'CONFLICT', 'A correction for this visit is already waiting for review');
    v.correction = { status: 'PENDING', requestedChange: body.requestedChange as 'MARK_ATTENDED' | 'MARK_COMPLETED', reviewNote: null };
    out = { status: 'PENDING' };
  } else if (route === '/overtime-offers') out = { items: s.offers };
  else if ((x = m(/^\/overtime-offers\/([^/]+)\/respond$/))) {
    s.offers = s.offers.map((o) => (o.id === x![1] ? { ...o, responses: o.responses.map((r) => (r.employeeId === ME_ID ? { ...r, response: body.response as 'ACCEPTED' | 'REJECTED', respondedAt: new Date().toISOString() } : r)) } : o));
    out = { items: s.offers };
  } else if (route === '/leave' && method === 'GET') out = { items: s.leave };
  else if (route === '/leave') {
    const { startDate, endDate, reason } = body as { startDate: string; endDate: string; reason?: string };
    if (s.leave.some((l) => ['PENDING', 'APPROVED'].includes(l.status) && l.startDate <= endDate && l.endDate >= startDate)) throw rule('You already have leave requested for these dates');
    s.leave = [{ ...s.leave[0]!, id: uuid(), startDate, endDate, reason: reason ?? null, status: 'PENDING', reviewNote: null, createdAt: new Date().toISOString(), version: 1 }, ...s.leave];
    out = { items: s.leave };
  } else if ((x = m(/^\/leave\/([^/]+)\/cancel$/))) {
    s.leave = s.leave.map((l) => (l.id === x![1] ? { ...l, status: 'CANCELLED' as const } : l));
    out = { items: s.leave };
  } else if ((x = m(/^\/training\/([^/]+)\/complete$/))) {
    s.training = s.training.map((t) => (t.itemId === x![1] ? { ...t, completedAt: t.completedAt ?? new Date().toISOString() } : t));
    out = me();
  } else if (route === '/payslips') out = { items: demoState() === 'notready' ? [] : PAYSLIPS };
  else if (route === '/notifications') out = s.inbox;
  else if (route === '/notifications/read-all') {
    s.inbox = { unread: 0, items: s.inbox.items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) };
    out = s.inbox;
  } else if ((x = m(/^\/notifications\/([^/]+)\/read$/))) {
    const items = s.inbox.items.map((i) => (i.id === x![1] ? { ...i, readAt: i.readAt ?? new Date().toISOString() } : i));
    s.inbox = { items, unread: items.filter((i) => !i.readAt).length };
    out = s.inbox;
  } else if (route.startsWith('/devices')) out = {};
  else throw new ApiError(404, 'NOT_FOUND', `Demo has no fixture for ${method} ${path}`);
  return out as T;
}

/** Stand-in session so the signed-in screens render without Supabase. Never sent anywhere. */
export const demoSession = {
  access_token: 'demo',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: ME_ID, email: 'nv-000123@staff.nestovin.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
} as unknown as Session;
