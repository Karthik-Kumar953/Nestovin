import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { actor, fakeDeps } from '../helpers/fake-deps';
import { appDatabase, databaseAvailable } from '../helpers/db';

/* Every CSV export runs against the real schema (scoped lists, audit row). */

const available = await databaseAvailable();

describe.skipIf(!available)('CSV exports', { timeout: 120_000 }, () => {
  const db = available ? appDatabase() : (undefined as never);
  const ROOT = randomUUID();
  const deps = { ...fakeDeps({ [ROOT]: { status: 'ACTIVE', actor: actor({ id: ROOT, isSuperAdmin: true }) } }), db };
  const app = createApp(deps);
  afterAll(async () => {
    await db?.destroy();
  });

  it.each([
    ['communities', 'Name'],
    ['residents', 'Phone'],
    ['bookings', 'Reference'],
    ['payments', 'Purpose'],
    ['employees', 'Employee ID'],
    ['tickets', 'Subject'],
    ['attendance?from=2026-11-01&to=2026-11-30', 'Worker ID'],
  ])('/exports/%s returns CSV with a header', async (path, column) => {
    const res = await request(app).get(`/v1/admin/exports/${path}`).set('Authorization', `Bearer token:aal2:${ROOT}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="nestovin-/);
    expect(res.text.split('\r\n')[0]).toContain(`"${column}"`);
  });
});
