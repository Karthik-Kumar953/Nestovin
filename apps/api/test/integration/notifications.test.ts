import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { withTx, type Database } from '../../src/db/database';
import type { EmailSender, PushSender } from '../../src/integrations/messaging';
import { SYSTEM_CLAIMS } from '../../src/modules/bookings/payments';
import { NotificationService, notify } from '../../src/modules/notifications/service';
import { adminPool, appDatabase, databaseAvailable } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

/* RES-13 / EMP-10: outbox -> in-app inbox (+ push when configured), device tokens, read state. */

const available = await databaseAvailable();

describe.skipIf(!available)('notifications', { timeout: 90_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  const A = randomUUID();
  const B = randomUUID();
  const pushed: { tokens: string[]; title: string }[] = [];
  const push: PushSender = {
    async send(tokens, message) {
      pushed.push({ tokens, title: message.title });
      return { invalidTokens: tokens.filter((t) => t.startsWith('dead')) };
    },
  };
  const emails: string[] = [];
  const email: EmailSender = { async send(to) { emails.push(to); } };

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    for (const id of [A, B]) {
      const ph = `+9189${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
      await admin.query(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [id, ph.slice(1)]);
      await admin.query(`insert into app.resident_profiles (id, phone) values ($1, $2)`, [id, ph]);
    }
  });

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ residentIds: [A, B] });
  }, 180_000);

  it('delivers to the inbox and to registered devices; dead tokens are removed', async () => {
    const svc = new NotificationService(db, push, email);
    await svc.registerDevice({ kind: 'resident', id: A }, `live-token-${A}`, 'android');
    await svc.registerDevice({ kind: 'resident', id: A }, `dead-token-${A}`, 'ios');
    await withTx(db, SYSTEM_CLAIMS, (trx) => notify(trx, 'residence.verified', A, {}, `test.verified:${A}`));
    // Drain (other suites may have queued rows too).
    for (let i = 0; i < 10; i++) {
      const r = await svc.processOutbox(200);
      if (r.sent + r.skipped + r.failed === 0) break;
    }
    const inbox = await svc.inbox({ kind: 'resident', id: A }, false);
    expect(inbox.items[0]).toMatchObject({ eventType: 'residence.verified', title: 'Residence verified', readAt: null });
    expect(inbox.unread).toBe(1);
    expect(pushed.some((p) => p.tokens.includes(`live-token-${A}`) && p.title === 'Residence verified')).toBe(true);
    const { rows } = await admin.query(`select token from app.device_tokens where owner_id = $1`, [A]);
    expect(rows.map((r: { token: string }) => r.token)).toEqual([`live-token-${A}`]);
  });

  it('inbox is private and read state is per recipient', async () => {
    const svc = new NotificationService(db);
    expect((await svc.inbox({ kind: 'resident', id: B }, false)).items).toHaveLength(0);
    const after = await svc.markRead({ kind: 'resident', id: A }, 'all');
    expect(after.unread).toBe(0);
    await expect(svc.markRead({ kind: 'resident', id: B }, after.items[0]!.id)).rejects.toThrow(/not found/);
  });

  it('a device token moves to whoever signed in last on that phone', async () => {
    const svc = new NotificationService(db);
    await svc.registerDevice({ kind: 'resident', id: B }, `live-token-${A}`, 'android');
    const { rows } = await admin.query(`select owner_id from app.device_tokens where token = $1`, [`live-token-${A}`]);
    expect(rows[0].owner_id).toBe(B);
  });

  it('without providers: push rows still reach the inbox; email rows are skipped', async () => {
    const svc = new NotificationService(db, null, null);
    await withTx(db, SYSTEM_CLAIMS, async (trx) => {
      await notify(trx, 'ticket.replied', B, { ticketId: 'x' }, `test.reply:${B}`);
      await trx.insertInto('app.notification_outbox').values({ event_type: 'website_enquiry.received', dedupe_key: `test.email:${B}`, channel: 'EMAIL', recipient: 'support@example.test', payload: JSON.stringify({ reference: 'ENQ-1' }) }).execute();
    });
    for (let i = 0; i < 10; i++) {
      const r = await svc.processOutbox(200);
      if (r.sent + r.skipped + r.failed === 0) break;
    }
    expect((await svc.inbox({ kind: 'resident', id: B }, true)).items.some((n) => n.eventType === 'ticket.replied')).toBe(true);
    const { rows } = await admin.query(`select status from app.notification_outbox where dedupe_key = $1`, [`test.email:${B}`]);
    expect(rows[0].status).toBe('SKIPPED');
  });
});
