import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getMigrationsStatus,
  isDegraded,
  setMigrationsStatus,
  type MigrationDrift,
  type MigrationsStatus,
} from "./migrations-status.js";
import type { PgMigrationsRepository } from "./pg-migrations.repository";

export type MigrationFile = {
  /** = nombre de archivo, ej. "20260715000000_bars.sql". Única identidad. */
  version: string;
  sql: string;
  /** sha256 hex del contenido con EOL normalizado a \n. */
  checksum: string;
  /** Primera línea === "-- migrate:no-transaction". */
  noTransaction: boolean;
};

// Excluye schema.sql (dump cumulativo stale) y cualquier archivo no versionado.
const MIGRATION_FILE_PATTERN = /^\d{14}_.+\.sql$/;

const NO_TRANSACTION_DIRECTIVE = "-- migrate:no-transaction";

const LOCK_RETRY_ATTEMPTS = 10;
const LOCK_RETRY_DELAY_MS = 3000;

export function readMigrationFiles(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort() // timestamps zero-padded → orden lexicográfico = cronológico
    .map((name) => {
      // Normalizar CRLF antes de hashear: evita drift fantasma en checkouts Windows.
      const sql = readFileSync(join(dir, name), "utf8").replace(/\r\n/g, "\n");
      return {
        version: name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
        noTransaction: sql.split("\n", 1)[0]?.trim() === NO_TRANSACTION_DIRECTIVE,
      };
    });
}

/**
 * Aplica las migraciones pendientes de `migrationsDir`. NUNCA lanza: cualquier
 * fallo (SQL o de infra) termina en un status "degraded" que el boot fail-open
 * expone vía /api/system/health y el banner de /admin.
 */
export async function runMigrations(opts: {
  repo: PgMigrationsRepository;
  migrationsDir: string;
  /** Solo para tests: acorta la espera del lock. */
  lockRetryDelayMs?: number;
}): Promise<MigrationsStatus> {
  const { repo, migrationsDir } = opts;
  const lockDelay = opts.lockRetryDelayMs ?? LOCK_RETRY_DELAY_MS;

  const status: MigrationsStatus = {
    state: "running",
    lastRunAt: new Date().toISOString(),
    appliedNow: [],
    pending: [],
    failed: null,
    drift: [],
  };
  setMigrationsStatus(status);

  let connected = false;
  let locked = false;

  try {
    const files = readMigrationFiles(migrationsDir);

    await repo.connect();
    connected = true;

    locked = await acquireLockWithRetry(repo, lockDelay);
    if (!locked) {
      throw new Error(
        "No se pudo tomar el advisory lock de migraciones (¿otro proceso lo retiene?)",
      );
    }

    await repo.ensureMigrationsTable();
    const applied = await repo.listApplied();
    const appliedByVersion = new Map(applied.map((a) => [a.version, a.checksum]));

    // Backfill por re-ejecución: tabla vacía = instalación creada por
    // init-scripts (o de cero) → se aplican todas como baseline. Las
    // migraciones son idempotentes, así que sobre schema existente son no-ops.
    const appliedBy = applied.length === 0 ? "baseline" : "runner";

    status.drift = detectDrift(files, appliedByVersion);

    const pendingFiles = files.filter((f) => !appliedByVersion.has(f.version));
    for (let i = 0; i < pendingFiles.length; i++) {
      const migration = pendingFiles[i];
      try {
        if (migration.noTransaction) {
          await repo.applyWithoutTransaction(migration, appliedBy);
        } else {
          await repo.applyInTransaction(migration, appliedBy);
        }
        status.appliedNow.push(migration.version);
      } catch (err) {
        // Stop al primer fallo: las siguientes pueden depender de esta.
        // La transacción rollbackeó sola → la base queda como estaba.
        status.failed = { version: migration.version, error: errorMessage(err) };
        status.pending = pendingFiles.slice(i + 1).map((f) => f.version);
        console.error(
          `[migrations] ❌ Falló ${migration.version}: ${status.failed.error}`,
        );
        break;
      }
    }

    // Re-asegura el REVOKE sobre schema_migrations: las migraciones legacy
    // (20240101/20240102) hacen GRANT ALL ON ALL TABLES a anon/authenticated
    // y en una corrida baseline re-abren la tabla después del bootstrap.
    await repo.ensureMigrationsTable();
  } catch (err) {
    status.failed = { version: "(infra)", error: errorMessage(err) };
    console.error(`[migrations] ❌ Error de infraestructura: ${status.failed.error}`);
  } finally {
    if (locked) await repo.releaseLock().catch(() => {});
    if (connected) await repo.disconnect().catch(() => {});
  }

  status.state = isDegraded(status) ? "degraded" : "ok";
  setMigrationsStatus(status);
  console.log(
    `[migrations] ${status.appliedNow.length} aplicadas, ${status.pending.length} pendientes, drift: ${status.drift.length} (${status.state})`,
  );
  return status;
}

/**
 * Acepta drift legítimo: pisa checksums registrados con los del disco actual
 * y limpia el estado en memoria. No re-ejecuta SQL.
 */
export async function acceptMigrationDrift(opts: {
  repo: PgMigrationsRepository;
}): Promise<{ updated: number; versions: string[] }> {
  const current = getMigrationsStatus();
  if (current.drift.length === 0) {
    return { updated: 0, versions: [] };
  }

  let connected = false;
  try {
    await opts.repo.connect();
    connected = true;
    const versions: string[] = [];
    for (const d of current.drift) {
      await opts.repo.updateChecksum(d.version, d.actual);
      versions.push(d.version);
    }
    const next: MigrationsStatus = {
      ...current,
      drift: [],
      lastRunAt: new Date().toISOString(),
    };
    next.state = isDegraded(next) ? "degraded" : "ok";
    setMigrationsStatus(next);
    console.log(`[migrations] Drift aceptado en ${versions.length} archivo(s): ${versions.join(", ")}`);
    return { updated: versions.length, versions };
  } finally {
    if (connected) await opts.repo.disconnect().catch(() => {});
  }
}

async function acquireLockWithRetry(
  repo: PgMigrationsRepository,
  delayMs: number,
): Promise<boolean> {
  for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt++) {
    if (await repo.tryAcquireLock()) return true;
    if (attempt < LOCK_RETRY_ATTEMPTS) {
      console.warn(
        `[migrations] Lock ocupado, reintento ${attempt}/${LOCK_RETRY_ATTEMPTS}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

function detectDrift(
  files: MigrationFile[],
  appliedByVersion: Map<string, string>,
): MigrationDrift[] {
  const drift: MigrationDrift[] = [];
  for (const file of files) {
    const recorded = appliedByVersion.get(file.version);
    if (recorded !== undefined && recorded !== file.checksum) {
      drift.push({ version: file.version, expected: recorded, actual: file.checksum });
      console.warn(
        `[migrations] ⚠ Drift en ${file.version}: el archivo cambió después de aplicarse. ` +
          "Verificalo y actualizá el checksum a mano si el cambio es legítimo.",
      );
    }
  }
  return drift;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
