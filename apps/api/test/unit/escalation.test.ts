import { describe, expect, it } from 'vitest';
import { addWorkingDays } from '../../src/modules/support/escalation';

const ist = (s: string) => new Date(`${s}+05:30`);
const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

describe('working-day deadlines (ADR-014)', () => {
  it('skips Sundays and keeps the clock time', () => {
    // Fri 20 Nov 2026 10:00 IST + 2 working days -> Sat 21 (1), Sun skipped, Mon 23 (2)
    const d = addWorkingDays(ist('2026-11-20T10:00:00'), 2, new Set());
    expect(day(d)).toBe('2026-11-23');
    expect(d.getTime() - ist('2026-11-23T10:00:00').getTime()).toBe(0);
  });
  it('skips listed holidays', () => {
    const d = addWorkingDays(ist('2026-11-20T10:00:00'), 2, new Set(['2026-11-21']));
    expect(day(d)).toBe('2026-11-24');
  });
  it('a ticket raised on Sunday starts counting on Monday', () => {
    expect(day(addWorkingDays(ist('2026-11-22T09:00:00'), 1, new Set()))).toBe('2026-11-23');
  });
});
