import type { Href } from 'expo-router';

/**
 * Where each update opens (EMP-10). Used by the inbox and by push taps. The
 * screen always loads the current record; the notification is only a pointer.
 */
export function linkFor(eventType: string, data: Record<string, unknown> = {}): Href {
  const visitId = typeof data.occurrenceId === 'string' ? data.occurrenceId : null;
  switch (eventType) {
    case 'overtime.offered':
      return '/offers';
    case 'overtime.confirmed':
    case 'assignment.standing':
    case 'assignment.visit':
      return visitId ? { pathname: '/visit/[id]', params: { id: visitId } } : '/schedule';
    case 'attendance.correction_decided':
      return visitId ? { pathname: '/visit/[id]', params: { id: visitId } } : '/schedule';
    case 'leave.decided':
      return '/leave';
    case 'payslip.available':
      return '/payslips';
    default:
      return '/updates';
  }
}
