import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { AppError } from '../../src/lib/errors';
import type { Database } from '../../src/db/database';
import type { StorageAdapter } from '../../src/integrations/storage';
import { LocationService } from '../../src/modules/locations/service';
import { ResidentService } from '../../src/modules/residents/resident-service';
import { ResidentAdminService } from '../../src/modules/residents/admin-service';
import { SupportService } from '../../src/modules/support/service';
import type { ResidentActor } from '../../src/modules/residents/auth';
import { actor } from '../helpers/fake-deps';
import { adminPool, appDatabase, appPool, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

/*
 * Phase 3 (ADR-012): residence verification, household access, family
 * attachment and support tickets, against the real database with RLS on.
 */

const available = await databaseAvailable();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

const fakeStorage: StorageAdapter = {
  async createSignedUpload(_bucket, path) {
    return { signedUrl: `https://storage.test/${path}`, token: 'tok', path };
  },
  async stat() {
    return { sizeBytes: 2048, mimeType: 'application/pdf' };
  },
  async createSignedDownload(_bucket, path) {
    return `https://storage.test/download/${path}`;
  },
};

const doc = { docType: 'ELECTRICITY_BILL' as const, fileName: 'bill.pdf', mimeType: 'application/pdf' as const, sizeBytes: 2048 };

describe.skipIf(!available)('residents, household and support (Phase 3)', { timeout: 60_000 }, () => {
  let db: Database;
  let admin: pg.Pool;
  let app: pg.Pool;
  let residents: ResidentService;
  let radmin: ResidentAdminService;
  let support: SupportService;
  const s = uniq();
  const root = actor({ id: randomUUID(), scope: { type: 'GLOBAL' } });
  let c1: string;
  let c2: string;
  let flat1: string;
  let flat2: string;
  let ownerAdminId: string;
  let categoryId: string;

  const phone = () => `+9198${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const A: ResidentActor = { id: randomUUID(), phone: phone() };
  const B: ResidentActor = { id: randomUUID(), phone: phone() };
  const F: ResidentActor = { id: randomUUID(), phone: phone() };
  const O: ResidentActor = { id: randomUUID(), phone: phone() };
  const north = () => actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c1] } });
  const south = () => actor({ id: randomUUID(), scope: { type: 'CLUSTERS', clusterIds: [c2] } });

  let verificationA: string;
  let documentA: string;
  let ticketId: string;

  beforeAll(async () => {
    db = appDatabase();
    admin = adminPool();
    app = appPool(2);
    residents = new ResidentService(db, fakeStorage);
    radmin = new ResidentAdminService(db, fakeStorage);
    support = new SupportService(db);
    const loc = new LocationService(db);

    const cityId = (await loc.createCity(root, 't', { name: `P3 City ${s}`, state: 'Telangana' })).id;
    c1 = (await loc.createCluster(root, 't', { name: `P3 North ${s}`, code: `PN${s}` })).id;
    c2 = (await loc.createCluster(root, 't', { name: `P3 South ${s}`, code: `PS${s}` })).id;
    const comm1 = (await loc.createCommunity(root, 't', { cityId, name: `P3 Alpha ${s}`, code: `PA${s}`, clusterId: c1 })).id;
    const comm2 = (await loc.createCommunity(root, 't', { cityId, name: `P3 Beta ${s}`, code: `PB${s}`, clusterId: c2 })).id;
    const t1 = (await loc.createTower(root, 't', { communityId: comm1, name: 'A' })).id;
    const t2 = (await loc.createTower(root, 't', { communityId: comm2, name: 'B' })).id;
    flat1 = (await loc.createFlat(root, 't', { towerId: t1, flatNumber: '101' })).id;
    flat2 = (await loc.createFlat(root, 't', { towerId: t2, flatNumber: '201' })).id;
    // Activation (catalogue + checklist) is covered by the community-setup suite.
    await admin.query(`update app.communities set status = 'ACTIVE' where id = any($1)`, [[comm1, comm2]]);

    for (const r of [A, B, F, O]) {
      await admin.query(`insert into auth.users (id, phone, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [r.id, r.phone.slice(1)]);
      await admin.query(`insert into app.resident_profiles (id, phone, full_name) values ($1, $2, $3)`, [r.id, r.phone, `Resident ${r.id.slice(0, 4)}`]);
    }
    ownerAdminId = randomUUID();
    await admin.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      ownerAdminId,
      `p3-owner-${s.toLowerCase()}@example.test`,
    ]);
    await admin.query(
      `insert into app.admin_profiles (id, email, full_name, is_super_admin, status, scope_type)
       values ($1, (select email from auth.users where id = $1), 'Support Owner', false, 'ACTIVE', 'GLOBAL')`,
      [ownerAdminId],
    );
    categoryId = (await support.categories(db, true))[0]!.id;
  });

  afterAll(async () => {
    await db?.destroy();
    await admin?.end();
    await app?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s });
  }, 180_000);

  it('registers a residence as PENDING with a document awaiting upload', async () => {
    const res = await residents.registerResidence(A, 't', { flatId: flat1, occupancy: 'OWNER', document: doc });
    documentA = res.upload.documentId;
    expect(res.upload.path).toMatch(new RegExp(`^residence/${res.membershipId}/`));
    const me = await residents.me(A);
    expect(me.membership).toMatchObject({ status: 'PENDING', kind: 'PRIMARY', flatId: flat1 });
    expect(me.verification).toMatchObject({ decision: 'PENDING', documentUploaded: false, flat: { flatId: flat1, occupancy: 'OWNER' } });
    await expectCode(residents.registerResidence(A, 't', { flatId: flat2, occupancy: 'OWNER', document: doc }), 'BUSINESS_RULE_VIOLATION');
  });

  it('a failed upload can be retried with a fresh upload target for the same document', async () => {
    const before = await admin.query(`select storage_key from app.documents where id = $1`, [documentA]);
    const retry = await residents.replaceResidenceDocument(A, 't', { document: { ...doc, docType: 'OWNERSHIP_PROOF', fileName: 'deed.pdf' } });
    expect(retry.upload.documentId).toBe(documentA);
    const after = await admin.query(`select storage_key, doc_type, file_name from app.documents where id = $1`, [documentA]);
    expect(after.rows[0]).toMatchObject({ doc_type: 'OWNERSHIP_PROOF', file_name: 'deed.pdf' });
    expect(after.rows[0].storage_key).not.toBe(before.rows[0].storage_key);
    expect(retry.upload.path).toBe(after.rows[0].storage_key);
    await expectCode(residents.replaceResidenceDocument(B, 't', { document: doc }), 'CONFLICT'); // nothing pending
  });

  it('a resident cannot confirm someone else’s document', async () => {
    await expectCode(residents.completeDocument(B, 't', documentA), 'NOT_FOUND');
  });

  it('the queue shows a registration only after its document is uploaded, and only in scope', async () => {
    expect((await radmin.verifications(north(), { decision: 'PENDING', limit: 100 })).some((v) => v.document.id === documentA)).toBe(false);
    const me = await residents.completeDocument(A, 't', documentA);
    expect(me.verification?.documentUploaded).toBe(true);
    const queue = await radmin.verifications(north(), { decision: 'PENDING', limit: 100 });
    const mine = queue.find((v) => v.document.id === documentA);
    expect(mine).toBeDefined();
    verificationA = mine!.id;
    expect((await radmin.verifications(south(), { decision: 'PENDING', limit: 100 })).some((v) => v.id === verificationA)).toBe(false);
    await expectCode(radmin.approveVerification(south(), 't', verificationA), 'NOT_FOUND');
    await expectCode(radmin.documentUrl(south(), 't', documentA), 'NOT_FOUND');
    expect((await radmin.documentUrl(north(), 't', documentA)).expiresInSeconds).toBe(60);
  });

  it('approval makes the resident the Primary Resident', async () => {
    await radmin.approveVerification(north(), 't', verificationA);
    expect((await residents.me(A)).membership).toMatchObject({ status: 'VERIFIED', kind: 'PRIMARY' });
    await expectCode(radmin.approveVerification(north(), 't', verificationA), 'BUSINESS_RULE_VIOLATION');
  });

  it('a flat keeps a single verified Primary Resident', async () => {
    const res = await residents.registerResidence(B, 't', { flatId: flat1, occupancy: 'TENANT', document: doc });
    await residents.completeDocument(B, 't', res.upload.documentId);
    const v = (await radmin.verifications(north(), { decision: 'PENDING', limit: 100 })).find((x) => x.document.id === res.upload.documentId)!;
    expect(v.flatHasPrimary).toBe(true);
    await expectCode(radmin.approveVerification(north(), 't', v.id), 'BUSINESS_RULE_VIOLATION');
    await radmin.rejectVerification(north(), 't', v.id, 'Flat already has a Primary Resident');
    const meB = await residents.me(B);
    expect(meB.membership).toBeNull();
    expect(meB.verification).toMatchObject({ decision: 'REJECTED' });
  });

  it('RLS hides other households’ rows even without the service’s own filters', async () => {
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('app.user_id', $1, true), set_config('app.actor_kind', 'resident', true)`, [O.id]);
      const docs = await client.query(`select id from app.documents where id = $1`, [documentA]);
      const members = await client.query(`select id from app.residence_memberships where resident_id = $1`, [A.id]);
      const profile = await client.query(`select id from app.resident_profiles where id = $1`, [A.id]);
      expect([docs.rowCount, members.rowCount, profile.rowCount]).toEqual([0, 0, 0]);
      await client.query('rollback');
    } finally {
      client.release();
    }
  });

  it('family: only the Primary requests; approval attaches an existing account', async () => {
    await expectCode(residents.requestFamily(O, 't', { fullName: 'Nobody', phone: F.phone, relationship: 'Friend' }), 'BUSINESS_RULE_VIOLATION');
    const hh = await residents.requestFamily(A, 't', { fullName: 'Family Member', phone: F.phone, relationship: 'Spouse' });
    const req = hh.requests.find((r) => r.status === 'PENDING')!;
    await expectCode(residents.requestFamily(A, 't', { fullName: 'Family Member', phone: F.phone, relationship: 'Spouse' }), 'CONFLICT');
    expect((await radmin.familyRequests(south(), { status: 'PENDING', limit: 100 })).some((r) => r.id === req.id)).toBe(false);
    await expectCode(radmin.approveFamily(south(), 't', req.id, { physicalVerificationDone: true }), 'NOT_FOUND');
    const out = await radmin.approveFamily(north(), 't', req.id, { physicalVerificationDone: true });
    expect(out.attachedNow).toBe(true);
    const meF = await residents.me(F);
    expect(meF.membership).toMatchObject({ kind: 'FAMILY', status: 'VERIFIED', flatId: flat1 });
    const household = await residents.household(F);
    expect(household.isPrimary).toBe(false);
    expect(household.members.map((m) => m.kind).sort()).toEqual(['FAMILY', 'PRIMARY']);
  });

  it('tickets are shared within the household and hidden from others', async () => {
    const t = await support.residentCreate(A, 't', { categoryId, subject: 'Maid arrived late', description: 'Arrived 40 minutes late today.' });
    ticketId = t.id;
    expect(t.reference).toMatch(/^TKT-\d{6}-\d+$/);
    expect(t.status).toBe('OPEN');
    expect((await support.residentList(F)).some((x) => x.id === ticketId)).toBe(true);
    await expectCode(support.residentDetail(O, ticketId), 'NOT_FOUND');
    await expectCode(support.residentReply(O, 't', ticketId, 'hello'), 'NOT_FOUND');
    await expectCode(support.adminDetail(south(), ticketId), 'NOT_FOUND');
    expect((await support.adminList(north(), { limit: 100, open: true })).items.some((x) => x.id === ticketId)).toBe(true);
  });

  it('internal notes never reach the resident; replies show as Nestovin Support', async () => {
    await support.adminAddUpdate(north(), 't', ticketId, { visibility: 'INTERNAL', body: 'Check the roster for this flat' });
    await support.adminAddUpdate(north(), 't', ticketId, { visibility: 'RESIDENT', body: 'Sorry about this, we are checking.' });
    const seen = await support.residentDetail(A, ticketId);
    expect(seen.updates.map((u) => u.body)).toEqual(['Sorry about this, we are checking.']);
    expect(seen.updates[0]!.authorName).toBe('Nestovin Support');
    const full = await support.adminDetail(north(), ticketId);
    expect(full.updates.map((u) => u.visibility)).toEqual(['INTERNAL', 'RESIDENT']);
  });

  it('ticket status follows the transition rules', async () => {
    let t = await support.adminDetail(north(), ticketId);
    t = await support.adminPatch(north(), 't', ticketId, { ownerAdminId, version: t.version });
    expect(t.status).toBe('ASSIGNED');
    await expectCode(support.adminPatch(north(), 't', ticketId, { status: 'IN_PROGRESS', version: t.version - 1 }), 'VERSION_CONFLICT');
    await support.adminPatch(north(), 't', ticketId, { status: 'WAITING', version: t.version });
    // A resident reply to a waiting ticket puts it back in progress.
    expect((await support.residentReply(A, 't', ticketId, 'It happened again today')).status).toBe('IN_PROGRESS');
    t = await support.adminDetail(north(), ticketId);
    t = await support.adminPatch(north(), 't', ticketId, { status: 'RESOLVED', version: t.version });
    t = await support.adminPatch(north(), 't', ticketId, { status: 'CLOSED', version: t.version });
    expect(t.allowedStatuses).toEqual([]);
    await expectCode(support.adminPatch(north(), 't', ticketId, { status: 'IN_PROGRESS', version: t.version }), 'BUSINESS_RULE_VIOLATION');
    await expectCode(support.residentReply(A, 't', ticketId, 'more'), 'BUSINESS_RULE_VIOLATION');
  });

  it('the Primary can remove a family member, who then loses household access', async () => {
    const hh = await residents.household(A);
    const fam = hh.members.find((m) => m.kind === 'FAMILY')!;
    await expectCode(residents.removeFamilyMember(F, 't', fam.membershipId), 'BUSINESS_RULE_VIOLATION');
    await residents.removeFamilyMember(A, 't', fam.membershipId);
    expect((await residents.me(F)).membership).toBeNull();
    await expectCode(support.residentDetail(F, ticketId), 'NOT_FOUND');
  });
});
