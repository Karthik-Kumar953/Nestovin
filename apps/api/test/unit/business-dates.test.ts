import { describe, expect, it } from 'vitest';
import { businessDateOf, businessToday } from '../../src/lib/dates';

/* Review H-6: business dates are India dates, not UTC dates. */
describe('business dates (Asia/Kolkata)', () => {
  it('01:30 IST on the 22nd is the 22nd, although UTC is still the 21st', () => {
    const at = new Date('2026-11-21T20:00:00Z');
    expect(at.toISOString().slice(0, 10)).toBe('2026-11-21');
    expect(businessToday(at)).toBe('2026-11-22');
  });
  it('just before midnight IST is still the same day', () => {
    expect(businessDateOf(new Date('2026-11-21T18:29:59Z'))).toBe('2026-11-21');
    expect(businessDateOf(new Date('2026-11-21T18:30:00Z'))).toBe('2026-11-22');
  });
  it('honours another time zone when a community sets one', () => {
    expect(businessDateOf(new Date('2026-11-21T20:00:00Z'), 'UTC')).toBe('2026-11-21');
  });
});
