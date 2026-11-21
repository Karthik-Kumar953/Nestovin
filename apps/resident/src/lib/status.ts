import type { IconName, StatusTone } from '@nestovin/ui-native';

type Status = { label: string; tone: StatusTone; icon?: IconName };

const pick = (map: Record<string, Status>, key: string): Status => map[key] ?? { label: key.replace(/_/g, ' ').toLowerCase(), tone: 'neutral' };

const VISIT: Record<string, Status> = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral', icon: 'calendar-outline' },
  ASSIGNED: { label: 'Worker assigned', tone: 'info', icon: 'person-outline' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand', icon: 'play-circle' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  NO_SHOW: { label: 'Missed', tone: 'warning' },
  EXCEPTION: { label: 'Under review', tone: 'warning', icon: 'shield-outline' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' },
};
export const visitStatus = (s: string, noShow?: string | null): Status =>
  s === 'NO_SHOW' && noShow === 'RESIDENT_ABSENT' ? { label: 'Missed: no one home', tone: 'warning' } : s === 'NO_SHOW' && noShow === 'WORKER_ABSENT' ? { label: 'Missed by us', tone: 'error' } : pick(VISIT, s);

const BOOKING: Record<string, Status> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' },
  EXPIRED: { label: 'Expired', tone: 'neutral', icon: 'hourglass-outline' },
  REVIEW_REQUIRED: { label: 'Under review', tone: 'info', icon: 'shield-outline' },
};
export const bookingStatus = (s: string, mode?: string, outstanding?: number) =>
  s === 'PENDING_PAYMENT' && mode === 'DEMAND_LED' && outstanding ? { label: 'Balance due', tone: 'warning' as const } : pick(BOOKING, s);

/** A demand request is never shown as a confirmed booking (DESIGN.md guardrail). */
const REQUEST: Record<string, Status> = {
  AWAITING_PAYMENT: { label: 'Not paid yet', tone: 'warning' },
  COMMITTED: { label: 'Joined · awaiting slot', tone: 'info', icon: 'time' },
  BALANCE_DUE: { label: 'Balance due', tone: 'warning' },
  CONVERTED: { label: 'Booked', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral', icon: 'hourglass-outline' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'close-circle-outline' },
  REVIEW_REQUIRED: { label: 'Under review', tone: 'info', icon: 'shield-outline' },
};
export const requestStatus = (s: string) => pick(REQUEST, s);

const TICKET: Record<string, Status> = {
  OPEN: { label: 'Open', tone: 'info', icon: 'ellipse' },
  ASSIGNED: { label: 'Being handled', tone: 'info', icon: 'person-outline' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand', icon: 'construct-outline' },
  WAITING: { label: 'Waiting for you', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral', icon: 'lock-closed-outline' },
};
export const ticketStatus = (s: string) => pick(TICKET, s);

const SUBSCRIPTION: Record<string, Status> = {
  PENDING_ACTIVATION: { label: 'Starts soon', tone: 'info' },
  ACTIVE: { label: 'Active', tone: 'success' },
  ENDED: { label: 'Ended', tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
export const subscriptionStatus = (s: string) => pick(SUBSCRIPTION, s);

export const CHANGE_STATUS: Record<string, Status> = {
  PENDING: { label: 'Under review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Not approved', tone: 'error' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
