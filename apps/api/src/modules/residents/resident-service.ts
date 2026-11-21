import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type {
  ExpansionVoteInput,
  FamilyRequestInput,
  Household,
  RegisterResidenceInput,
  ReplaceResidenceDocumentInput,
  ResidenceRegistrationResult,
  ResidentCatalogue,
  ResidentMe,
  UpdateResidentMeInput,
} from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import type { StorageAdapter } from '../../integrations/storage';
import { businessRule, conflict, fromPgError, notFound, versionConflict } from '../../lib/errors';
import { auditResident } from '../audit/audit';
import { residentClaims, type ResidentActor } from './auth';
import { activeMembership, iso, membershipQuery, toMembership } from './queries';

export const DOCUMENT_BUCKET = 'resident-documents';
const UPLOAD_TTL_SECONDS = 2 * 60 * 60; // Supabase signed upload tokens are valid for 2 hours
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/**
 * Resident-facing onboarding (RES-01..06, RES-14; ADR-012). Every query runs
 * with resident claims, so RLS limits rows to the resident and their household.
 */
export class ResidentService {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageAdapter,
  ) {}

  private tx<T>(actor: ResidentActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, residentClaims(actor), fn);
  }

  // ------------------------------------------------------------------- me

  async me(actor: ResidentActor): Promise<ResidentMe> {
    return this.tx(actor, (trx) => this.loadMe(trx, actor.id));
  }

  private async loadMe(trx: Tx, residentId: string): Promise<ResidentMe> {
    const p = await trx.selectFrom('app.resident_profiles').selectAll().where('id', '=', residentId).executeTakeFirstOrThrow();
    const active = await activeMembership(trx, residentId);
    // Show the latest outcome (including a rejection the resident must act on).
    const latest =
      active ??
      (await membershipQuery(trx).where('m.resident_id', '=', residentId).orderBy('m.created_at', 'desc').executeTakeFirst());
    let verification: ResidentMe['verification'] = null;
    if (latest) {
      const v = await trx
        .selectFrom('app.residence_verification_requests as v')
        .innerJoin('app.documents as d', 'd.id', 'v.document_id')
        .select(['v.decision', 'v.reason', 'd.status as doc_status'])
        .where('v.membership_id', '=', latest.id)
        .executeTakeFirst();
      if (v) {
        verification = {
          decision: v.decision,
          reason: v.reason,
          documentUploaded: v.doc_status === 'UPLOADED',
          flat: { flatId: latest.flat_id, flatNumber: latest.flat_number, towerName: latest.tower_name, communityId: latest.community_id, communityName: latest.community_name, occupancy: latest.occupancy },
        };
      }
    }
    return {
      id: p.id,
      phone: p.phone,
      fullName: p.full_name,
      email: p.email,
      status: p.status,
      membership: active ? toMembership(active) : null,
      verification,
      version: p.version,
    };
  }

  async updateMe(actor: ResidentActor, requestId: string, input: UpdateResidentMeInput): Promise<ResidentMe> {
    return this.tx(actor, async (trx) => {
      const updated = await trx
        .updateTable('app.resident_profiles')
        .set({
          ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        })
        .where('id', '=', actor.id)
        .where('version', '=', input.version)
        .returning('id')
        .executeTakeFirst();
      if (!updated) throw versionConflict();
      await auditResident(trx, actor.id, requestId, { action: 'resident.profile_updated', targetType: 'resident', targetId: actor.id });
      return this.loadMe(trx, actor.id);
    });
  }

  // ------------------------------------------------------------ locations

  /** Cities that have at least one community open to residents. */
  async cities(actor: ResidentActor) {
    return this.tx(actor, async (trx) => {
      const rows = await trx
        .selectFrom('app.cities as ci')
        .select(['ci.id', 'ci.name', 'ci.state'])
        .where('ci.status', '=', 'ACTIVE')
        .where((eb) =>
          eb.exists(
            eb.selectFrom('app.communities as c').whereRef('c.city_id', '=', 'ci.id').where('c.status', '=', 'ACTIVE').select(sql`1`.as('one')),
          ),
        )
        .orderBy('ci.name')
        .execute();
      return rows;
    });
  }

  async communities(actor: ResidentActor, cityId: string) {
    return this.tx(actor, (trx) =>
      trx
        .selectFrom('app.communities')
        .select(['id', 'name', 'address_line as addressLine'])
        .where('city_id', '=', cityId)
        .where('status', '=', 'ACTIVE')
        .orderBy('name')
        .execute(),
    );
  }

  async towers(actor: ResidentActor, communityId: string) {
    return this.tx(actor, async (trx) => {
      const c = await trx.selectFrom('app.communities').select('status').where('id', '=', communityId).executeTakeFirst();
      if (!c || c.status !== 'ACTIVE') throw notFound('Community');
      return trx
        .selectFrom('app.towers')
        .select(['id', 'name'])
        .where('community_id', '=', communityId)
        .where('status', '=', 'ACTIVE')
        .orderBy(sql`lower(name)`)
        .execute();
    });
  }

  async flats(actor: ResidentActor, towerId: string) {
    return this.tx(actor, async (trx) => {
      const t = await trx
        .selectFrom('app.towers as t')
        .innerJoin('app.communities as c', 'c.id', 't.community_id')
        .select(['t.status as tower_status', 'c.status as community_status'])
        .where('t.id', '=', towerId)
        .executeTakeFirst();
      if (!t || t.tower_status !== 'ACTIVE' || t.community_status !== 'ACTIVE') throw notFound('Tower');
      return trx
        .selectFrom('app.flats')
        .select(['id', 'flat_number as flatNumber', 'floor'])
        .where('tower_id', '=', towerId)
        .where('status', '=', 'ACTIVE')
        .orderBy(sql`lower(flat_number)`)
        .execute();
    });
  }

  async vote(actor: ResidentActor, requestId: string, input: ExpansionVoteInput) {
    return this.tx(actor, async (trx) => {
      let values: { level: 'CITY' | 'COMMUNITY'; city_id: string | null; city_name: string; community_name: string | null };
      if (input.level === 'CITY') {
        values = { level: 'CITY', city_id: null, city_name: input.cityName, community_name: null };
      } else {
        const city = await trx.selectFrom('app.cities').select(['id', 'name']).where('id', '=', input.cityId).where('status', '=', 'ACTIVE').executeTakeFirst();
        if (!city) throw notFound('City');
        values = { level: 'COMMUNITY', city_id: city.id, city_name: city.name, community_name: input.communityName };
      }
      await trx
        .insertInto('app.expansion_votes')
        .values({ resident_user_id: actor.id, ...values })
        .execute()
        .catch((err: unknown) => {
          const pg = fromPgError(err);
          if (pg?.code === 'CONFLICT') throw conflict('You have already voted for this location');
          throw err;
        });
      await auditResident(trx, actor.id, requestId, { action: 'expansion.voted', targetType: 'expansion_vote', targetId: null, after: values });
      return { recorded: true };
    });
  }

  // ------------------------------------------------------------ residence

  async registerResidence(actor: ResidentActor, requestId: string, input: RegisterResidenceInput): Promise<ResidenceRegistrationResult> {
    return this.tx(actor, async (trx) => {
      if (await activeMembership(trx, actor.id)) {
        throw businessRule('You already have a residence registered or waiting for verification');
      }
      const flat = await trx
        .selectFrom('app.flats as f')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .innerJoin('app.communities as c', 'c.id', 'f.community_id')
        .select(['f.id', 'f.status as flat_status', 't.status as tower_status', 'c.status as community_status'])
        .where('f.id', '=', input.flatId)
        .executeTakeFirst();
      if (!flat || flat.flat_status !== 'ACTIVE' || flat.tower_status !== 'ACTIVE' || flat.community_status !== 'ACTIVE') {
        throw notFound('Flat');
      }

      const membership = await trx
        .insertInto('app.residence_memberships')
        .values({ resident_id: actor.id, flat_id: input.flatId, kind: 'PRIMARY', occupancy: input.occupancy })
        .returning(['id', 'community_id', 'cluster_id'])
        .executeTakeFirstOrThrow();

      const key = `residence/${membership.id}/${randomUUID()}.${EXT[input.document.mimeType]}`;
      const doc = await trx
        .insertInto('app.documents')
        .values({
          owner_type: 'RESIDENCE_VERIFICATION',
          owner_id: membership.id,
          doc_type: input.document.docType,
          bucket: DOCUMENT_BUCKET,
          storage_key: key,
          file_name: input.document.fileName,
          mime_type: input.document.mimeType,
          uploaded_by: actor.id,
          community_id: membership.community_id,
          cluster_id: membership.cluster_id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('app.residence_verification_requests')
        .values({ membership_id: membership.id, document_id: doc.id, community_id: membership.community_id, cluster_id: membership.cluster_id })
        .execute();

      const upload = await this.storage.createSignedUpload(DOCUMENT_BUCKET, key);
      await auditResident(trx, actor.id, requestId, {
        action: 'residence.registered',
        targetType: 'residence_membership',
        targetId: membership.id,
        after: { flatId: input.flatId, occupancy: input.occupancy, docType: input.document.docType },
      });
      return {
        membershipId: membership.id,
        upload: { documentId: doc.id, uploadUrl: upload.signedUrl, token: upload.token, path: upload.path, expiresInSeconds: UPLOAD_TTL_SECONDS },
      };
    });
  }

  /**
   * A fresh upload target for the caller's PENDING registration whose document
   * never finished uploading. Uses a new storage key so a half-written object
   * from the failed attempt is never mistaken for the new file. 409 once a
   * document is uploaded or the review is decided.
   */
  async replaceResidenceDocument(actor: ResidentActor, requestId: string, input: ReplaceResidenceDocumentInput): Promise<ResidenceRegistrationResult> {
    return this.tx(actor, async (trx) => {
      const m = await activeMembership(trx, actor.id);
      if (!m || m.status !== 'PENDING' || m.kind !== 'PRIMARY') throw conflict('There is no pending registration waiting for a document');
      const v = await trx
        .selectFrom('app.residence_verification_requests as v')
        .innerJoin('app.documents as d', 'd.id', 'v.document_id')
        .select(['v.decision', 'd.id as document_id', 'd.status as doc_status'])
        .where('v.membership_id', '=', m.id)
        .executeTakeFirst();
      if (!v || v.decision !== 'PENDING') throw conflict('This registration has already been reviewed');
      if (v.doc_status === 'UPLOADED') throw conflict('Your document is already uploaded and waiting for review');
      const key = `residence/${m.id}/${randomUUID()}.${EXT[input.document.mimeType]}`;
      await trx
        .updateTable('app.documents')
        .set({ doc_type: input.document.docType, storage_key: key, file_name: input.document.fileName, mime_type: input.document.mimeType })
        .where('id', '=', v.document_id)
        .where('status', '=', 'PENDING_UPLOAD')
        .execute();
      const upload = await this.storage.createSignedUpload(DOCUMENT_BUCKET, key);
      await auditResident(trx, actor.id, requestId, { action: 'residence.document_replaced', targetType: 'document', targetId: v.document_id, after: { docType: input.document.docType } });
      return {
        membershipId: m.id,
        upload: { documentId: v.document_id, uploadUrl: upload.signedUrl, token: upload.token, path: upload.path, expiresInSeconds: UPLOAD_TTL_SECONDS },
      };
    });
  }

  /** After the app uploads the file: confirm it exists and matches what was declared. */
  async completeDocument(actor: ResidentActor, requestId: string, documentId: string): Promise<ResidentMe> {
    return this.tx(actor, async (trx) => {
      const doc = await trx
        .selectFrom('app.documents')
        .selectAll()
        .where('id', '=', documentId)
        .where('uploaded_by', '=', actor.id)
        .executeTakeFirst();
      if (!doc) throw notFound('Document');
      if (doc.status === 'UPLOADED') return this.loadMe(trx, actor.id);
      const obj = await this.storage.stat(doc.bucket, doc.storage_key);
      if (!obj) throw businessRule('The file has not been uploaded yet. Upload it and try again.');
      if (obj.mimeType && obj.mimeType !== doc.mime_type) throw businessRule('The uploaded file type does not match. Upload a PDF, JPEG or PNG.');
      if (obj.sizeBytes <= 0 || obj.sizeBytes > 5 * 1024 * 1024) throw businessRule('The file must be smaller than 5 MB');
      await trx
        .updateTable('app.documents')
        .set({ status: 'UPLOADED', size_bytes: obj.sizeBytes, uploaded_at: sql`now()` })
        .where('id', '=', documentId)
        .execute();
      await auditResident(trx, actor.id, requestId, { action: 'document.uploaded', targetType: 'document', targetId: documentId });
      return this.loadMe(trx, actor.id);
    });
  }

  // ------------------------------------------------------------ household

  private async verifiedMembership(trx: Tx, actor: ResidentActor) {
    const m = await activeMembership(trx, actor.id);
    if (!m || m.status !== 'VERIFIED') throw businessRule('Your residence must be verified first');
    return m;
  }

  async household(actor: ResidentActor): Promise<Household> {
    return this.tx(actor, async (trx) => {
      const mine = await this.verifiedMembership(trx, actor);
      const members = await trx
        .selectFrom('app.residence_memberships as m')
        .innerJoin('app.resident_profiles as p', 'p.id', 'm.resident_id')
        .select(['m.id', 'm.resident_id', 'm.kind', 'm.status', 'p.full_name', 'p.phone'])
        .where('m.flat_id', '=', mine.flat_id)
        .where('m.status', 'in', ['PENDING', 'VERIFIED'])
        .orderBy('m.kind', 'desc')
        .execute();
      const isPrimary = mine.kind === 'PRIMARY';
      const requests = isPrimary
        ? await trx
            .selectFrom('app.family_access_requests')
            .selectAll()
            .where('primary_membership_id', '=', mine.id)
            .orderBy('created_at', 'desc')
            .execute()
        : [];
      return {
        isPrimary,
        members: members.map((m) => ({
          membershipId: m.id,
          residentId: m.resident_id,
          fullName: m.full_name,
          phone: m.phone,
          kind: m.kind,
          status: m.status,
        })),
        requests: requests.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          phone: r.phone,
          relationship: r.relationship,
          status: r.status,
          reason: r.reason,
          createdAt: iso(r.created_at)!,
          reviewedAt: iso(r.reviewed_at as Date | null),
        })),
      };
    });
  }

  async requestFamily(actor: ResidentActor, requestId: string, input: FamilyRequestInput): Promise<Household> {
    await this.tx(actor, async (trx) => {
      const mine = await this.verifiedMembership(trx, actor);
      if (mine.kind !== 'PRIMARY') throw businessRule('Only the Primary Resident can add family members');
      if (input.phone === actor.phone) throw businessRule('You cannot add your own number');
      const already = await trx
        .selectFrom('app.residence_memberships as m')
        .innerJoin('app.resident_profiles as p', 'p.id', 'm.resident_id')
        .select('m.id')
        .where('m.flat_id', '=', mine.flat_id)
        .where('m.status', 'in', ['PENDING', 'VERIFIED'])
        .where('p.phone', '=', input.phone)
        .executeTakeFirst();
      if (already) throw businessRule('This person is already part of your household');
      const row = await trx
        .insertInto('app.family_access_requests')
        .values({
          primary_membership_id: mine.id,
          requested_by: actor.id,
          phone: input.phone,
          full_name: input.fullName,
          relationship: input.relationship,
          community_id: mine.community_id,
          cluster_id: mine.cluster_id,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .catch((err: unknown) => {
          if (fromPgError(err)?.code === 'CONFLICT') throw conflict('A request for this number is already waiting for approval');
          throw err;
        });
      await auditResident(trx, actor.id, requestId, {
        action: 'family.requested',
        targetType: 'family_access_request',
        targetId: row.id,
        after: { relationship: input.relationship },
      });
    });
    return this.household(actor);
  }

  async cancelFamilyRequest(actor: ResidentActor, requestId: string, familyRequestId: string): Promise<Household> {
    await this.tx(actor, async (trx) => {
      const r = await trx
        .updateTable('app.family_access_requests')
        .set({ status: 'CANCELLED' })
        .where('id', '=', familyRequestId)
        .where('requested_by', '=', actor.id)
        .where('status', '=', 'PENDING')
        .returning('id')
        .executeTakeFirst();
      if (!r) throw notFound('Pending request');
      await auditResident(trx, actor.id, requestId, { action: 'family.request_cancelled', targetType: 'family_access_request', targetId: familyRequestId });
    });
    return this.household(actor);
  }

  /** Only the Primary Resident removes a family member (ADR-012). */
  async removeFamilyMember(actor: ResidentActor, requestId: string, membershipId: string): Promise<Household> {
    await this.tx(actor, async (trx) => {
      const mine = await this.verifiedMembership(trx, actor);
      if (mine.kind !== 'PRIMARY') throw businessRule('Only the Primary Resident can remove family members');
      // SECURITY DEFINER helper: re-checks that the caller is this member's Primary (RLS would hide the revoked row).
      const r = await sql<{ n: number }>`select app.revoke_family_member(${membershipId}) as n`.execute(trx);
      if ((r.rows[0]?.n ?? 0) === 0) throw notFound('Family member');
      await auditResident(trx, actor.id, requestId, { action: 'family.removed', targetType: 'residence_membership', targetId: membershipId });
    });
    return this.household(actor);
  }

  // ------------------------------------------------------------ catalogue

  /** Published catalogue of the resident's community, filtered to their flat's category. */
  async catalogue(actor: ResidentActor): Promise<ResidentCatalogue> {
    return this.tx(actor, async (trx) => {
      const mine = await this.verifiedMembership(trx, actor);
      const category = mine.residence_category_id
        ? await trx.selectFrom('app.residence_categories').select(['id', 'label']).where('id', '=', mine.residence_category_id).executeTakeFirst()
        : undefined;
      const community = await trx.selectFrom('app.communities').select('default_operating_mode').where('id', '=', mine.community_id).executeTakeFirstOrThrow();
      const services = await trx
        .selectFrom('app.community_services as cs')
        .innerJoin('app.services as s', 's.id', 'cs.service_id')
        .select(['s.id', 's.code', 's.name', 'cs.operating_mode'])
        .where('cs.community_id', '=', mine.community_id)
        .where('cs.enabled', '=', true)
        .orderBy('s.sort')
        .execute();
      const version = await trx
        .selectFrom('app.catalogue_versions')
        .select(['id', 'version_no'])
        .where('community_id', '=', mine.community_id)
        .where('status', '=', 'PUBLISHED')
        .executeTakeFirst();

      const base: ResidentCatalogue = {
        communityId: mine.community_id,
        residenceCategory: category ?? null,
        versionNo: version?.version_no ?? null,
        services: services.map((s) => ({ serviceId: s.id, code: s.code, name: s.name, operatingMode: s.operating_mode ?? community.default_operating_mode })),
        plans: [],
      };
      if (!version || !category) return base;

      const prices = await trx
        .selectFrom('app.plan_prices')
        .select(['plan_id', 'price_basis', 'service_id', 'amount_paise'])
        .where('catalogue_version_id', '=', version.id)
        .where('residence_category_id', '=', category.id)
        .execute();
      const planIds = [...new Set(prices.map((p) => p.plan_id))];
      if (planIds.length === 0) return base;

      const plans = await trx.selectFrom('app.plans').selectAll().where('id', 'in', planIds).orderBy('sort').orderBy('name').execute();
      const comps = await trx
        .selectFrom('app.plan_components as c')
        .innerJoin('app.services as s', 's.id', 'c.service_id')
        .leftJoin('app.time_windows as w', 'w.id', 'c.time_window_id')
        .select([
          'c.id', 'c.plan_id', 'c.service_id', 's.name as service_name', 'c.is_optional_addon', 'c.visits_per_day', 'c.days_of_week',
          'c.duration_minutes', 'c.addon_hours', 'w.name as window_name', 'w.start_time', 'w.end_time',
        ])
        .where('c.plan_id', 'in', planIds)
        .orderBy('c.sort')
        .execute();
      const compIds = comps.map((c) => c.id);
      const tasks = compIds.length
        ? await trx
            .selectFrom('app.plan_component_tasks as pt')
            .innerJoin('app.service_tasks as t', 't.id', 'pt.service_task_id')
            .select(['pt.plan_component_id', 't.name', 'pt.frequency', 'pt.times_per_period'])
            .where('pt.plan_component_id', 'in', compIds)
            .execute()
        : [];
      const addonPrices = compIds.length
        ? await trx
            .selectFrom('app.plan_component_prices')
            .select(['plan_component_id', 'amount_paise'])
            .where('plan_component_id', 'in', compIds)
            .where('residence_category_id', '=', category.id)
            .execute()
        : [];
      const serviceName = new Map(services.map((s) => [s.id, s.name]));

      base.plans = plans.map((p) => {
        const pkg = prices.find((x) => x.plan_id === p.id && x.price_basis === 'PACKAGE');
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          validityDays: p.validity_days,
          packagePricePaise: pkg ? Number(pkg.amount_paise) : null,
          servicePrices: prices
            .filter((x) => x.plan_id === p.id && x.price_basis === 'SERVICE' && x.service_id)
            .map((x) => ({ serviceId: x.service_id!, name: serviceName.get(x.service_id!) ?? 'Service', pricePaise: Number(x.amount_paise) })),
          components: comps
            .filter((c) => c.plan_id === p.id)
            // An add-on with no price for this category is not offered to this flat.
            .filter((c) => !c.is_optional_addon || addonPrices.some((a) => a.plan_component_id === c.id))
            .map((c) => {
              const addon = addonPrices.find((a) => a.plan_component_id === c.id);
              return {
                id: c.id,
                serviceId: c.service_id,
                name: c.service_name,
                isOptionalAddon: c.is_optional_addon,
                visitsPerDay: c.visits_per_day,
                daysOfWeek: c.days_of_week,
                durationMinutes: c.duration_minutes,
                timeWindow: c.window_name ? { name: c.window_name, startTime: String(c.start_time).slice(0, 5), endTime: String(c.end_time).slice(0, 5) } : null,
                addonHours: c.addon_hours === null ? null : Number(c.addon_hours),
                addonPricePaise: addon ? Number(addon.amount_paise) : null,
                tasks: tasks
                  .filter((t) => t.plan_component_id === c.id)
                  .map((t) => ({ name: t.name, frequency: t.frequency, timesPerPeriod: t.times_per_period })),
              };
            }),
        };
      });
      return base;
    });
  }
}
