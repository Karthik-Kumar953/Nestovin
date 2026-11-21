import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Database } from '../../src/db/database';

/*
 * An in-memory Kysely database for failure-path unit tests: no network, no
 * writes anywhere. Every statement (including BEGIN/COMMIT/ROLLBACK and
 * savepoints) is recorded, and `respond` decides the rows (or throws) for each
 * query. Lets us prove transaction-shape bugs (rollbacks, missing ORDER BY,
 * swallowed errors) without touching the shared database.
 */

export interface Statement {
  sql: string;
  params: readonly unknown[];
}

export type Responder = (q: Statement) => Record<string, unknown>[] | undefined;

export function scriptedDb(respond: Responder): { db: Database; log: Statement[] } {
  const log: Statement[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
      const q = { sql: compiled.sql, params: compiled.parameters };
      log.push(q);
      const rows = respond(q) ?? [];
      return { rows: rows as R[], numAffectedRows: BigInt(rows.length) };
    },
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('streaming is not supported by the scripted db');
    },
  };
  const control = (sql: string) => {
    log.push({ sql, params: [] });
  };
  const driver: Driver = {
    async init() {},
    async acquireConnection() {
      return connection;
    },
    async beginTransaction() {
      control('begin');
    },
    async commitTransaction() {
      control('commit');
    },
    async rollbackTransaction() {
      control('rollback');
    },
    async savepoint(_c, name) {
      control(`savepoint ${name}`);
    },
    async rollbackToSavepoint(_c, name) {
      control(`rollback to savepoint ${name}`);
    },
    async releaseSavepoint(_c, name) {
      control(`release savepoint ${name}`);
    },
    async releaseConnection() {},
    async destroy() {},
  };
  const db = new Kysely<never>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  }) as unknown as Database;
  return { db, log };
}

/** A Postgres unique-violation error, as node-postgres raises it. */
export function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), { code: '23505', constraint });
}
