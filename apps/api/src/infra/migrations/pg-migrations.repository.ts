import { Client } from "pg";

import type { MigrationFile } from "./migration-runner";

/**
 * ÚNICO archivo del repo que usa el driver `pg`. Todo lo demás habla con la
 * base por PostgREST (@supabase/supabase-js), que no puede ejecutar DDL —
 * por eso el runner de migraciones necesita esta conexión directa (:54322).
 * No usar `pg` fuera de infra/migrations.
 */

/** Clave arbitraria del advisory lock ("cocktrail migrations"). */
const MIGRATIONS_LOCK_KEY = 727_274_001;

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,          -- nombre de archivo; ÚNICA identidad
  checksum    TEXT NOT NULL,             -- sha256; se compara, no identifica
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL,
  applied_by  TEXT NOT NULL              -- 'baseline' | 'runner'
);
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
`;

export type AppliedMigration = {
  version: string;
  checksum: string;
};

export class PgMigrationsRepository {
  // Un único Client (NO Pool): el advisory lock es por sesión y debe vivir
  // en la misma conexión que lo toma y lo libera.
  private client: Client | null = null;

  constructor(private readonly databaseUrl: string) {}

  async connect(): Promise<void> {
    // ponytail: retry-loop, el container arranca asíncrono.
    const maxRetries = 5;
    let lastErr: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        this.client = new Client({
          connectionString: this.databaseUrl,
          connectionTimeoutMillis: 5000,
        });
        await this.client.connect();
        return;
      } catch (err: any) {
        lastErr = err;
        if (i < maxRetries - 1) {
          const delay = 3000 * (i + 1);
          console.warn(
            `[migrations] DB connect attempt ${i + 1}/${maxRetries} failed, retrying in ${delay}ms: ${err.message}`,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end().catch(() => {});
      this.client = null;
    }
  }

  private get db(): Client {
    if (!this.client) throw new Error("PgMigrationsRepository: no conectado");
    return this.client;
  }

  async tryAcquireLock(): Promise<boolean> {
    const { rows } = await this.db.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MIGRATIONS_LOCK_KEY],
    );
    return rows[0]?.locked === true;
  }

  async releaseLock(): Promise<void> {
    await this.db.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]);
  }

  /** Bootstrap idempotente — corre en cada boot, no es una migración más. */
  async ensureMigrationsTable(): Promise<void> {
    await this.db.query(BOOTSTRAP_SQL);
  }

  async listApplied(): Promise<AppliedMigration[]> {
    const { rows } = await this.db.query<AppliedMigration>(
      "SELECT version, checksum FROM public.schema_migrations ORDER BY version",
    );
    return rows;
  }

  async applyInTransaction(migration: MigrationFile, appliedBy: string): Promise<void> {
    const startedAt = Date.now();
    await this.db.query("BEGIN");
    try {
      await this.db.query(migration.sql);
      await this.insertRecord(migration, appliedBy, Date.now() - startedAt);
      await this.db.query("COMMIT");
    } catch (err) {
      await this.db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  /**
   * Para `-- migrate:no-transaction` (DDL no transaccional, ej. CREATE INDEX
   * CONCURRENTLY). NO atómico: si el proceso muere entre el SQL y el registro,
   * el próximo boot re-ejecuta el .sql — por eso toda migración DEBE ser
   * idempotente (invariante del repo).
   */
  async applyWithoutTransaction(migration: MigrationFile, appliedBy: string): Promise<void> {
    const startedAt = Date.now();
    await this.db.query(migration.sql);
    await this.insertRecord(migration, appliedBy, Date.now() - startedAt);
  }

  private async insertRecord(
    migration: MigrationFile,
    appliedBy: string,
    durationMs: number,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO public.schema_migrations (version, checksum, duration_ms, applied_by)
       VALUES ($1, $2, $3, $4)`,
      [migration.version, migration.checksum, durationMs, appliedBy],
    );
  }

  /** Acepta drift legítimo: actualiza el checksum registrado al del archivo actual. */
  async updateChecksum(version: string, checksum: string): Promise<void> {
    await this.db.query(
      `UPDATE public.schema_migrations SET checksum = $2 WHERE version = $1`,
      [version, checksum],
    );
  }
}
