import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { IMPORT_COLUMNS, type ActivationChecklist, type GridRow, type GridValidation, type ImportBatch, type ImportRow } from '@nestovin/contracts';
import type { Database, Tx } from '../../db/database';
import { withTx } from '../../db/database';
import { toDbClaims, type AdminActor } from '../../auth/permissions';
import { businessRule, conflict, notFound } from '../../lib/errors';
import { auditAdmin } from '../audit/audit';
import { visibleCommunity } from '../locations/scope';
import { buildTemplate, normalizeRow, parseWorkbook, type NormalizedRow } from './workbook';

/*
 * Community migration (ADM-04, ADR-011) and community activation.
 *  upload -> VALIDATED | INVALID -> approve (APPROVED) | reject -> commit (COMMITTED)
 * Commit re-validates against the current database and is all-or-nothing.
 */

interface PlannedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  value: NormalizedRow | undefined;
  categoryId: string | null;
  errors: string[];
  warnings: string[];
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null;
}

interface Plan {
  rows: PlannedRow[];
  newTowers: string[];
  counts: { valid: number; errors: number; warnings: number; flatsNew: number; flatsUpdated: number };
}

const CHUNK = 1000;
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export class MigrationService {
  constructor(private readonly db: Database) {}

  private tx<T>(actor: AdminActor, fn: (trx: Tx) => Promise<T>) {
    return withTx(this.db, toDbClaims(actor), fn);
  }

  // ---------------------------------------------------------------- template

  async template(actor: AdminActor, communityId: string): Promise<{ fileName: string; buffer: Buffer }> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const community = await trx.selectFrom('app.communities').select(['name', 'code']).where('id', '=', communityId).executeTakeFirstOrThrow();
      const categories = await trx
        .selectFrom('app.residence_categories')
        .select(['code', 'label'])
        .where('community_id', '=', communityId)
        .where('status', '=', 'ACTIVE')
        .orderBy('sort')
        .execute();
      const buffer = await buildTemplate(community.name, categories);
      return { fileName: `nestovin-migration-${community.code.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`, buffer };
    });
  }

  // -------------------------------------------------------------- planning

  /** Validates rows against field rules, duplicates and the current database. */
  private async plan(trx: Tx, communityId: string, rows: { rowNumber: number; raw: Record<string, unknown> }[]): Promise<Plan> {
    const categories = await trx
      .selectFrom('app.residence_categories')
      .select(['id', 'code', 'label', 'status'])
      .where('community_id', '=', communityId)
      .execute();
    const towers = await trx.selectFrom('app.towers').select(['id', 'name', 'status']).where('community_id', '=', communityId).execute();
    const towerByName = new Map(towers.map((t) => [t.name.toLowerCase(), t]));
    const flats = towers.length
      ? await trx
          .selectFrom('app.flats')
          .select(['tower_id', 'flat_number', 'floor', 'bhk_type', 'area_sqft', 'residence_category_id', 'occupancy', 'status'])
          .where('community_id', '=', communityId)
          .execute()
      : [];
    const flatByKey = new Map(flats.map((f) => [`${f.tower_id}|${f.flat_number.toLowerCase()}`, f]));

    const seen = new Map<string, number>();
    const newTowers = new Set<string>();
    const planned: PlannedRow[] = rows.map(({ rowNumber, raw }) => {
      const { value, errors } = normalizeRow(raw);
      const warnings: string[] = [];
      let categoryId: string | null = null;
      let action: PlannedRow['action'] = null;

      if (value) {
        const ref = value.categoryRef.toLowerCase();
        const cat = categories.find((c) => c.code.toLowerCase() === ref || c.label.toLowerCase() === ref);
        if (!cat) errors.push(`Residence category "${value.categoryRef}" is not defined for this community`);
        else if (cat.status !== 'ACTIVE') errors.push(`Residence category "${value.categoryRef}" is inactive`);
        else categoryId = cat.id;

        const key = `${value.tower.toLowerCase()}|${value.flatNumber.toLowerCase()}`;
        const first = seen.get(key);
        if (first) errors.push(`Duplicate of row ${first} (same tower and flat number)`);
        else seen.set(key, rowNumber);

        const tower = towerByName.get(value.tower.toLowerCase());
        if (tower && tower.status !== 'ACTIVE') errors.push(`Tower "${value.tower}" is inactive`);
        if (!tower) newTowers.add(value.tower);

        const existing = tower ? flatByKey.get(`${tower.id}|${value.flatNumber.toLowerCase()}`) : undefined;
        if (existing && existing.status !== 'ACTIVE') errors.push(`Flat ${value.flatNumber} in tower "${value.tower}" is inactive`);

        if (errors.length === 0) {
          if (!existing) action = 'CREATE';
          else {
            const same =
              existing.floor === value.floor &&
              (existing.bhk_type ?? null) === value.bhkType &&
              (existing.area_sqft === null ? null : Number(existing.area_sqft)) === value.areaSqft &&
              existing.residence_category_id === categoryId &&
              (existing.occupancy ?? null) === value.occupancy;
            action = same ? 'UNCHANGED' : 'UPDATE';
            if (!same) warnings.push('Updates an existing flat');
          }
        }
      }
      return { rowNumber, raw, value, categoryId, errors, warnings, action };
    });

    const valid = planned.filter((r) => r.errors.length === 0);
    return {
      rows: planned,
      newTowers: [...newTowers].filter((t) => valid.some((r) => r.value?.tower.toLowerCase() === t.toLowerCase())),
      counts: {
        valid: valid.length,
        errors: planned.length - valid.length,
        warnings: planned.filter((r) => r.warnings.length > 0).length,
        flatsNew: valid.filter((r) => r.action === 'CREATE').length,
        flatsUpdated: valid.filter((r) => r.action === 'UPDATE').length,
      },
    };
  }

  // ---------------------------------------------------------------- upload

  async upload(actor: AdminActor, requestId: string, communityId: string, fileName: string, buf: Buffer): Promise<ImportBatch> {
    const parsed = await parseWorkbook(buf);
    const sha = createHash('sha256').update(buf).digest('hex');
    return this.createBatch(actor, requestId, communityId, { source: 'EXCEL', fileName, sha, size: buf.length, fileErrors: parsed.fileErrors, rows: parsed.rows });
  }

  /** Dashboard table rows mapped onto the template columns (row numbers start at 2, like the sheet). */
  private gridToRaw(rows: GridRow[]) {
    return rows
      .map((r, i) => {
        const values = [r.tower, r.floor ?? null, r.flatNumber, r.bhkType ?? null, r.areaSqft ?? null, r.category, r.occupancy ?? null];
        const raw: Record<string, unknown> = {};
        IMPORT_COLUMNS.forEach((col, c) => {
          const v = values[c];
          raw[col] = typeof v === 'string' && v.trim() === '' ? null : v;
        });
        return { rowNumber: i + 2, raw, blank: values.every((v) => v === null || v === undefined || String(v).trim() === '') };
      })
      .filter((r) => !r.blank)
      .map(({ rowNumber, raw }) => ({ rowNumber, raw }));
  }

  /** Live validation of the dashboard table (nothing is stored). */
  async validateGrid(actor: AdminActor, communityId: string, rows: GridRow[]): Promise<GridValidation> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const plan = await this.plan(trx, communityId, this.gridToRaw(rows));
      return {
        rows: plan.rows.map((r) => ({ rowNumber: r.rowNumber, errors: r.errors, warnings: r.warnings, action: r.action })),
        counts: { ...plan.counts, towersNew: plan.newTowers.length },
      };
    });
  }

  /** Submits the dashboard table as an import batch (then approve and commit as usual). */
  async submitGrid(actor: AdminActor, requestId: string, communityId: string, rows: GridRow[]): Promise<ImportBatch> {
    const raw = this.gridToRaw(rows);
    const json = Buffer.from(JSON.stringify(raw));
    return this.createBatch(actor, requestId, communityId, {
      source: 'DASHBOARD',
      fileName: 'Entered in dashboard',
      sha: createHash('sha256').update(json).digest('hex'),
      size: json.length,
      fileErrors: raw.length ? [] : ['Enter at least one flat'],
      rows: raw,
    });
  }

  /** Current structure as an Excel file in the import format (edit and re-import, or archive). */
  async exportStructure(actor: AdminActor, requestId: string, communityId: string): Promise<{ fileName: string; buffer: Buffer }> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const community = await trx.selectFrom('app.communities').select(['name', 'code']).where('id', '=', communityId).executeTakeFirstOrThrow();
      const categories = await trx.selectFrom('app.residence_categories').select(['id', 'code', 'label']).where('community_id', '=', communityId).orderBy('sort').execute();
      const flats = await trx
        .selectFrom('app.flats as f')
        .innerJoin('app.towers as t', 't.id', 'f.tower_id')
        .select(['t.name as tower', 'f.floor', 'f.flat_number', 'f.bhk_type', 'f.area_sqft', 'f.residence_category_id', 'f.occupancy'])
        .where('f.community_id', '=', communityId)
        .where('f.status', '=', 'ACTIVE')
        .orderBy('t.name')
        .orderBy('f.flat_number')
        .execute();
      const occ = (o: string | null) => (o ? o.charAt(0) + o.slice(1).toLowerCase() : null);
      const rows = flats.map((f) => [
        f.tower,
        f.floor,
        f.flat_number,
        f.bhk_type,
        f.area_sqft === null ? null : Number(f.area_sqft),
        categories.find((c) => c.id === f.residence_category_id)?.code ?? null,
        occ(f.occupancy),
      ]);
      const buffer = await buildTemplate(community.name, categories, rows);
      await auditAdmin(trx, actor, requestId, { action: 'structure.exported', targetType: 'community', targetId: communityId, after: { flats: flats.length } });
      return { fileName: `nestovin-structure-${community.code.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`, buffer };
    });
  }

  private async createBatch(
    actor: AdminActor,
    requestId: string,
    communityId: string,
    src: { source: 'EXCEL' | 'DASHBOARD'; fileName: string; sha: string; size: number; fileErrors: string[]; rows: { rowNumber: number; raw: Record<string, unknown> }[] },
  ): Promise<ImportBatch> {
    const parsed = { fileErrors: src.fileErrors, rows: src.rows };
    const { fileName, sha } = src;
    return this.tx(actor, async (trx) => {
      const community = await visibleCommunity(trx, actor, communityId, { lock: true });
      if (community.status === 'INACTIVE') throw businessRule('This community is inactive');
      const open = await trx
        .selectFrom('app.import_batches')
        .select(['id', 'status'])
        .where('community_id', '=', communityId)
        .where('status', 'in', ['VALIDATED', 'APPROVED'])
        .executeTakeFirst();
      if (open) throw conflict('Another import for this community is waiting for approval or commit. Commit, reject or cancel it first.');

      const previous = await trx
        .selectFrom('app.import_batches')
        .select('id')
        .where('community_id', '=', communityId)
        .where('status', 'in', ['INVALID', 'REJECTED', 'CANCELLED'])
        .orderBy('uploaded_at', 'desc')
        .executeTakeFirst();

      const plan = parsed.fileErrors.length ? null : await this.plan(trx, communityId, parsed.rows);
      const status = plan && plan.counts.errors === 0 ? 'VALIDATED' : 'INVALID';

      const batch = await trx
        .insertInto('app.import_batches')
        .values({
          community_id: communityId,
          file_name: fileName.slice(0, 255) || 'upload.xlsx',
          file_sha256: sha,
          file_size_bytes: src.size,
          source: src.source,
          status,
          total_rows: plan?.rows.length ?? 0,
          valid_rows: plan?.counts.valid ?? 0,
          error_rows: plan?.counts.errors ?? 0,
          warning_rows: plan?.counts.warnings ?? 0,
          towers_new: plan?.newTowers.length ?? 0,
          flats_new: plan?.counts.flatsNew ?? 0,
          flats_updated: plan?.counts.flatsUpdated ?? 0,
          file_errors: parsed.fileErrors,
          uploaded_by: actor.id,
          supersedes_batch_id: previous?.id ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      if (plan) {
        for (let i = 0; i < plan.rows.length; i += CHUNK) {
          const chunk = plan.rows.slice(i, i + CHUNK);
          await sql`
            insert into app.import_rows (batch_id, row_number, raw, normalized, errors, warnings, action)
            select ${batch.id}::uuid, r.row_number, r.raw, r.normalized, r.errors, r.warnings, r.action
              from jsonb_to_recordset(${JSON.stringify(
                chunk.map((r) => ({
                  row_number: r.rowNumber,
                  raw: r.raw,
                  normalized: r.value ? { ...r.value, categoryId: r.categoryId } : null,
                  errors: r.errors,
                  warnings: r.warnings,
                  action: r.action,
                })),
              )}::jsonb)
                as r(row_number int, raw jsonb, normalized jsonb, errors text[], warnings text[], action text)
          `.execute(trx);
        }
      }

      await auditAdmin(trx, actor, requestId, {
        action: 'import.uploaded',
        targetType: 'import_batch',
        targetId: batch.id,
        after: { communityId, source: src.source, fileName, sha256: sha, status, rows: plan?.rows.length ?? 0, errors: plan?.counts.errors ?? null },
      });
      return this.loadBatch(trx, batch.id);
    });
  }

  // ----------------------------------------------------------------- reads

  private async loadBatch(trx: Database | Tx, id: string): Promise<ImportBatch> {
    const b = await trx.selectFrom('app.import_batches').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    return {
      id: b.id,
      communityId: b.community_id,
      fileName: b.file_name,
      source: b.source,
      status: b.status,
      totalRows: b.total_rows,
      validRows: b.valid_rows,
      errorRows: b.error_rows,
      warningRows: b.warning_rows,
      towersNew: b.towers_new,
      flatsNew: b.flats_new,
      flatsUpdated: b.flats_updated,
      fileErrors: b.file_errors,
      uploadedBy: b.uploaded_by,
      uploadedAt: iso(b.uploaded_at)!,
      decidedBy: b.decided_by,
      decidedAt: iso(b.decided_at as Date | null),
      decisionReason: b.decision_reason,
      committedAt: iso(b.committed_at as Date | null),
    };
  }

  private async scopedBatch(trx: Tx, actor: AdminActor, id: string, lock = false) {
    let q = trx.selectFrom('app.import_batches').select(['id', 'community_id', 'status']).where('id', '=', id);
    if (lock) q = q.forUpdate();
    const b = await q.executeTakeFirst();
    if (!b) throw notFound('Import batch');
    try {
      await visibleCommunity(trx, actor, b.community_id, { lock });
    } catch {
      throw notFound('Import batch');
    }
    return b;
  }

  async listBatches(actor: AdminActor, communityId: string): Promise<ImportBatch[]> {
    return this.tx(actor, async (trx) => {
      await visibleCommunity(trx, actor, communityId);
      const ids = await trx
        .selectFrom('app.import_batches')
        .select('id')
        .where('community_id', '=', communityId)
        .orderBy('uploaded_at', 'desc')
        .limit(50)
        .execute();
      return Promise.all(ids.map((r) => this.loadBatch(trx, r.id)));
    });
  }

  async getBatch(actor: AdminActor, id: string): Promise<ImportBatch> {
    return this.tx(actor, async (trx) => {
      await this.scopedBatch(trx, actor, id);
      return this.loadBatch(trx, id);
    });
  }

  async rows(actor: AdminActor, id: string, p: { onlyProblems: boolean; afterRow?: number | undefined; limit: number }) {
    return this.tx(actor, async (trx) => {
      await this.scopedBatch(trx, actor, id);
      let q = trx
        .selectFrom('app.import_rows')
        .select(['row_number', 'raw', 'errors', 'warnings', 'action'])
        .where('batch_id', '=', id);
      if (p.onlyProblems) q = q.where((eb) => eb.or([eb(sql`cardinality(errors)`, '>', 0), eb(sql`cardinality(warnings)`, '>', 0)]));
      if (p.afterRow) q = q.where('row_number', '>', p.afterRow);
      const rows = await q.orderBy('row_number').limit(p.limit + 1).execute();
      const page = rows.slice(0, p.limit);
      const items: ImportRow[] = page.map((r) => ({ rowNumber: r.row_number, raw: r.raw, errors: r.errors, warnings: r.warnings, action: r.action }));
      return { items, nextAfterRow: rows.length > p.limit ? page[page.length - 1]!.row_number : null };
    });
  }

  // ------------------------------------------------------------- decisions

  async approve(actor: AdminActor, requestId: string, id: string, reason?: string) {
    return this.decide(actor, requestId, id, 'APPROVED', reason, ['VALIDATED']);
  }

  async reject(actor: AdminActor, requestId: string, id: string, reason?: string) {
    if (!reason) throw businessRule('Give a reason so the uploader knows what to fix');
    return this.decide(actor, requestId, id, 'REJECTED', reason, ['VALIDATED', 'APPROVED']);
  }

  async cancel(actor: AdminActor, requestId: string, id: string, reason?: string) {
    return this.decide(actor, requestId, id, 'CANCELLED', reason, ['VALIDATED', 'APPROVED']);
  }

  private async decide(
    actor: AdminActor,
    requestId: string,
    id: string,
    to: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    reason: string | undefined,
    from: string[],
  ): Promise<ImportBatch> {
    return this.tx(actor, async (trx) => {
      const b = await this.scopedBatch(trx, actor, id, true);
      if (!from.includes(b.status)) throw businessRule(`A ${b.status.toLowerCase()} batch cannot be ${to.toLowerCase()}`);
      await trx
        .updateTable('app.import_batches')
        .set({ status: to, decided_by: actor.id, decided_at: sql`now()`, decision_reason: reason ?? null })
        .where('id', '=', id)
        .execute();
      await auditAdmin(trx, actor, requestId, {
        action: `import.${to.toLowerCase()}`,
        targetType: 'import_batch',
        targetId: id,
        reason: reason ?? null,
        before: { status: b.status },
        after: { status: to },
      });
      return this.loadBatch(trx, id);
    });
  }

  // ---------------------------------------------------------------- commit

  async commit(actor: AdminActor, requestId: string, id: string): Promise<ImportBatch> {
    return this.tx(actor, async (trx) => {
      const b = await this.scopedBatch(trx, actor, id, true);
      if (b.status !== 'APPROVED') throw businessRule('Only an approved batch can be committed');

      const stored = await trx
        .selectFrom('app.import_rows')
        .select(['row_number', 'raw'])
        .where('batch_id', '=', id)
        .orderBy('row_number')
        .execute();
      // All-or-nothing: re-validate against the database as it is now.
      const plan = await this.plan(trx, b.community_id, stored.map((r) => ({ rowNumber: r.row_number, raw: r.raw })));
      if (plan.counts.errors > 0) {
        throw businessRule(
          `The community data changed since this file was validated (${plan.counts.errors} row(s) now fail). Upload the file again.`,
        );
      }

      // 1) Towers that do not exist yet (one statement).
      if (plan.newTowers.length) {
        await sql`
          insert into app.towers (community_id, name)
          select ${b.community_id}::uuid, t.name from unnest(${plan.newTowers}::text[]) as t(name)
        `.execute(trx);
      }
      const towers = await trx.selectFrom('app.towers').select(['id', 'name']).where('community_id', '=', b.community_id).execute();
      const towerId = new Map(towers.map((t) => [t.name.toLowerCase(), t.id]));

      // 2) Flats: upsert by (tower, flat number) in chunks. Existing flats are
      //    updated only when something changed; flats missing from the file are untouched.
      const changes = plan.rows.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE');
      for (let i = 0; i < changes.length; i += CHUNK) {
        const chunk = changes.slice(i, i + CHUNK).map((r) => ({
          tower_id: towerId.get(r.value!.tower.toLowerCase()),
          flat_number: r.value!.flatNumber,
          floor: r.value!.floor,
          bhk_type: r.value!.bhkType,
          area_sqft: r.value!.areaSqft,
          residence_category_id: r.categoryId,
          occupancy: r.value!.occupancy,
        }));
        await sql`
          insert into app.flats as f (tower_id, flat_number, floor, bhk_type, area_sqft, residence_category_id, occupancy)
          select r.tower_id, r.flat_number, r.floor, r.bhk_type, r.area_sqft, r.residence_category_id, r.occupancy
            from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb)
              as r(tower_id uuid, flat_number text, floor int, bhk_type text, area_sqft numeric, residence_category_id uuid, occupancy text)
          on conflict (tower_id, lower(flat_number)) do update set
            floor = excluded.floor,
            bhk_type = excluded.bhk_type,
            area_sqft = excluded.area_sqft,
            residence_category_id = excluded.residence_category_id,
            occupancy = excluded.occupancy
          where (f.floor, f.bhk_type, f.area_sqft, f.residence_category_id, f.occupancy)
                is distinct from (excluded.floor, excluded.bhk_type, excluded.area_sqft, excluded.residence_category_id, excluded.occupancy)
        `.execute(trx);
      }

      await trx
        .updateTable('app.import_batches')
        .set({
          status: 'COMMITTED',
          committed_by: actor.id,
          committed_at: sql`now()`,
          towers_new: plan.newTowers.length,
          flats_new: plan.counts.flatsNew,
          flats_updated: plan.counts.flatsUpdated,
        })
        .where('id', '=', id)
        .execute();
      // Onboarding progress only; migration never activates a community (ADR-011).
      await trx.updateTable('app.communities').set({ status: 'IMPORTED' }).where('id', '=', b.community_id).where('status', '=', 'DRAFT').execute();

      await auditAdmin(trx, actor, requestId, {
        action: 'import.committed',
        targetType: 'import_batch',
        targetId: id,
        after: { towersNew: plan.newTowers.length, flatsNew: plan.counts.flatsNew, flatsUpdated: plan.counts.flatsUpdated },
      });
      return this.loadBatch(trx, id);
    });
  }

  // ------------------------------------------------------------ activation

  async checklist(actor: AdminActor, communityId: string): Promise<ActivationChecklist> {
    return this.tx(actor, async (trx) => {
      const c = await visibleCommunity(trx, actor, communityId);
      return this.buildChecklist(trx, communityId, c.clusterId, c.defaultOperatingMode);
    });
  }

  private async buildChecklist(trx: Tx, communityId: string, clusterId: string | null, defaultMode: string | null): Promise<ActivationChecklist> {
    const flats = await trx
      .selectFrom('app.flats')
      .select([sql<number>`count(*)::int`.as('total'), sql<number>`count(*) filter (where residence_category_id is null)::int`.as('uncategorised')])
      .where('community_id', '=', communityId)
      .where('status', '=', 'ACTIVE')
      .executeTakeFirstOrThrow();
    const services = await trx
      .selectFrom('app.community_services')
      .select(['enabled', 'operating_mode'])
      .where('community_id', '=', communityId)
      .where('enabled', '=', true)
      .execute();
    const published = await trx
      .selectFrom('app.catalogue_versions')
      .select(['version_no'])
      .where('community_id', '=', communityId)
      .where('status', '=', 'PUBLISHED')
      .executeTakeFirst();

    const modeMissing = services.some((s) => !(s.operating_mode ?? defaultMode));
    const checks = [
      { key: 'cluster', label: 'Assigned to a cluster', ok: Boolean(clusterId) },
      { key: 'flats', label: 'Has towers and flats', ok: flats.total > 0, detail: `${flats.total} active flat(s)` },
      {
        key: 'categories',
        label: 'Every flat has a residence category',
        ok: flats.total > 0 && flats.uncategorised === 0,
        ...(flats.uncategorised ? { detail: `${flats.uncategorised} flat(s) without a category` } : {}),
      },
      {
        key: 'services',
        label: 'At least one service enabled, each with an operating mode',
        ok: services.length > 0 && !modeMissing,
        detail: `${services.length} service(s) enabled`,
      },
      {
        key: 'catalogue',
        label: 'A catalogue version is published',
        ok: Boolean(published),
        ...(published ? { detail: `Version ${published.version_no}` } : {}),
      },
    ];
    return { ready: checks.every((c) => c.ok), checks };
  }

  async activate(actor: AdminActor, requestId: string, communityId: string): Promise<ActivationChecklist> {
    return this.tx(actor, async (trx) => {
      const c = await visibleCommunity(trx, actor, communityId, { lock: true });
      if (c.status === 'ACTIVE') throw businessRule('This community is already active');
      const list = await this.buildChecklist(trx, communityId, c.clusterId, c.defaultOperatingMode);
      if (!list.ready) throw businessRule('Complete the setup checklist before activating this community');
      await trx.updateTable('app.communities').set({ status: 'ACTIVE' }).where('id', '=', communityId).execute();
      await auditAdmin(trx, actor, requestId, {
        action: 'community.activated',
        targetType: 'community',
        targetId: communityId,
        before: { status: c.status },
        after: { status: 'ACTIVE' },
      });
      return list;
    });
  }
}
