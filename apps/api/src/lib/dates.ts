/**
 * Business dates (review H-6). Nestovin operates in India: a "date" for
 * bookings, visits, leave, payroll and deadlines is the calendar date in
 * Asia/Kolkata, never the UTC date. Use these helpers instead of
 * `new Date().toISOString().slice(0, 10)`, which is a UTC date and is wrong
 * between 00:00 and 05:30 IST.
 */
export const BUSINESS_TZ = 'Asia/Kolkata';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(tz, f);
  }
  return f;
}

/** The business calendar date (YYYY-MM-DD) of an instant, in the given time zone. */
export function businessDateOf(instant: Date, tz = BUSINESS_TZ): string {
  return formatter(tz).format(instant);
}

/** Today's business date (YYYY-MM-DD) in India. */
export function businessToday(now = new Date(), tz = BUSINESS_TZ): string {
  return businessDateOf(now, tz);
}

/** SQL expression for today's business date, for use inside queries instead of `current_date`. */
export const SQL_BUSINESS_TODAY = `(now() at time zone '${BUSINESS_TZ}')::date`;
