import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { allCatalogueGrants, MODULES, MODULE_KEYS } from '@nestovin/contracts';
import { adminPool, appPool, databaseAvailable, uniq } from '../helpers/db';
import { cleanupSuite } from '../helpers/qa-fixtures';

const available = await databaseAvailable();

describe.skipIf(!available)('database guards', () => {
  const s = uniq();
  let admin: pg.Pool;
  let app: pg.Pool;

  beforeAll(() => {
    admin = adminPool();
    app = appPool();
  });
  afterAll(async () => {
    await app?.end();
    await admin?.end();
    // Last, so it never delays the suite's own resets (hook timeouts on a busy shared DB).
    // Removes this suite's fixtures from the shared dev database (test/helpers/qa-fixtures.ts).
    await cleanupSuite({ suffix: s });
  }, 180_000);

  it('permission catalogue in the DB matches packages/contracts exactly', async () => {
    const { rows: modules } = await admin.query('select key, ref, grantable from app.permission_modules order by key');
    expect(modules).toEqual(
      [...MODULE_KEYS].sort().map((k) => ({ key: k, ref: MODULES[k].ref, grantable: MODULES[k].grantable })),
    );
    const { rows: pairs } = await admin.query(
      `select module_key || ':' || action_key as k from app.permission_module_actions order by 1`,
    );
    expect(pairs.map((r) => r.k)).toEqual(allCatalogueGrants().map((g) => `${g.module}:${g.action}`).sort());
  });

  it('audit log is append-only for the API role', async () => {
    const { rows } = await app.query(
      `insert into app.audit_events (actor_kind, action, target_type) values ('system', 'test.inserted', 'test') returning id`,
    );
    await expect(app.query('update app.audit_events set reason = $1 where id = $2', ['x', rows[0].id])).rejects.toThrow();
    await expect(app.query('delete from app.audit_events where id = $1', [rows[0].id])).rejects.toThrow();
  });

  it('cluster membership history cannot be deleted or rewritten', async () => {
    const { rows: [city] } = await admin.query(`insert into app.cities (name, state) values ($1, 'TS') returning id`, [`City ${s}`]);
    const { rows: [cl] } = await admin.query(`insert into app.clusters (name, code) values ($1, $1) returning id`, [`CL${s}`]);
    const { rows: [co] } = await admin.query(
      `insert into app.communities (city_id, name, code) values ($1, $2, $2) returning id`,
      [city.id, `CO${s}`],
    );
    const { rows: [m] } = await admin.query(
      `insert into app.cluster_community_memberships (cluster_id, community_id, reason) values ($1, $2, 'test') returning id`,
      [cl.id, co.id],
    );
    await expect(app.query('delete from app.cluster_community_memberships where id = $1', [m.id])).rejects.toThrow();
    await expect(
      app.query(`update app.cluster_community_memberships set reason = 'rewritten' where id = $1`, [m.id]),
    ).rejects.toThrow(/closed once/);
    // A second active membership for the same community is impossible.
    await expect(
      app.query(
        `insert into app.cluster_community_memberships (cluster_id, community_id, reason) values ($1, $2, 'dup')`,
        [cl.id, co.id],
      ),
    ).rejects.toThrow(/memberships_one_active_per_community/);
  });

  it('the API role cannot delete master data (deactivate instead)', async () => {
    await expect(app.query(`delete from app.cities where false`)).rejects.toThrow(/permission denied/);
  });

  it('protects the last active Super Admin', async () => {
    // Only meaningful when exactly one test super admin exists; create an isolated one.
    const id = randomUUID();
    await admin.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [
      id,
      `root-${uniq().toLowerCase()}@example.test`,
    ]);
    const { rows } = await admin.query(`select count(*)::int as n from app.admin_profiles where is_super_admin and status = 'ACTIVE'`);
    await admin.query(
      `insert into app.admin_profiles (id, email, full_name, is_super_admin, status, scope_type)
       values ($1, (select email from auth.users where id = $1), 'Root Test', true, 'ACTIVE', 'GLOBAL')`,
      [id],
    );
    if (rows[0].n === 0) {
      await expect(app.query(`update app.admin_profiles set status = 'DISABLED' where id = $1`, [id])).rejects.toThrow(
        /last active Super Admin/,
      );
    }
    // Clean up through the superuser (allowed only because another super admin exists or we demote first).
    await admin.query(`alter table app.admin_profiles disable trigger admin_profiles_keep_super_admin`);
    await admin.query(`delete from app.admin_profiles where id = $1`, [id]);
    await admin.query(`alter table app.admin_profiles enable trigger admin_profiles_keep_super_admin`);
    await admin.query(`delete from auth.users where id = $1`, [id]);
  });

  it('refuses to grant the Super-Admin-only module at the database level', async () => {
    const { rows: [role] } = await app.query(`insert into app.roles (name) values ($1) returning id`, [`R ${uniq()}`]);
    await expect(
      app.query(`insert into app.role_grants (role_id, module_key, action_key) values ($1, 'admin_access', 'view')`, [role.id]),
    ).rejects.toThrow(/reserved for the Super Admin/);
    await app.query(`delete from app.roles where id = $1`, [role.id]);
  });
});
