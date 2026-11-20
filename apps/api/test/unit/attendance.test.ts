import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { distanceMetres, locationFlags } from '../../src/modules/attendance/service';
import { actor, fakeDeps } from '../helpers/fake-deps';

describe('attendance location evidence (ADR-014)', () => {
  const pin = { lat: 17.44, lng: 78.38 };
  it('measures distance in metres', () => {
    expect(distanceMetres(pin, pin)).toBe(0);
    const d = distanceMetres(pin, { lat: 17.441, lng: 78.38 }); // ~111 m north
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
  it('flags outside the radius but never blocks; low accuracy only once a threshold is set', () => {
    expect(locationFlags({ point: { lat: 17.441, lng: 78.38 }, reference: pin, radiusM: 200, accuracyThresholdM: null }).flags).toEqual([]);
    expect(locationFlags({ point: { lat: 17.45, lng: 78.38 }, reference: pin, radiusM: 200, accuracyThresholdM: null }).flags).toEqual(['OUTSIDE_RADIUS']);
    expect(locationFlags({ point: { lat: 17.44, lng: 78.38, accuracyM: 500 }, reference: pin, radiusM: 200, accuracyThresholdM: null }).flags).toEqual([]);
    expect(locationFlags({ point: { lat: 17.44, lng: 78.38, accuracyM: 500 }, reference: pin, radiusM: 200, accuracyThresholdM: 100 }).flags).toEqual(['LOW_ACCURACY']);
    expect(locationFlags({ point: null, reference: pin, radiusM: 200, accuracyThresholdM: null }).flags).toEqual(['NO_LOCATION']);
    expect(locationFlags({ point: { lat: 1, lng: 1 }, reference: null, radiusM: 200, accuracyThresholdM: null }).flags).toEqual(['NO_REFERENCE_PIN']);
  });
});

const NOGRANTS = '33333333-3333-4333-8333-333333333333';
const VIEWER = '88888888-8888-4888-8888-888888888888';
const app = createApp(
  fakeDeps({
    [NOGRANTS]: { status: 'ACTIVE', actor: actor({ id: NOGRANTS }) },
    [VIEWER]: { status: 'ACTIVE', actor: actor({ id: VIEWER, grants: ['attendance:view'] }) },
  }),
);
const ID = '11111111-1111-4111-8111-111111111111';
const auth = (id: string) => ({ Authorization: `Bearer token:aal2:${id}` });

describe('attendance permissions', () => {
  it('needs attendance:view to list and attendance:approve to decide', async () => {
    expect((await request(app).get('/v1/admin/attendance').set(auth(NOGRANTS))).status).toBe(403);
    expect((await request(app).post(`/v1/admin/attendance-corrections/${ID}/decide`).set(auth(VIEWER)).send({ decision: 'APPROVED', note: 'ok ok' })).status).toBe(403);
    expect((await request(app).post(`/v1/admin/visits/${ID}/worker-no-show`).set(auth(VIEWER)).send({ note: 'absent' })).status).toBe(403);
  });
  it('worker check-in requires an Employee ID session', async () => {
    expect((await request(app).post(`/v1/employee/visits/${ID}/check-in`).send({})).status).toBe(401);
  });
});
