/** Formatting helpers (en-IN). Money is integer paise; dates from the API are ISO strings or YYYY-MM-DD. */

// Formatters are created once (Intl objects are expensive to build per render).
const INR_WHOLE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const F_DAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const F_SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const F_LONG = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const F_WEEKDAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });
const F_MONTH_SHORT = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const F_DATETIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const F_TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const F_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

export function rupees(paise: number): string {
  return `₹${(paise % 100 ? INR_PAISE : INR_WHOLE).format(paise / 100)}`;
}

/** Parses a calendar date (YYYY-MM-DD) as a local date, never shifting a day across time zones. */
export const localDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00`);

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => ymd(new Date());
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const dayLabel = (s: string) => {
  const d = localDate(s);
  const t = today();
  if (s.slice(0, 10) === t) return 'Today';
  if (s.slice(0, 10) === ymd(addDays(new Date(), 1))) return 'Tomorrow';
  return F_DAY.format(d);
};
export const shortDate = (s: string) => F_SHORT.format(localDate(s));
export const longDate = (s: string) => F_LONG.format(localDate(s));
export const weekday = (s: string) => F_WEEKDAY.format(localDate(s));
export const monthShort = (s: string) => F_MONTH_SHORT.format(localDate(s));
export const dayShort = (s: string) => F_DAY.format(localDate(s));
export const dayOfMonth = (s: string) => String(localDate(s).getDate());
export const dateTime = (iso: string) => F_DATETIME.format(new Date(iso));
export const time = (iso: string) => F_TIME.format(new Date(iso));
/** "07:30" (24h from the catalogue) → "7:30 am". */
export const hhmm = (s: string) => {
  const [h = 0, m = 0] = s.split(':').map(Number);
  return F_TIME.format(new Date(2000, 0, 1, h, m));
};
export const monthLabel = (d: Date) => F_MONTH.format(d);

export const relative = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? 's' : ''} ago`;
  return F_SHORT.format(new Date(iso));
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Bitmask Mon=1 … Sun=64 → "Every day", "Mon to Sat", "Mon, Wed, Fri". */
export const daysLabel = (m: number) => (m === 127 ? 'Every day' : m === 63 ? 'Mon to Sat' : m === 31 ? 'Mon to Fri' : DAYS.filter((_, i) => m & (1 << i)).join(', '));

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export const firstName = (full: string | null | undefined) => (full ?? '').trim().split(/\s+/)[0] || null;

export const validity = (days: number) => (days % 30 === 0 ? `${days / 30} month${days > 30 ? 's' : ''}` : `${days} days`);

export const bytes = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Task cadence from the catalogue: PER_VISIT, DAILY, WEEKLY, MONTHLY with a count per period. */
export const taskFrequency = (f: string, times: number) => {
  if (f === 'PER_VISIT') return 'Every visit';
  const period = f === 'DAILY' ? 'day' : f === 'WEEKLY' ? 'week' : f === 'MONTHLY' ? 'month' : f.toLowerCase();
  return times > 1 ? `${times} times a ${period}` : f === 'DAILY' ? 'Daily' : f === 'WEEKLY' ? 'Weekly' : f === 'MONTHLY' ? 'Monthly' : period;
};

/** "+919876543210" → "+91 98765 43210"; other numbers are returned unchanged. */
export const phone = (e164: string) => (/^\+91\d{10}$/.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164);

/** Joins parts into sentences for screen readers without doubling punctuation ("a reply." + "2 hours ago" → "a reply. 2 hours ago"). */
export const sentences = (...parts: (string | null | undefined | false)[]) =>
  parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().replace(/[.!?]+$/, ''))
    .join('. ');
