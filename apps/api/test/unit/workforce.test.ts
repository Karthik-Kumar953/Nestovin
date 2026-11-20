import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { fitsAvailability, patternsOverlap } from '../../src/modules/workforce/allocation';
import { staffEmail, temporaryPassword } from '../../src/modules/workforce/admin-service';
import { actor, fakeDeps } from '../helpers/fake-deps';

describe('allocation pattern checks', () => {
  const morning = { days: 63, start: '07:00', minutes: 60 }; // Mon–Sat
  it('detects clashing weekly patterns only when days and times overlap', () => {
    expect(patternsOverlap(morning, { days: 1, start: '07:30', minutes: 60 })).toBe(true);
    expect(patternsOverlap(morning, { days: 64, start: '07:00', minutes: 60 })).toBe(false); // Sunday only
    expect(patternsOverlap(morning, { days: 63, start: '08:00', minutes: 60 })).toBe(false); // back to back
  });
  it('requires a covering availability window on every pattern day; no windows = unrestricted', () => {
    expect(fitsAvailability(morning, [])).toBe(true);
    expect(fitsAvailability(morning, [{ days: 127, start: '06:00', end: '12:00' }])).toBe(true);
    expect(fitsAvailability(morning, [{ days: 31, start: '06:00', end: '12:00' }])).toBe(false); // Saturday missing
    expect(fitsAvailability(morning, [{ days: 127, start: '07:30', end: '12:00' }])).toBe(false);
  });
});

describe('worker login helpers (ADR-012)', () => {
  it('maps the Employee ID to the internal staff email', () => {
    expect(staffEmail('NV-000123')).toBe('nv-000123@staff.nestovin.invalid');
  });
  it('issues 12-character temporary passwords without ambiguous characters', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = temporaryPassword();
      expect(p).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{12}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const app = createApp(fakeDeps({ [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) } }));
const ID = '11111111-1111-4111-8111-111111111111';

describe('workforce permissions', () => {
  it('rejects worker routes without an Employee ID session', async () => {
    expect((await request(app).get('/v1/employee/me')).status).toBe(401);
    // An admin email session is not a worker session.
    expect((await request(app).get('/v1/employee/me').set('Authorization', `Bearer token:aal2:${NOGRANTS}`)).status).toBe(401);
  });
  it.each([
    ['get', '/v1/admin/employees'],
    ['post', `/v1/admin/employees/${ID}/login`],
    ['get', '/v1/admin/leave-requests'],
    ['get', '/v1/admin/allocation/needs'],
    ['post', `/v1/admin/allocation/components/${ID}/standing`],
    ['post', `/v1/admin/visits/${ID}/assign`],
  ] as const)('%s %s needs a module grant (403)', async (method, url) => {
    expect((await request(app)[method](url).set('Authorization', `Bearer token:aal2:${NOGRANTS}`).send({})).status).toBe(403);
  });
});
