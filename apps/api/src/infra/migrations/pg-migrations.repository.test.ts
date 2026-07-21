import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();
const endMock = vi.fn();

vi.mock("pg", () => ({
  Client: class {
    connect = connectMock;
    end = endMock;
    query = queryMock;
  },
}));

import { PgMigrationsRepository } from "./pg-migrations.repository.js";
import type { MigrationFile } from "./migration-runner.js";

const migration: MigrationFile = {
  version: "20260101000000_test.sql",
  sql: "CREATE TABLE IF NOT EXISTS demo (id INT);",
  checksum: "abc123",
  noTransaction: false,
};

function queriesRun(): string[] {
  return queryMock.mock.calls.map((call) => String(call[0]).trim().split(/\s+/).slice(0, 2).join(" "));
}

describe("PgMigrationsRepository", () => {
  let repo: PgMigrationsRepository;

  beforeEach(async () => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [] });
    repo = new PgMigrationsRepository("postgres://test");
    await repo.connect();
  });

  it("applyInTransaction: BEGIN → sql → INSERT → COMMIT", async () => {
    await repo.applyInTransaction(migration, "runner");

    const calls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toBe(migration.sql);
    expect(calls[2]).toContain("INSERT INTO public.schema_migrations");
    expect(calls[3]).toBe("COMMIT");
    // El registro va con la identidad y el checksum de la migración
    expect(queryMock.mock.calls[2][1]).toEqual([
      migration.version,
      migration.checksum,
      expect.any(Number),
      "runner",
    ]);
  });

  it("applyInTransaction: ROLLBACK + re-throw si el SQL falla", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql === migration.sql) throw new Error("syntax error");
      return { rows: [] };
    });

    await expect(repo.applyInTransaction(migration, "runner")).rejects.toThrow("syntax error");

    const calls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });

  it("applyWithoutTransaction: sql + INSERT sin BEGIN/COMMIT", async () => {
    await repo.applyWithoutTransaction(migration, "baseline");

    const calls = queryMock.mock.calls.map((c) => String(c[0]));
    expect(calls[0]).toBe(migration.sql);
    expect(calls[1]).toContain("INSERT INTO public.schema_migrations");
    expect(calls).not.toContain("BEGIN");
  });

  it("tryAcquireLock usa pg_try_advisory_lock y devuelve el resultado", async () => {
    queryMock.mockResolvedValue({ rows: [{ locked: true }] });
    await expect(repo.tryAcquireLock()).resolves.toBe(true);
    expect(String(queryMock.mock.calls[0][0])).toContain("pg_try_advisory_lock");

    queryMock.mockResolvedValue({ rows: [{ locked: false }] });
    await expect(repo.tryAcquireLock()).resolves.toBe(false);
  });

  it("ensureMigrationsTable crea la tabla y revoca anon/authenticated", async () => {
    await repo.ensureMigrationsTable();
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.schema_migrations");
    expect(sql).toContain("REVOKE ALL ON public.schema_migrations FROM anon, authenticated");
  });

  it("listApplied devuelve version + checksum ordenados", async () => {
    queryMock.mockResolvedValue({ rows: [{ version: "a.sql", checksum: "x" }] });
    await expect(repo.listApplied()).resolves.toEqual([{ version: "a.sql", checksum: "x" }]);
    expect(String(queryMock.mock.calls[0][0])).toContain("ORDER BY version");
  });

  it("los métodos fallan con error claro si no está conectado", async () => {
    const fresh = new PgMigrationsRepository("postgres://test");
    await expect(fresh.listApplied()).rejects.toThrow("no conectado");
  });
});
