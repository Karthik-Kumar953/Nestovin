import type { Href } from 'expo-router';

/**
 * Where each update leads (inbox tap and push tap). Event types and payloads come from the API's
 * notify() calls; unknown events open the Updates inbox.
 */
export function hrefForEvent(eventType: string, data: Record<string, unknown> = {}): Href {
  const id = (k: string) => (typeof data[k] === 'string' && data[k] ? (data[k] as string) : null);
  switch (eventType) {
    case 'residence.verified':
      return '/';
    case 'residence.rejected':
      return { pathname: '/register', params: { step: 'proof' } };
    case 'family.approved':
    case 'family.rejected':
    case 'family.access_granted':
    case 'change_request.decided':
      return '/household';
    case 'ticket.replied':
    case 'ticket.status_changed':
      return id('ticketId') ? { pathname: '/ticket/[id]', params: { id: id('ticketId')! } } : '/support';
    case 'booking.confirmed':
      return id('refId') ? { pathname: '/bookings/[id]', params: { id: id('refId')!, kind: 'booking' } } : '/bookings';
    case 'payment.verified':
      return id('refId') ? { pathname: '/bookings/[id]', params: { id: id('refId')!, kind: 'request' } } : '/bookings';
    case 'payment.review':
      return '/bookings';
    default:
      if (eventType.startsWith('visit.')) return id('occurrenceId') ? { pathname: '/visit/[id]', params: { id: id('occurrenceId')! } } : '/visits';
      if (eventType.startsWith('booking.') || eventType.startsWith('demand.') || eventType.startsWith('cycle.')) return '/bookings';
      return '/notifications';
  }
}

/** Push payload values arrive as strings, with `eventType` alongside the event's own fields. */
export function hrefForPush(data: Record<string, unknown> | undefined): Href | null {
  if (!data || typeof data.eventType !== 'string') return null;
  return hrefForEvent(data.eventType, data);
}
