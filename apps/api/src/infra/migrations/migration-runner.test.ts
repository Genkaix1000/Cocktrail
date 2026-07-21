import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { readMigrationFiles, runMigrations, type MigrationFile } from "./migration-runner.js";
import {
  getMigrationsStatus,
  resetMigrationsStatusForTests,
} from "./migrations-status.js";
import type { AppliedMigration, PgMigrationsRepository } from "./pg-migrations.repository.js";

let dir: string;

function writeMigration(name: string, sql = "SELECT 1;") {
  writeFileSync(join(dir, name), sql);
}

/** Fake in-memory del repository — registra llamadas y simula la tabla. */
function makeFakeRepo(applied: AppliedMigration[] = []) {
  const appliedCalls: { migration: MigrationFile; appliedBy: string; tx: boolean }[] = [];
  const repo = {
    appliedCalls,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    tryAcquireLock: vi.fn().mockResolvedValue(true),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    ensureMigrationsTable: vi.fn().mockResolvedValue(undefined),
    listApplied: vi.fn().mockResolvedValue(applied),
    applyInTransaction: vi.fn(async (migration: MigrationFile, appliedBy: string) => {
      appliedCalls.push({ migration, appliedBy, tx: true });
    }),
    applyWithoutTransaction: vi.fn(async (migration: MigrationFile, appliedBy: string) => {
      appliedCalls.push({ migration, appliedBy, tx: false });
    }),
  };
  return repo;
}

function asRepo(fake: ReturnType<typeof makeFakeRepo>): PgMigrationsRepository {
  return fake as unknown as PgMigrationsRepository;
}

describe("readMigrationFiles", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cocktrail-mig-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("lista solo archivos versionados (excluye schema.sql y otros), en orden", () => {
    writeMigration("20260102000000_second.sql");
    writeMigration("20260101000000_first.sql");
    writeFileSync(join(dir, "schema.sql"), "SELECT 1;");
    writeFileSync(join(dir, "README.md"), "no soy una migración");

    const files = readMigrationFiles(dir);
    expect(files.map((f) => f.version)).toEqual([
      "20260101000000_first.sql",
      "20260102000000_second.sql",
    ]);
  });

  it("normaliza CRLF antes de hashear: mismo checksum con \\n y \\r\\n", () => {
    writeMigration("20260101000000_lf.sql", "SELECT 1;\nSELECT 2;\n");
    writeMigration("20260102000000_crlf.sql", "SELECT 1;\r\nSELECT 2;\r\n");

    const [lf, crlf] = readMigrationFiles(dir);
    expect(lf.checksum).toBe(crlf.checksum);
  });

  it("detecta la directiva no-transaction en la primera línea", () => {
    writeMigration("20260101000000_normal.sql", "SELECT 1;");
    writeMigration(
      "20260102000000_notx.sql",
      "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY x ON y (z);",
    );

    const [normal, notx] = readMigrationFiles(dir);
    expect(normal.noTransaction).toBe(false);
    expect(notx.noTransaction).toBe(true);
  });
});

describe("runMigrations", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cocktrail-mig-"));
    resetMigrationsStatusForTests();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("tabla vacía → aplica todas como baseline", async () => {
    writeMigration("20260101000000_first.sql");
    writeMigration("20260102000000_second.sql");
    const fake = makeFakeRepo([]);

    const status = await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(status.state).toBe("ok");
    expect(status.appliedNow).toEqual([
      "20260101000000_first.sql",
      "20260102000000_second.sql",
    ]);
    expect(fake.appliedCalls.every((c) => c.appliedBy === "baseline")).toBe(true);
  });

  it("saltea las ya aplicadas y usa applied_by=runner", async () => {
    writeMigration("20260101000000_first.sql", "SELECT 1;");
    writeMigration("20260102000000_second.sql");
    const [first] = readMigrationFiles(dir);
    const fake = makeFakeRepo([{ version: first.version, checksum: first.checksum }]);

    const status = await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(status.appliedNow).toEqual(["20260102000000_second.sql"]);
    expect(fake.appliedCalls[0].appliedBy).toBe("runner");
  });

  it("drift: checksum distinto se flaggea sin re-ejecutar", async () => {
    writeMigration("20260101000000_first.sql", "SELECT 1;");
    const fake = makeFakeRepo([
      { version: "20260101000000_first.sql", checksum: "checksum-viejo" },
    ]);

    const status = await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(status.state).toBe("degraded");
    expect(status.drift).toHaveLength(1);
    expect(status.drift[0].version).toBe("20260101000000_first.sql");
    expect(fake.appliedCalls).toHaveLength(0);
  });

  it("stop al primer fallo: registra failed y deja el resto como pending", async () => {
    writeMigration("20260101000000_first.sql");
    writeMigration("20260102000000_boom.sql");
    writeMigration("20260103000000_third.sql");
    const fake = makeFakeRepo([]);
    fake.applyInTransaction.mockImplementation(async (migration: MigrationFile) => {
      if (migration.version.includes("boom")) throw new Error("syntax error");
      fake.appliedCalls.push({ migration, appliedBy: "baseline", tx: true });
    });

    const status = await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(status.state).toBe("degraded");
    expect(status.appliedNow).toEqual(["20260101000000_first.sql"]);
    expect(status.failed).toEqual({
      version: "20260102000000_boom.sql",
      error: "syntax error",
    });
    expect(status.pending).toEqual(["20260103000000_third.sql"]);
  });

  it("la directiva no-transaction rutea a applyWithoutTransaction", async () => {
    writeMigration("20260101000000_notx.sql", "-- migrate:no-transaction\nSELECT 1;");
    const fake = makeFakeRepo([]);

    await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(fake.applyWithoutTransaction).toHaveBeenCalledOnce();
    expect(fake.applyInTransaction).not.toHaveBeenCalled();
  });

  it("nunca lanza: fallo de conexión → degraded con failed (infra)", async () => {
    writeMigration("20260101000000_first.sql");
    const fake = makeFakeRepo([]);
    fake.connect.mockRejectedValue(new Error("ECONNREFUSED"));

    const status = await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(status.state).toBe("degraded");
    expect(status.failed?.version).toBe("(infra)");
    expect(status.failed?.error).toContain("ECONNREFUSED");
  });

  it("lock inconseguible → degraded sin aplicar nada, y desconecta igual", async () => {
    writeMigration("20260101000000_first.sql");
    const fake = makeFakeRepo([]);
    fake.tryAcquireLock.mockResolvedValue(false);

    const status = await runMigrations({
      repo: asRepo(fake),
      migrationsDir: dir,
      lockRetryDelayMs: 1,
    });

    expect(status.state).toBe("degraded");
    expect(status.failed?.version).toBe("(infra)");
    expect(fake.appliedCalls).toHaveLength(0);
    expect(fake.disconnect).toHaveBeenCalled();
  });

  it("publica el resultado en el singleton", async () => {
    writeMigration("20260101000000_first.sql");
    const fake = makeFakeRepo([]);

    await runMigrations({ repo: asRepo(fake), migrationsDir: dir });

    expect(getMigrationsStatus().state).toBe("ok");
    expect(getMigrationsStatus().appliedNow).toEqual(["20260101000000_first.sql"]);
  });
});
