import type { EmployeeMe, EmployeeScheduleItem } from '@nestovin/contracts';

/*
 * Shapes the API returns that are not (yet) in @nestovin/contracts.
 * TODO(api): move OvertimeOffer and InboxItem into contracts so both apps share them.
 */

export type Flat = EmployeeScheduleItem['flat'];

/** GET /v1/employee/overtime-offers (OvertimeService.mine). */
export interface OvertimeOffer {
  id: string;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  note: string | null;
  createdAt: string;
  visit: { occurrenceId: string; scheduledDate: string; startsAt: string | null; endsAt: string | null; serviceName: string; flat: Flat };
  responses: { employeeId: string; employeeCode: string; fullName: string; response: 'PENDING' | 'ACCEPTED' | 'REJECTED'; respondedAt: string | null }[];
  confirmedEmployeeId: string | null;
}

/** GET /v1/employee/notifications. */
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

/**
 * /me plus fields the Worker app needs that the API does not return yet.
 * TODO(api): homeClusterName on GET /v1/employee/me (asked the lead).
 */
export type Me = EmployeeMe & { homeClusterName?: string | null };

/**
 * A visit as the app shows it. TODO(api): `tasks` is not in the schedule item;
 * until the API sends it the app shows the service only and never invents tasks.
 */
export type Visit = EmployeeScheduleItem & { tasks?: string[] | null };
