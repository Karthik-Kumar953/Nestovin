import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type {
  BookingDetail,
  BookingOptions,
  BookingView,
  Household,
  ResidentCatalogue,
  ResidentDemandRequest,
  ResidentMe,
  ResidentVisit,
  TicketDetail,
  VisitCode,
} from '@nestovin/contracts';
import { NON_REFUNDABLE_DISCLOSURE } from '@nestovin/contracts';
import { addDays, ymd } from './format';
import type { Inbox } from './queries';

/*
 * DEV-ONLY demo data for design review and screenshots (EXPO_PUBLIC_DEMO=1 in a development build).
 * Never active in a release build (__DEV__ gate in env.ts). Plan names, prices and percentages here are
 * illustrative placeholders, not Nestovin's catalogue; the real values always come from the API.
 * On web, `?demo=new` or `?demo=pending` shows the other Home states.
 */

type State = 'active' | 'new' | 'pending';
const state = (): State => {
  if (Platform.OS !== 'web') return 'active';
  const q = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  return q.includes('demo=new') ? 'new' : q.includes('demo=pending') ? 'pending' : 'active';
};

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const day = (d: number) => ymd(addDays(new Date(), d));
const at = (d: number, h: number, m = 0) => {
  const x = addDays(new Date(), d);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};

const ids = {
  community: uuid(),
  flat: uuid(),
  maid: uuid(),
  cook: uuid(),
  care: uuid(),
  planA: uuid(),
  planB: uuid(),
  cycle: uuid(),
  w1: uuid(),
  w2: uuid(),
  w3: uuid(),
  slot1: uuid(),
  slot2: uuid(),
  b1: uuid(),
  b2: uuid(),
  r1: uuid(),
  t1: uuid(),
  cat1: uuid(),
  cat2: uuid(),
  cat3: uuid(),
};

const membership = (status: 'VERIFIED' | 'PENDING') => ({
  id: uuid(),
  residentId: uuid(),
  kind: 'PRIMARY' as const,
  occupancy: 'OWNER' as const,
  status,
  flatId: ids.flat,
  flatNumber: '1204',
  towerName: 'Tower B',
  communityId: ids.community,
  communityName: 'Green Meadows',
  verifiedAt: status === 'VERIFIED' ? at(-40, 10) : null,
  createdAt: at(-42, 10),
});

function me(): ResidentMe {
  const s = state();
  return {
    id: uuid(),
    phone: '+919800000000',
    fullName: 'Ananya Rao',
    email: null,
    status: 'ACTIVE',
    membership: s === 'new' ? null : membership(s === 'pending' ? 'PENDING' : 'VERIFIED'),
    verification:
      s === 'pending'
        ? { decision: 'PENDING', reason: null, documentUploaded: true, flat: null }
        : null,
    version: 1,
  };
}

const visit = (
  d: number,
  svc: string,
  h: number,
  status: string,
  extra: Partial<ResidentVisit> = {},
): ResidentVisit => ({
  occurrenceId: uuid(),
  scheduledDate: day(d),
  startsAt: at(d, h, 30),
  serviceName: svc,
  status,
  workerName: status === 'SCHEDULED' ? null : svc === 'Cook' ? 'Lakshmi' : 'Meena',
  checkedInAt: status === 'COMPLETED' ? at(d, h, 34) : null,
  completedAt: status === 'COMPLETED' ? at(d, h + 1, 25) : null,
  noShow: null,
  feedback: null,
  canShowCode: false,
  ...extra,
});

function visits(from: string, to: string): ResidentVisit[] {
  const all: ResidentVisit[] = [
    visit(0, 'Cook', 7, 'ASSIGNED', { canShowCode: true }),
    visit(0, 'Cook', 18, 'ASSIGNED'),
    visit(1, 'Cook', 7, 'ASSIGNED'),
    visit(2, 'Cook', 7, 'SCHEDULED'),
    visit(3, 'Maid', 9, 'SCHEDULED'),
  ];
  for (let d = -1; d > -75; d -= 1) {
    if (d % 6 === 0) continue;
    all.push(
      visit(
        d,
        'Cook',
        7,
        'COMPLETED',
        d === -1 ? {} : { feedback: d % 4 ? { rating: 5, comment: null } : null },
      ),
    );
  }
  all.push(
    visit(-9, 'Cook', 7, 'NO_SHOW', {
      noShow: 'RESIDENT_ABSENT',
      checkedInAt: null,
      completedAt: null,
    }),
  );
  return all.filter((v) => v.scheduledDate >= from && v.scheduledDate <= to);
}

