import { sql } from 'kysely';
import type { Database, DbClaims, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import type { EmailSender, PushSender } from '../../integrations/messaging';
import { businessRule } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { SYSTEM_CLAIMS } from '../bookings/payments';
import { render } from './templates';

/** Queue an in-app/push notification in the caller's transaction (never fails the business change). */
export async function notify(trx: Tx, eventType: string, recipientId: string, payload: Record<string, unknown>, dedupe?: string) {
  await trx
    .insertInto('app.notification_outbox')
    .values({
      event_type: eventType,
      dedupe_key: dedupe ?? `${eventType}:${recipientId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      channel: 'PUSH',
      recipient: recipientId,
      payload: JSON.stringify(payload),
    })
    .onConflict((oc) => oc.column('dedupe_key').doNothing())
    .execute();
}

export interface InboxItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

type Owner = { kind: 'resident' | 'employee'; id: string };
const claimsOf = (o: Owner): DbClaims => ({ userId: o.id, actorKind: o.kind, isSuperAdmin: false, clusterIds: [] });
const MAX_ATTEMPTS = 6;

/** RES-13 / EMP-10 inbox and device tokens, plus the delivery worker. */
/** The outbox columns the delivery worker needs. */
type OutboxRow = { id: string; event_type: string; channel: 'EMAIL' | 'SMS' | 'PUSH'; recipient: string; payload: unknown; attempts: number };

export class NotificationService {
  constructor(
    private readonly db: Database,
    private readonly push: PushSender | null = null,
    private readonly email: EmailSender | null = null,
    private readonly logger?: Logger,
  ) {}

  // ---------------------------------------------------------------- devices & inbox

  async registerDevice(owner: Owner, token: string, platform: 'android' | 'ios') {
    await withTx(this.db, claimsOf(owner), async (trx) => {
      // A token moves to whoever signed in last on that device.
      await sql`select app.release_device_token(${token})`.execute(trx);
      await trx
        .insertInto('app.device_tokens')
        .values({ owner_kind: owner.kind, owner_id: owner.id, token, platform })
        .onConflict((oc) => oc.column('token').doUpdateSet({ last_seen_at: sql`now()`, platform }))
        .execute();
    });
    return { registered: true as const };
  }

  async unregisterDevice(owner: Owner, token: string) {
    await withTx(this.db, claimsOf(owner), (trx) => trx.deleteFrom('app.device_tokens').where('token', '=', token).where('owner_id', '=', owner.id).execute());
    return { removed: true as const };
  }

  async inbox(owner: Owner, unreadOnly: boolean): Promise<{ items: InboxItem[]; unread: number }> {
    return withTx(this.db, claimsOf(owner), async (trx) => {
      let q = trx.selectFrom('app.notifications').selectAll().where('recipient_kind', '=', owner.kind).where('recipient_id', '=', owner.id);
      if (unreadOnly) q = q.where('read_at', 'is', null);
      const rows = await q.orderBy('created_at', 'desc').limit(100).execute();
      const unread = await trx
        .selectFrom('app.notifications')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('recipient_kind', '=', owner.kind)
        .where('recipient_id', '=', owner.id)
        .where('read_at', 'is', null)
        .executeTakeFirstOrThrow();
      return {
        items: rows.map((r) => ({ id: r.id, eventType: r.event_type, title: r.title, body: r.body, data: (r.data ?? {}) as Record<string, unknown>, readAt: r.read_at ? new Date(r.read_at).toISOString() : null, createdAt: new Date(r.created_at).toISOString() })),
        unread: Number(unread.n),
      };
    });
  }

  async markRead(owner: Owner, id: string | 'all') {
    await withTx(this.db, claimsOf(owner), async (trx) => {
      let q = trx.updateTable('app.notifications').set({ read_at: sql`now()` }).where('recipient_kind', '=', owner.kind).where('recipient_id', '=', owner.id).where('read_at', 'is', null);
      if (id !== 'all') q = q.where('id', '=', id);
      const r = await q.executeTakeFirst();
      if (id !== 'all' && r.numUpdatedRows === 0n) throw businessRule('Notification not found or already read');
    });
    return this.inbox(owner, false);
  }

  // ---------------------------------------------------------------- delivery worker

  /**
   * Processes due outbox rows. PUSH rows always create an inbox entry for the
   * resident/worker, then push to their devices when FCM is configured. EMAIL
   * rows go through Resend when configured, otherwise they are SKIPPED.
   * Failures retry with backoff and stop after 6 attempts (DEAD).
   */
  async processOutbox(limit = 50): Promise<{ sent: number; skipped: number; failed: number }> {
    // Claim due rows atomically (review H-5): concurrent workers skip rows another worker holds, and a
    // claim expires after 5 minutes so a crashed worker's rows are retried.
    const due = await withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
      const { rows } = await sql<OutboxRow>`
        update app.notification_outbox o
           set locked_until = now() + interval '5 minutes'
         where o.id in (
           select id from app.notification_outbox
            where status = 'PENDING' and next_attempt_at <= now()
              and (locked_until is null or locked_until < now())
            order by next_attempt_at
            limit ${limit}
            for update skip locked)
        returning o.id, o.event_type, o.channel, o.recipient, o.payload, o.attempts`.execute(trx);
      return rows;
    });
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of due) {
      try {
        const outcome = await this.deliver(row);
        await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
          trx
            .updateTable('app.notification_outbox')
            .set({ status: outcome.status, sent_at: outcome.status === 'SENT' ? sql`now()` : null, last_error: outcome.note ?? null, attempts: sql`attempts + 1`, locked_until: null })
            .where('id', '=', row.id)
            .execute(),
        );
        if (outcome.status === 'SENT') sent++;
        else skipped++;
      } catch (err) {
        failed++;
        const attempts = row.attempts + 1;
        const backoffMin = Math.min(60, 2 ** attempts);
        this.logger?.warn({ err, outboxId: row.id, eventType: row.event_type }, 'notification delivery failed');
        await withTx(this.db, SYSTEM_CLAIMS, (trx) =>
          trx
            .updateTable('app.notification_outbox')
            .set({
              attempts,
              status: attempts >= MAX_ATTEMPTS ? 'DEAD' : 'PENDING',
              next_attempt_at: new Date(Date.now() + backoffMin * 60_000),
              last_error: String((err as Error).message).slice(0, 500),
              locked_until: null,
            })
            .where('id', '=', row.id)
            .execute(),
        );
      }
    }
    return { sent, skipped, failed };
  }

  private async deliver(row: { id: string; event_type: string; channel: 'EMAIL' | 'SMS' | 'PUSH'; recipient: string; payload: unknown }): Promise<{ status: 'SENT' | 'SKIPPED'; note?: string }> {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const msg = render(row.event_type, payload);
    if (row.channel === 'EMAIL') {
      if (!this.email) return { status: 'SKIPPED', note: 'Email provider not configured' };
      await this.email.send(row.recipient, msg.title, msg.body);
      return { status: 'SENT' };
    }
    if (row.channel === 'SMS') return { status: 'SKIPPED', note: 'SMS notifications are not enabled' };

    // PUSH: recipient is a resident or employee id.
    const owner = await withTx(this.db, SYSTEM_CLAIMS, async (trx): Promise<Owner | null> => {
      const r = await trx.selectFrom('app.resident_profiles').select('id').where('id', '=', row.recipient).executeTakeFirst();
      if (r) return { kind: 'resident', id: r.id };
      const e = await trx.selectFrom('app.employees').select('id').where('id', '=', row.recipient).executeTakeFirst();
      return e ? { kind: 'employee', id: e.id } : null;
    });
    if (!owner) return { status: 'SKIPPED', note: 'Recipient not found' };
    const tokens = await withTx(this.db, SYSTEM_CLAIMS, async (trx) => {
      await trx
        .insertInto('app.notifications')
        .values({ recipient_kind: owner.kind, recipient_id: owner.id, outbox_id: row.id, event_type: row.event_type, title: msg.title, body: msg.body, data: JSON.stringify(payload) })
        .onConflict((oc) => oc.column('outbox_id').doNothing())
        .execute();
      return trx.selectFrom('app.device_tokens').select('token').where('owner_kind', '=', owner.kind).where('owner_id', '=', owner.id).execute();
    });
    if (!this.push || tokens.length === 0) return { status: 'SENT', note: this.push ? 'In-app only (no device)' : 'In-app only (push not configured)' };
    const data = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)]));
    const { invalidTokens } = await this.push.send(
      tokens.map((t) => t.token),
      { title: msg.title, body: msg.body, data: { ...data, eventType: row.event_type } },
    );
    if (invalidTokens.length) {
      await withTx(this.db, SYSTEM_CLAIMS, (trx) => trx.deleteFrom('app.device_tokens').where('token', 'in', invalidTokens).execute());
    }
    return { status: 'SENT' };
  }
}
