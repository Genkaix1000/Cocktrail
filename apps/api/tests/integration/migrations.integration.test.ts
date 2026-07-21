import { mkdtempSync, copyFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import { runMigrations } from "../../src/infra/migrations/migration-runner.js";
import { resetMigrationsStatusForTests } from "../../src/infra/migrations/migrations-status.js";
import { PgMigrationsRepository } from "../../src/infra/migrations/pg-migrations.repository.js";
import { env } from "../../src/config/env.js";

/**
 * Corre el runner REAL con las migraciones reales contra una base scratch
 * propia (cocktrail_mig_test) en el mismo cluster local (:54322). Los roles
 * anon/authenticated son cluster-wide, así que los GRANT/REVOKE funcionan.
 * NUNCA toca la base `postgres` compartida (ahí viven los datos de dev y los
 * otros tests de integración).
 */

const TEST_DB = "cocktrail_mig_test";

const REAL_MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../supabase/migrations",
);

function adminUrl(): string {
  return env.DATABASE_URL;
}

function testDbUrl(): string {
  const url = new URL(env.DATABASE_URL);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

async function withAdmin(fn: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: adminUrl(), connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}

async function queryTestDb<T extends Record<string, any>>(sql: string): Promise<T[]> {
  const client = new Client({ connectionString: testDbUrl(), connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql);
    return rows;
  } finally {
    await client.end();
  }
}

async function dropTestDb(): Promise<void> {
  await withAdmin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  });
}

describe("runner de migraciones (integración, Postgres real)", () => {
  beforeAll(async () => {
    await dropTestDb();
    await withAdmin(async (client) => {
      await client.query(`CREATE DATABASE ${TEST_DB}`);
    });
  }, 30_000);

  afterAll(async () => {
    await dropTestDb();
  }, 30_000);

  beforeEach(() => {
    resetMigrationsStatusForTests();
  });

  it("base vacía → aplica todas las migraciones reales como baseline", async () => {
    const status = await runMigrations({
      repo: new PgMigrationsRepository(testDbUrl()),
      migrationsDir: REAL_MIGRATIONS_DIR,
    });

    expect(status.failed).toBeNull();
    expect(status.state).toBe("ok");
    const expectedCount = readdirSync(REAL_MIGRATIONS_DIR).filter((f) =>
      /^\d{14}_.+\.sql$/.test(f),
    ).length;
    expect(status.appliedNow).toHaveLength(expectedCount);

    const rows = await queryTestDb<{ version: string; applied_by: string }>(
      "SELECT version, applied_by FROM schema_migrations ORDER BY version",
    );
    expect(rows).toHaveLength(expectedCount);
    expect(rows.every((r) => r.applied_by === "baseline")).toBe(true);

    const tables = await queryTestDb<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    const names = tables.map((t) => t.tablename);
    for (const expected of [
      "night_events",
      "orders",
      "bars",
      "mercadopago_sellers",
      "mercadopago_cajas",
      "mp_orders",
      "bar_sessions",
      "schema_migrations",
    ]) {
      expect(names).toContain(expected);
    }
  }, 60_000);

  it("segunda corrida → no aplica nada y conserva los applied_at", async () => {
    const before = await queryTestDb<{ version: string; applied_at: string }>(
      "SELECT version, applied_at FROM schema_migrations ORDER BY version",
    );
    expect(before.length).toBeGreaterThan(0);

    const status = await runMigrations({
      repo: new PgMigrationsRepository(testDbUrl()),
      migrationsDir: REAL_MIGRATIONS_DIR,
    });

    expect(status.state).toBe("ok");
    expect(status.appliedNow).toHaveLength(0);

    const after = await queryTestDb<{ version: string; applied_at: string }>(
      "SELECT version, applied_at FROM schema_migrations ORDER BY version",
    );
    expect(after).toEqual(before);
  }, 60_000);

  it("una migración inválida → las previas quedan, la fallida rollbackea, status degradado", async () => {
    const scratchDir = mkdtempSync(join(tmpdir(), "cocktrail-mig-int-"));
    try {
      for (const file of readdirSync(REAL_MIGRATIONS_DIR)) {
        if (/^\d{14}_.+\.sql$/.test(file)) {
          copyFileSync(join(REAL_MIGRATIONS_DIR, file), join(scratchDir, file));
        }
      }
      writeFileSync(
        join(scratchDir, "29990101000000_boom.sql"),
        "CREATE TABLE boom_ok (id INT);\nSELECT 1/0;",
      );

      const status = await runMigrations({
        repo: new PgMigrationsRepository(testDbUrl()),
        migrationsDir: scratchDir,
      });

      expect(status.state).toBe("degraded");
      expect(status.failed?.version).toBe("29990101000000_boom.sql");

      // La transacción rollbackeó: ni la tabla ni el registro quedaron
      const boom = await queryTestDb<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE tablename = 'boom_ok'",
      );
      expect(boom).toHaveLength(0);
      const record = await queryTestDb<{ version: string }>(
        "SELECT version FROM schema_migrations WHERE version = '29990101000000_boom.sql'",
      );
      expect(record).toHaveLength(0);
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }, 60_000);

  it("checksum alterado a mano → drift flaggeado en la corrida siguiente", async () => {
    const [first] = await queryTestDb<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version LIMIT 1",
    );
    const client = new Client({ connectionString: testDbUrl(), connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
      await client.query("UPDATE schema_migrations SET checksum = 'adulterado' WHERE version = $1", [
        first.version,
      ]);
    } finally {
      await client.end();
    }

    const status = await runMigrations({
      repo: new PgMigrationsRepository(testDbUrl()),
      migrationsDir: REAL_MIGRATIONS_DIR,
    });

    expect(status.state).toBe("degraded");
    expect(status.drift.map((d) => d.version)).toContain(first.version);
    expect(status.appliedNow).toHaveLength(0);
  }, 60_000);
});
