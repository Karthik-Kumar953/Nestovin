/**
 * English notification copy (ADR-012: English only; copy kept in one place so
 * translations can be added later). Push text never includes personal data:
 * no names, phone numbers or amounts that identify a person.
 */
export interface RenderedNotification {
  title: string;
  body: string;
}

type Payload = Record<string, unknown>;

const TEMPLATES: Record<string, (p: Payload) => RenderedNotification> = {
  'residence.verified': () => ({ title: 'Residence verified', body: 'Your flat is verified. You can now book services.' }),
  'residence.rejected': () => ({ title: 'Residence not verified', body: 'Your registration was not approved. Open the app to see why.' }),
  'family.approved': () => ({ title: 'Family member approved', body: 'A family member now has access to your household.' }),
  'family.rejected': () => ({ title: 'Family request not approved', body: 'Your family request was not approved. Open the app to see why.' }),
  'family.access_granted': () => ({ title: 'Welcome to your household', body: 'You now have access to your family’s Nestovin household.' }),
  'ticket.replied': () => ({ title: 'Reply from Nestovin Support', body: 'There is a new reply on your support ticket.' }),
  'ticket.status_changed': (p) => ({ title: 'Ticket updated', body: `Your support ticket is now ${String(p.status ?? 'updated').toLowerCase().replace('_', ' ')}.` }),
  'payment.verified': () => ({ title: 'Payment received', body: 'Your payment is verified.' }),
  'payment.review': () => ({ title: 'Payment under review', body: 'We received your payment and our team is reviewing it.' }),
  'booking.confirmed': () => ({ title: 'Booking confirmed', body: 'Your service booking is confirmed.' }),
  'demand.slot_published': () => ({ title: 'Your slot is ready', body: 'Your start date and slot are published. Pay the remaining balance before the deadline.' }),
  'payment.reminder': () => ({ title: 'Payment reminder', body: 'A payment for your booking is still due. Open the app to pay.' }),
  'change_request.decided': (p) => ({ title: 'Request updated', body: `Your residence change request was ${String(p.decision ?? 'reviewed').toLowerCase()}.` }),
  'assignment.standing': () => ({ title: 'New regular work', body: 'You have a new regular assignment. Check your schedule.' }),
  'assignment.visit': () => ({ title: 'Schedule updated', body: 'A visit was added to your schedule.' }),
  'overtime.offered': () => ({ title: 'Additional work offered', body: 'You have a new overtime offer. Accept or decline in the app.' }),
  'overtime.confirmed': () => ({ title: 'Overtime confirmed', body: 'Your overtime visit is confirmed and in your schedule.' }),
  'attendance.correction_decided': (p) => ({ title: 'Correction reviewed', body: `Your attendance correction was ${String(p.decision ?? 'reviewed').toLowerCase()}.` }),
  'leave.decided': (p) => ({ title: 'Leave request updated', body: `Your leave request was ${String(p.decision ?? 'reviewed').toLowerCase()}.` }),
  'payslip.available': () => ({ title: 'Payslip available', body: 'Your payslip for the month is available.' }),
  // Email (admins / support destination)
  'ticket.escalated': (p) => ({ title: `Ticket ${String(p.reference ?? '')} escalated`, body: `A support ticket was escalated to you (${String(p.trigger ?? '').toLowerCase()}). Open the admin portal to review it.` }),
  'website_enquiry.received': (p) => ({ title: `New website enquiry ${String(p.reference ?? '')}`, body: 'A new enquiry was submitted on the Nestovin website. Open the admin portal to view it.' }),
};

export function render(eventType: string, payload: Payload): RenderedNotification {
  return TEMPLATES[eventType]?.(payload) ?? { title: 'Nestovin', body: 'You have a new update. Open the app to see it.' };
}

export const KNOWN_EVENTS = Object.keys(TEMPLATES);
