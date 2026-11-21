import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckInInput, CheckInResult, LeaveRequest, Payslip } from '@nestovin/contracts';
import { api } from './api';
import { addDays, isoDay } from './format';
import type { Inbox, Me, OvertimeOffer, Visit, VisitDetail } from './types';

/** Query keys in one place so mutations invalidate the right screens. */
export const qk = {
  me: ['me'] as const,
  schedule: (from: string, to: string) => ['schedule', from, to] as const,
  scheduleAll: ['schedule'] as const,
  visit: (id: string) => ['visit', id] as const,
  visitAll: ['visit'] as const,
  offers: ['offers'] as const,
  leave: ['leave'] as const,
  payslips: ['payslips'] as const,
  inbox: ['inbox'] as const,
};

export const useMe = (enabled = true) => useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/v1/employee/me'), enabled });

/** The visit window the app keeps warm: a week back (corrections) to two weeks ahead. */
export const scheduleWindow = () => ({ from: addDays(isoDay(), -7), to: addDays(isoDay(), 14) });

export function useSchedule(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: qk.schedule(from, to),
    queryFn: async () => (await api<{ items: Visit[] }>(`/v1/employee/schedule?from=${from}&to=${to}`)).items,
    enabled,
  });
}

/**
 * Visit detail from GET /v1/employee/visits/:id. While it loads, the matching
 * schedule item (already cached) is shown so the screen opens instantly.
 */
export function useVisit(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.visit(id),
    queryFn: () => api<VisitDetail>(`/v1/employee/visits/${id}`),
    placeholderData: () => {
      for (const [, items] of qc.getQueriesData<Visit[]>({ queryKey: qk.scheduleAll })) {
        const v = items?.find((x) => x.occurrenceId === id);
        if (v) return { ...v, checkIn: null, completedAt: null, noShow: null, correction: null };
      }
      return undefined;
    },
  });
}

/** After any visit action: the schedule and every open visit detail reload. */
const refreshVisits = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([qc.invalidateQueries({ queryKey: qk.scheduleAll }), qc.invalidateQueries({ queryKey: qk.visitAll })]);

export const useOffers = (enabled = true) =>
  useQuery({ queryKey: qk.offers, queryFn: async () => (await api<{ items: OvertimeOffer[] }>('/v1/employee/overtime-offers')).items, enabled });

export const useLeave = () => useQuery({ queryKey: qk.leave, queryFn: async () => (await api<{ items: LeaveRequest[] }>('/v1/employee/leave')).items });

export const usePayslips = () => useQuery({ queryKey: qk.payslips, queryFn: async () => (await api<{ items: Payslip[] }>('/v1/employee/payslips')).items });

export const useInbox = (enabled = true) =>
  useQuery({ queryKey: qk.inbox, queryFn: () => api<Inbox>('/v1/employee/notifications'), enabled, refetchInterval: 60_000 });

// ---------------------------------------------------------------- mutations

export function useCheckIn(visitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckInInput) => api<CheckInResult>(`/v1/employee/visits/${visitId}/check-in`, { method: 'POST', body: input }),
    onSettled: () => refreshVisits(qc),
  });
}

export function useVisitAction<TBody>(visitId: string, action: 'complete' | 'resident-absent' | 'corrections') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api<{ status: string }>(`/v1/employee/visits/${visitId}/${action}`, { method: 'POST', body }),
    onSuccess: () => refreshVisits(qc),
  });
}

export function useRespondOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, response }: { id: string; response: 'ACCEPTED' | 'REJECTED' }) =>
      api<{ items: OvertimeOffer[] }>(`/v1/employee/overtime-offers/${id}/respond`, { method: 'POST', body: { response } }),
    onSuccess: (r) => qc.setQueryData(qk.offers, r.items),
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { startDate: string; endDate: string; reason?: string }) => api<{ items: LeaveRequest[] }>('/v1/employee/leave', { method: 'POST', body }),
    onSuccess: (r) => qc.setQueryData(qk.leave, r.items),
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ items: LeaveRequest[] }>(`/v1/employee/leave/${id}/cancel`, { method: 'POST' }),
    onSuccess: (r) => qc.setQueryData(qk.leave, r.items),
  });
}

export function useCompleteTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api<Me>(`/v1/employee/training/${itemId}/complete`, { method: 'POST' }),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | 'all') => api<Inbox>(id === 'all' ? '/v1/employee/notifications/read-all' : `/v1/employee/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: (r) => qc.setQueryData(qk.inbox, r),
  });
}

/** Visit status words for workers (plain language, never colour alone). */
export const VISIT_STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'warning' | 'error' | 'neutral' | 'teal' }> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  ASSIGNED: { label: 'Upcoming', tone: 'info' },
  IN_PROGRESS: { label: 'Checked in', tone: 'teal' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  COMPLETION_SUBMITTED: { label: 'Completion sent', tone: 'success' },
  NO_SHOW: { label: 'No-show recorded', tone: 'warning' },
  EXCEPTION: { label: 'Under review', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const visitStatus = (s: string) => VISIT_STATUS[s] ?? { label: s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), tone: 'neutral' as const };
