import { Router } from 'express';
import { createEnquirySchema, type CreateEnquiryInput, type EnquiryAccepted } from '@nestovin/contracts';
import type { AppDeps } from '../../http/context';
import { hashIp, rateLimit, validateBody } from '../../http/middleware';
import { withTx } from '../../db/database';
import { auditSystem } from '../audit/audit';

/**
 * WEB-05 / WEB-10: public website enquiry intake. Unauthenticated, so it is
 * rate-limited per IP and has a honeypot field. The enquiry is stored and an
 * outbox row routes it to the Support destination (delivered by the worker).
 * An enquiry never creates a resident account, booking or ticket.
 */
export function publicEnquiryRoutes(deps: AppDeps): Router {
  const r = Router();

  r.post(
    '/enquiries',
    rateLimit(deps, {
      name: 'enquiry',
      limit: 5,
      windowSeconds: 3600,
      keyFn: (req) => hashIp(req.ip, deps.env.IP_HASH_SALT),
    }),
    validateBody(createEnquirySchema),
    async (req, res) => {
      const input = req.body as CreateEnquiryInput;

      // Honeypot filled: pretend success, store nothing.
      if (input.website) {
        const fake: EnquiryAccepted = { reference: 'ENQ-RECEIVED' };
        res.status(202).json(fake);
        return;
      }

      const reference = await withTx(
        deps.db,
        { userId: null, actorKind: 'public', isSuperAdmin: false, clusterIds: [] },
        async (trx) => {
          const row = await trx
            .insertInto('app.website_enquiries')
            .values({
              name: input.name,
              phone: input.phone,
              email: input.email ?? null,
              city: input.city ?? null,
              community: input.community ?? null,
              message: input.message,
              consent_at: new Date(),
              source_ip_hash: hashIp(req.ip, deps.env.IP_HASH_SALT),
              user_agent: req.header('user-agent')?.slice(0, 300) ?? null,
            })
            .returning(['id', 'reference'])
            .executeTakeFirstOrThrow();

          if (deps.env.SUPPORT_ENQUIRY_EMAIL) {
            await trx
              .insertInto('app.notification_outbox')
              .values({
                event_type: 'website_enquiry.received',
                dedupe_key: `website_enquiry:${row.id}`,
                channel: 'EMAIL',
                recipient: deps.env.SUPPORT_ENQUIRY_EMAIL,
                // Only the reference goes in the payload; the worker loads details from the DB.
                payload: JSON.stringify({ enquiryId: row.id, reference: row.reference }),
              })
              .execute();
          }

          await auditSystem(trx, 'public', req.requestId, {
            action: 'enquiry.received',
            targetType: 'website_enquiry',
            targetId: row.id,
          });
          return row.reference;
        },
      );

      const body: EnquiryAccepted = { reference };
      res.status(202).json(body);
    },
  );

  return r;
}
