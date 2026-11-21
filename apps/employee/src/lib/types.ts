import type { EmployeeMe, EmployeeScheduleItem, EmployeeVisitDetail } from '@nestovin/contracts';

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

export type Me = EmployeeMe;
/** A schedule item: tasks come from the booking's terms snapshot (empty = plan lists none). */
export type Visit = EmployeeScheduleItem;
/** GET /v1/employee/visits/:id: a visit plus its attendance state. */
export type VisitDetail = EmployeeVisitDetail;