const options = (): BookingOptions => ({
  eligible: state() === 'active',
  reason:
    state() === 'active'
      ? null
      : state() === 'new'
        ? 'Register your flat to book a service.'
        : 'Your residence is waiting for verification.',
  reasonCode: state() === 'active' ? null : state() === 'new' ? 'NOT_REGISTERED' : 'NOT_VERIFIED',
  communityName: 'Green Meadows',
  openCycles: [
    {
      id: ids.cycle,
      name: 'December booking round',
      closesAt: at(6, 23, 59),
      initialPct: 30,
      planIds: [ids.planA],
      timeWindows: [
        { id: ids.w1, name: 'Early morning', startTime: '06:30', endTime: '08:30' },
        { id: ids.w2, name: 'Morning', startTime: '09:00', endTime: '11:00' },
        { id: ids.w3, name: 'Evening', startTime: '17:00', endTime: '19:00' },
      ],
    },
  ],
  continuousSlots: [
    {
      id: ids.slot1,
      label: 'Breakfast',
      serviceId: ids.cook,
      startTime: '07:30',
      durationMinutes: 90,
      daysOfWeek: 127,
      available: true,
    },
    {
      id: ids.slot2,
      label: 'Dinner',
      serviceId: ids.cook,
      startTime: '18:00',
      durationMinutes: 90,
      daysOfWeek: 127,
      available: true,
    },
  ],
  startDateRange: { from: day(1), to: day(14) },
  disclosure: { ...NON_REFUNDABLE_DISCLOSURE },
});

const tasks = (names: string[]) =>
  names.map((name, i) => ({ name, frequency: i < 3 ? 'PER_VISIT' : 'WEEKLY', timesPerPeriod: 1 }));
const catalogue = (): ResidentCatalogue => ({
  communityId: ids.community,
  residenceCategory: { id: uuid(), label: '2 BHK' },
  versionNo: 3,
  services: [
    { serviceId: ids.maid, code: 'MAID', name: 'Maid', operatingMode: 'DEMAND_LED' },
    { serviceId: ids.cook, code: 'COOK', name: 'Cook', operatingMode: 'CONTINUOUS' },
    { serviceId: ids.care, code: 'CARETAKER', name: 'Caretaker', operatingMode: 'CONTINUOUS' },
  ],
  plans: [
    {
      id: ids.planA,
      name: '[Plan A] Maid',
      description: 'Daily cleaning, dishes and laundry folding.',
      validityDays: 30,
      packagePricePaise: null,
      servicePrices: [{ serviceId: ids.maid, name: 'Maid', pricePaise: 450000 }],
      components: [
        {
          id: uuid(),
          serviceId: ids.maid,
          name: 'Maid',
          isOptionalAddon: false,
          visitsPerDay: 1,
          daysOfWeek: 63,
          durationMinutes: 60,
          timeWindow: null,
          addonHours: null,
          addonPricePaise: null,
          tasks: tasks([
            'Sweeping and mopping',
            'Dishes',
            'Dusting',
            'Laundry folding',
            'Bathroom cleaning',
          ]),
        },
      ],
    },
    {
      id: ids.planB,
      name: '[Plan B] Cook',
      description: 'Breakfast and dinner, cooked at home.',
      validityDays: 30,
      packagePricePaise: null,
      servicePrices: [{ serviceId: ids.cook, name: 'Cook', pricePaise: 650000 }],
      components: [
        {
          id: uuid(),
          serviceId: ids.cook,
          name: 'Cook',
          isOptionalAddon: false,
          visitsPerDay: 2,
          daysOfWeek: 127,
          durationMinutes: 90,
          timeWindow: null,
          addonHours: null,
          addonPricePaise: null,
          tasks: tasks([
            'Meal preparation',
            'Kitchen counter cleaning',
            'Utensil washing',
            'Refrigerator wipe-down',
          ]),
        },
        {
          id: uuid(),
          serviceId: ids.care,
          name: 'Caretaker',
          isOptionalAddon: true,
          visitsPerDay: 1,
          daysOfWeek: 127,
          durationMinutes: 120,
          timeWindow: null,
          addonHours: 2,
          addonPricePaise: 300000,
          tasks: [],
        },
      ],
    },
  ],
});

