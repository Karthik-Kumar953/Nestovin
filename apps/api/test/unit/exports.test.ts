import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { allPages, csvCell, toCsv } from '../../src/lib/csv';
import { actor, fakeDeps } from '../helpers/fake-deps';

describe('CSV helper', () => {
  it('quotes values and neutralises spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98')).toBe(`"'+91 98"`);
    expect(csvCell(null)).toBe('""');
  });
  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(toCsv(['a'], [['ಕನ್ನಡ']]).startsWith('﻿"a"\r\n')).toBe(true);
  });
  it('collects pages up to the cap', async () => {
    const pages = [{ items: [1, 2], nextCursor: 'b' }, { items: [3, 4], nextCursor: 'c' }, { items: [5], nextCursor: null }];
    let i = 0;
    expect(await allPages(async () => pages[i++]!)).toEqual([1, 2, 3, 4, 5]);
    i = 0;
    expect(await allPages(async () => pages[i++]!, 3)).toEqual([1, 2, 3]);
  });
});

const VIEWER = '14141414-1414-4141-8141-141414141414';
const app = createApp(
  fakeDeps({
    [VIEWER]: { status: 'ACTIVE', actor: actor({ id: VIEWER, grants: ['residents:view', 'employees:view', 'support:view', 'demand_payments:view', 'attendance:view', 'locations:view'] }) },
  }),
);

describe('exports need the export action, not just view', () => {
  it.each(['communities', 'residents', 'bookings', 'payments', 'employees', 'tickets', 'attendance?from=2026-11-01&to=2026-11-02'])('/exports/%s', async (path) => {
    expect((await request(app).get(`/v1/admin/exports/${path}`).set('Authorization', `Bearer token:aal2:${VIEWER}`)).status).toBe(403);
  });
});
