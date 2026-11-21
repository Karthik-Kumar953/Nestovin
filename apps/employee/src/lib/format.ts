/** Formatting in Indian English. Times use the device clock (the community's timezone in practice). */

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

export const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-mm-dd in local time. */
export function isoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
/** Monday of the week that contains `day`. */
export function weekStart(day: string): string {
  const d = parseDay(day);
  const dow = (d.getDay() + 6) % 7;
  return addDays(day, -dow);
}

export const time = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)).replace(' ', '\u00a0') : null);
export function timeWindow(start: string | null, end: string | null): string {
  if (!start) return 'Time to be confirmed';
  return end ? `${time(start)} – ${time(end)}` : `From ${time(start)}`;
}
export const longDay = (day: string) => dayFmt.format(parseDay(day));
export const shortDay = (day: string) => shortDayFmt.format(parseDay(day));
export function relativeDay(day: string): string {
  const today = isoDay();
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  return shortDay(day);
}
export function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return monthFmt.format(new Date(y!, (m ?? 1) - 1, 1));
}
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return shortDayFmt.format(new Date(iso));
}
export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;
export function initials(full: string): string {
  const parts = full.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const flatLabel = (f: { flatNumber: string; towerName: string }) => `Flat ${f.flatNumber} · ${f.towerName}`;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** daysOfWeek bitmask: bit 0 = Monday … bit 6 = Sunday (ISO order). */
export function daysLabel(mask: number): string {
  const on = DAYS.filter((_, i) => mask & (1 << i));
  if (on.length === 7) return 'Every day';
  if (on.length === 6 && !(mask & 64)) return 'Mon – Sat';
  if (on.length === 5 && !(mask & 96)) return 'Mon – Fri';
  return on.join(', ');
}