const slot = { label: 'Breakfast', startTime: '07:30', durationMinutes: 90, daysOfWeek: 127 };
const bookings = (): BookingView[] => [
  {
    id: ids.b1,
    reference: 'NV-BK-20481',
    mode: 'CONTINUOUS',
    status: 'CONFIRMED',
    planName: '[Plan B] Cook',
    selectionLabel: 'Cook',
    slot,
    startDate: day(-20),
    totalPaise: 650000,
    paidPaise: 650000,
    outstandingPaise: 0,
    balanceDueAt: null,
    subscription: {
      id: uuid(),
      periodStart: day(-20),
      periodEnd: day(10),
      status: 'ACTIVE',
      renewable: true,
    },
    createdAt: at(-22, 11),
  },
  {
    id: ids.b2,
    reference: 'NV-BK-20517',
    mode: 'DEMAND_LED',
    status: 'PENDING_PAYMENT',
    planName: '[Plan A] Maid',
    selectionLabel: 'Maid',
    slot: { label: 'Morning', startTime: '09:00', durationMinutes: 60, daysOfWeek: 63 },
    startDate: day(5),
    totalPaise: 450000,
    paidPaise: 135000,
    outstandingPaise: 315000,
    balanceDueAt: at(2, 23, 59),
    subscription: null,
    createdAt: at(-10, 9),
  },
];

const requests = (): ResidentDemandRequest[] => [
  {
    id: ids.r1,
    reference: 'NV-DR-3102',
    cycleName: 'December booking round',
    status: 'COMMITTED',
    planName: '[Plan A] Maid',
    selectionLabel: 'Maid',
    totalPaise: 450000,
    initialPct: 30,
    initialDuePaise: 135000,
    initialPaidPaise: 135000,
    remainingDuePaise: 315000,
    preferredWindows: ['Morning', 'Early morning'],
    bookingId: null,
    createdAt: at(-1, 20),
  },
];

const ticket = (): TicketDetail => ({
  id: ids.t1,
  reference: 'NV-T-1042',
  subject: 'Cook timing on weekends',
  categoryId: ids.cat2,
  categoryName: 'Visit timing',
  priority: 'NORMAL',
  urgent: false,
  status: 'WAITING',
  createdAt: at(-1, 9),
  updatedAt: at(0, 8),
  description: 'Can the Saturday breakfast visit start at 8:00 instead of 7:30?',
  updates: [
    {
      id: uuid(),
      authorKind: 'system',
      authorName: null,
      visibility: 'RESIDENT',
      body: 'Assigned to the Green Meadows team',
      createdAt: at(-1, 10),
    },
    {
      id: uuid(),
      authorKind: 'admin',
      authorName: 'Priya, Nestovin Support',
      visibility: 'RESIDENT',
      body: 'We can move Saturdays to 8:00 from next week. Shall we go ahead?',
      createdAt: at(0, 8),
    },
  ],
});

const household = (): Household => ({
  isPrimary: true,
  members: [
    {
      membershipId: uuid(),
      residentId: uuid(),
      fullName: 'Ananya Rao',
      phone: '+919800000000',
      kind: 'PRIMARY',
      status: 'VERIFIED',
    },
    {
      membershipId: uuid(),
      residentId: uuid(),
      fullName: 'Vikram Rao',
      phone: '+919800000001',
      kind: 'FAMILY',
      status: 'VERIFIED',
    },
  ],
  requests: [
    {
      id: uuid(),
      fullName: 'Sushma Rao',
      phone: '+919800000002',
      relationship: 'Mother',
      status: 'PENDING',
      reason: null,
      createdAt: at(-2, 12),
      reviewedAt: null,
    },
  ],
});

const inbox = (): Inbox => ({
  unread: 2,
  items: [
    {
      id: uuid(),
      eventType: 'ticket.replied',
      title: 'Support replied',
      body: 'Your request NV-T-1042 has a new reply.',
      data: { ticketId: ids.t1 },
      readAt: null,
      createdAt: at(0, 8),
    },
    {
      id: uuid(),
      eventType: 'payment.verified',
      title: 'You joined the booking round',
      body: 'We will confirm your slot after the round closes.',
      data: { refId: ids.r1 },
      readAt: null,
      createdAt: at(-1, 20, 5),
    },
    {
      id: uuid(),
      eventType: 'booking.confirmed',
      title: 'Cook service confirmed',
      body: 'Visits start tomorrow at 7:30.',
      data: { refId: ids.b1 },
      readAt: at(-20, 9),
      createdAt: at(-21, 18),
    },
  ],
});

