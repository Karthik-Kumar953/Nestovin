import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import type { AppDeps } from '../../src/http/context';
import { idempotent } from '../../src/http/idempotency';
import { createLogger } from '../../src/lib/logger';
import { appDatabase, databaseAvailable } from '../helpers/db';

/* Review H-4 / ADR-004: money POSTs replay instead of repeating. */
const available = await databaseAvailable();

describe.skipIf(!available)('idempotency keys', { timeout: 60_000 }, () => {
  const db = appDatabase();
  const deps = { db, logger: createLogger('error', false) } as unknown as AppDeps;
  const residentId = randomUUID();
  let created = 0;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { resident: { id: string; phone: string } }).resident = { id: residentId, phone: '+910000000000' };
    next();
  });
  app.post('/book', idempotent(deps, { required: true }), (req, res) => {
    created++;
    res.status(201).json({ bookingId: `b-${created}`, echo: req.body });
  });
  app.post('/boom', idempotent(deps, { required: true }), (_req, res) => {
    res.status(503).json({ error: 'try later' });
  });
  // Minimal error handler mirroring the API envelope.
  app.use((err: { status?: number; code?: string; message: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.status ?? 500).json({ error: { code: err.code, message: err.message } });
  });

  afterAll(async () => {
    await db.deleteFrom('app.idempotency_keys').where('actor_id', '=', residentId).execute();
    await db.destroy();
  });

  it('requires a key', async () => {
    expect((await request(app).post('/book').send({ a: 1 })).status).toBe(422);
  });

  it('replays the first response for the same key and body, without running the handler again', async () => {
    const key = `k-${randomUUID()}`;
    const first = await request(app).post('/book').set('Idempotency-Key', key).send({ plan: 'x' });
    expect(first.status).toBe(201);
    await new Promise((r) => setTimeout(r, 200)); // the response is stored just after it is sent
    const again = await request(app).post('/book').set('Idempotency-Key', key).send({ plan: 'x' });
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(created).toBe(1);
  });

  it('rejects the same key with a different body', async () => {
    const key = `k-${randomUUID()}`;
    await request(app).post('/book').set('Idempotency-Key', key).send({ plan: 'x' });
    await new Promise((r) => setTimeout(r, 200));
    expect((await request(app).post('/book').set('Idempotency-Key', key).send({ plan: 'y' })).status).toBe(422);
  });

  it('releases the key after a server error so the client can retry', async () => {
    const key = `k-${randomUUID()}`;
    expect((await request(app).post('/boom').set('Idempotency-Key', key).send({})).status).toBe(503);
    await new Promise((r) => setTimeout(r, 200));
    const row = await db.selectFrom('app.idempotency_keys').select('key').where('actor_id', '=', residentId).where('key', '=', key).executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
