import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  BookingOptions,
  BookingView,
  Household,
  ResidentCatalogue,
  ResidentDemandRequest,
  ResidentMe,
  ResidentVisit,
  TicketDetail,
  TicketSummary,
} from '@nestovin/contracts';
import { api } from './api';
import { addDays, today, ymd } from './format';

/** Inbox entry as returned by GET /v1/resident/notifications (NotificationService.inbox). */
export interface InboxItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
export interface Inbox {
  items: InboxItem[];
  unread: number;
}
export interface ChangeRequest {
  id: string;
  kind: 'OCCUPANCY_CHANGE' | 'MOVE_OUT';
  requested: { occupancy?: string; moveOutDate?: string };
  status: string;
  reviewNote: string | null;
  createdAt?: string;
}

export const keys = {
  me: ['me'] as const,
  inbox: ['inbox'] as const,
  inboxCount: ['inbox', 'count'] as const,
  visits: ['visits'] as const,
  options: ['booking-options'] as const,
  catalogue: ['catalogue'] as const,
  bookings: ['bookings'] as const,
  requests: ['demand-requests'] as const,
  tickets: ['tickets'] as const,
  household: ['household'] as const,
  changes: ['change-requests'] as const,
};

export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: () => api<ResidentMe>('/v1/resident/me') });

export const useUnread = (enabled = true) =>
  useQuery({
    queryKey: keys.inboxCount,
    enabled,
    queryFn: () => api<Inbox>('/v1/resident/notifications?unread=true'),
    select: (d) => d.unread,
    refetchInterval: 60_000,
  });

export const useInbox = () =>
  useQuery({ queryKey: keys.inbox, queryFn: () => api<Inbox>('/v1/resident/notifications') });

const visitsPath = (from: string, to: string) => `/v1/resident/visits?from=${from}&to=${to}`;

/** Visits from today for `days` days (Home and the Upcoming tab). */
export const useUpcomingVisits = (enabled: boolean, days = 14) => {
  const from = today();
  const to = ymd(addDays(new Date(), days));
  return useQuery({
    queryKey: [...keys.visits, 'upcoming', from, to],
    enabled,
    queryFn: () => api<{ items: ResidentVisit[] }>(visitsPath(from, to)),
    select: (d) =>
      [...d.items].sort((a, b) =>
        (a.scheduledDate + (a.startsAt ?? '')).localeCompare(b.scheduledDate + (b.startsAt ?? '')),
      ),
  });
};

/** History one calendar month per page, newest first; "Load earlier" fetches the previous month (no 30-day cap). */
export const useVisitHistory = (enabled: boolean) =>
  useInfiniteQuery({
    queryKey: [...keys.visits, 'history'],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - pageParam, 1);
      const last =
        pageParam === 0 ? addDays(now, -1) : new Date(first.getFullYear(), first.getMonth() + 1, 0);
      const items =
        last < first
          ? []
          : (await api<{ items: ResidentVisit[] }>(visitsPath(ymd(first), ymd(last)))).items;
      return {
        month: first.toISOString(),
        items: items.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
      };
    },
    // Twelve months back is plenty for a household; the API accepts any range.
    getNextPageParam: (_last, pages) => (pages.length < 12 ? pages.length : undefined),
  });

/** Finds a visit already in the cache (list screens), so detail opens instantly. */
export function findCachedVisit(qc: QueryClient, id: string): ResidentVisit | undefined {
  for (const [, data] of qc.getQueriesData<unknown>({ queryKey: keys.visits })) {
    const lists: ResidentVisit[][] = [];
    if (data && typeof data === 'object' && 'items' in data)
      lists.push((data as { items: ResidentVisit[] }).items);
    if (data && typeof data === 'object' && 'pages' in data)
      for (const p of (data as { pages: { items: ResidentVisit[] }[] }).pages) lists.push(p.items);
    for (const l of lists) {
      const hit = l.find((v) => v.occurrenceId === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

export const useVisit = (id: string) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: [...keys.visits, 'one', id],
    initialData: () => findCachedVisit(qc, id),
    queryFn: async () => {
      const from = ymd(addDays(new Date(), -62));
      const to = ymd(addDays(new Date(), 14));
      const hit = (await api<{ items: ResidentVisit[] }>(visitsPath(from, to))).items.find(
        (v) => v.occurrenceId === id,
      );
      if (!hit) throw new Error('This visit is no longer available.');
      return hit;
    },
  });
};

export const useBookingOptions = () =>
  useQuery({
    queryKey: keys.options,
    queryFn: () => api<BookingOptions>('/v1/resident/booking-options'),
  });
export const useCatalogue = (enabled: boolean) =>
  useQuery({
    queryKey: keys.catalogue,
    enabled,
    queryFn: () => api<ResidentCatalogue>('/v1/resident/catalogue'),
  });
export const useBookings = (enabled = true) =>
  useQuery({
    queryKey: keys.bookings,
    enabled,
    queryFn: () => api<{ items: BookingView[] }>('/v1/resident/bookings'),
    select: (d) => d.items,
  });
export const useRequests = (enabled = true) =>
  useQuery({
    queryKey: keys.requests,
    enabled,
    queryFn: () => api<{ items: ResidentDemandRequest[] }>('/v1/resident/demand-requests'),
    select: (d) => d.items,
  });

export const useTickets = () =>
  useQuery({
    queryKey: keys.tickets,
    queryFn: () => api<{ items: TicketSummary[] }>('/v1/resident/tickets'),
    select: (d) => d.items,
  });
export const useTicket = (id: string) =>
  useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<TicketDetail>(`/v1/resident/tickets/${id}`),
  });
export const useTicketCategories = () =>
  useQuery({
    queryKey: ['ticket-categories'],
    staleTime: 10 * 60_000,
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/v1/resident/ticket-categories'),
    select: (d) => d.items,
  });

export const useHousehold = () =>
  useQuery({ queryKey: keys.household, queryFn: () => api<Household>('/v1/resident/household') });
export const useChangeRequests = () =>
  useQuery({
    queryKey: keys.changes,
    queryFn: () => api<{ items: ChangeRequest[] }>('/v1/resident/change-requests'),
    select: (d) => d.items,
  });

/** Refreshes everything that a payment can change. */
export async function refreshAfterPayment(qc: QueryClient) {
  await Promise.all(
    [keys.bookings, keys.requests, keys.visits, keys.inbox].map((k) =>
      qc.invalidateQueries({ queryKey: k }),
    ),
  );
}