const detail = (b: BookingView): BookingDetail => ({
  ...b,
  terms: {
    components: catalogue()
      .plans.flatMap((p) => p.components)
      .filter((c) => c.name === b.selectionLabel)
      .map((c) => ({
        serviceName: c.name,
        isAddon: c.isOptionalAddon,
        visitsPerDay: c.visitsPerDay,
        daysOfWeek: c.daysOfWeek,
        durationMinutes: c.durationMinutes,
        addonHours: c.addonHours,
        tasks: c.tasks,
      })),
    initialPct: b.mode === 'DEMAND_LED' ? 30 : null,
    taxPaise: Math.round((b.totalPaise * 0.18) / 1.18),
    validityDays: 30,
    disclosureVersion: b.mode === 'DEMAND_LED' ? NON_REFUNDABLE_DISCLOSURE.version : null,
    disclosureAcceptedAt: b.mode === 'DEMAND_LED' ? at(-10, 9) : null,
  },
  payments: [
    {
      id: uuid(),
      purpose: b.mode === 'DEMAND_LED' ? 'INITIAL' : 'FULL',
      amountPaise: b.paidPaise,
      status: 'PAID',
      createdAt: b.createdAt,
      paidAt: b.createdAt,
    },
  ],
});

const checkout = (amountPaise: number) => ({
  paymentOrderId: uuid(),
  providerOrderId: 'order_demo',
  keyId: 'rzp_test_demo',
  amountPaise,
  currency: 'INR',
  description: 'Demo order',
});

/** Answers the routes the app calls, from the fixtures above. Unknown routes fail like a 404. */
export async function demoApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  await new Promise((r) => setTimeout(r, 350));
  const [route, qs = ''] = path.replace('/v1/resident', '').split('?');
  const q = new URLSearchParams(qs);
  const method = init.method ?? 'GET';
  const m = (re: RegExp) => route!.match(re);
  let out: unknown;
  if (route === '/me') out = me();
  else if (route === '/notifications')
    out = q.get('unread') === 'true' ? { ...inbox(), items: [] } : inbox();
  else if (route?.startsWith('/notifications')) out = { ...inbox(), unread: 0 };
  else if (route === '/visits')
    out = { items: visits(q.get('from') ?? day(-30), q.get('to') ?? day(14)) };
  else if (m(/^\/visits\/[^/]+\/code$/))
    out = {
      occurrenceId: route!.split('/')[2],
      otp: '482915',
      qr: 'nestovin-demo-qr',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    } satisfies VisitCode;
  else if (m(/^\/visits\/[^/]+\/feedback$/)) out = {};
  else if (route === '/booking-options') out = options();
  else if (route === '/bookings' && method === 'POST')
    out = { booking: bookings()[0], checkout: checkout(650000) };
  else if (route === '/demand-requests' && method === 'POST')
    out = { request: requests()[0], checkout: checkout(135000) };
  else if (m(/^\/(bookings|demand-requests)\/[^/]+\/pay$/)) out = checkout(315000);
  else if (m(/^\/subscriptions\/[^/]+\/renew$/))
    out = { booking: bookings()[0], checkout: checkout(650000) };
  else if (m(/^\/demand-requests\/[^/]+\/cancel$/)) out = { items: [] };
  else if (route === '/tickets' && method === 'POST') out = ticket();
  else if (m(/^\/tickets\/[^/]+\/replies$/)) out = ticket();
  else if (route === '/catalogue') out = catalogue();
  else if (route === '/bookings' && method === 'GET') out = { items: bookings() };
  else if (m(/^\/bookings\/[^/]+$/))
    out = detail(bookings().find((b) => b.id === route!.split('/')[2]) ?? bookings()[0]!);
  else if (route === '/demand-requests' && method === 'GET') out = { items: requests() };
  else if (route === '/tickets' && method === 'GET') out = { items: [ticket()] };
  else if (m(/^\/tickets\/[^/]+$/)) out = ticket();
  else if (route === '/ticket-categories')
    out = {
      items: [
        { id: ids.cat1, name: 'Visit quality' },
        { id: ids.cat2, name: 'Visit timing' },
        { id: ids.cat3, name: 'Payments and billing' },
      ],
    };
  else if (route === '/household') out = household();
  else if (route === '/change-requests' && method === 'GET') out = { items: [] };
  else if (route === '/cities')
    out = {
      items: [
        { id: uuid(), name: 'Bengaluru', state: 'Karnataka' },
        { id: uuid(), name: 'Hyderabad', state: 'Telangana' },
      ],
    };
  else {
    const { ApiError } = await import('./api');
    throw new ApiError(404, 'NOT_FOUND', 'Not available in demo mode.');
  }
  return out as T;
}

/** A session-shaped object so the signed-in area renders in demo mode. */
export const demoSession = { access_token: 'demo', user: { id: 'demo' } } as unknown as Session;
