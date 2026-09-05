import {
  getMigrationsStatus,
  isDegraded,
  type MigrationsStatus,
} from "../../infra/migrations/migrations-status.js";
import { acceptMigrationDrift } from "../../infra/migrations/migration-runner.js";
import type { PgMigrationsRepository } from "../../infra/migrations/pg-migrations.repository.js";
import {
  getMpFallbackStatus,
  runMpFallbackPreflight,
  type MpFallbackStatus,
} from "../mercadopago/mp-fallback-preflight.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import { buildAppVersionInfo, type AppVersionInfo } from "./app-version.js";
import {
  GHOST_MODE_FLAG,
  type SystemFlagsRepository,
} from "./system-flags.repository.js";

const serverStartedAt = Date.now();

export type { AppVersionInfo };

export type SystemHealth = {
  status: "ok" | "degraded";
  migrations: MigrationsStatus;
  /** F1.d — estado del preflight del fallback de emergencia de MP. */
  mpFallback: MpFallbackStatus;
  serverStartedAt: number;
};

/**
 * Lógica de negocio de `/api/system` — antes vivía inline en los route handlers de
 * system.controller.ts (sin capa Service, la única excepción a Controller→Service→
 * Repository del resto del proyecto). Ver docs/specs/02-auditoria-api/deuda-estructural-fase2.md (punto 4).
 */
export class SystemService {
  constructor(
    /** Solo para accept-drift — conexión directa a Postgres (mismo que el runner). */
    private migrationsRepo?: PgMigrationsRepository,
    private flagsRepo?: SystemFlagsRepository,
  ) {}

  /**
   * Acepta drift de migraciones ya aplicadas (checksum disco → registrado).
   * No re-ejecuta SQL. Admin only vía controller.
   */
  async acceptMigrationDrift(): Promise<{ updated: number; versions: string[] }> {
    if (!this.migrationsRepo) {
      throw new Conflict("No hay conexión a Postgres para reparar migraciones.");
    }
    const drift = getMigrationsStatus().drift;
    if (drift.length === 0) {
      return { updated: 0, versions: [] };
    }
    try {
      return await acceptMigrationDrift({ repo: this.migrationsRepo });
    } catch (err) {
      throw new Conflict(
        err instanceof Error
          ? `No se pudo aceptar el drift: ${err.message}`
          : "No se pudo aceptar el drift de migraciones.",
      );
    }
  }

  /**
   * Liviano (lee un singleton en memoria, sin I/O). Lo pollea el banner de
   * migraciones de /admin. El singleton se lee directo (sin DI): lo escribe
   * solo el runner del boot y es el diseño del estado.
   */
  getHealth(): SystemHealth {
    const migrations = getMigrationsStatus();
    return {
      status: isDegraded(migrations) ? "degraded" : "ok",
      migrations,
      // F1.d: singleton del preflight — un fallback degradado NO marca el
      // health general como "degraded" (es la red de seguridad, no el camino activo).
      mpFallback: getMpFallbackStatus(),
      serverStartedAt,
    };
  }

  /** Versión de producto + metadata de deploy (Render/local). Sin I/O. */
  getVersion(): AppVersionInfo {
    const migrations = getMigrationsStatus();
    return buildAppVersionInfo({
      serverStartedAt,
      migrations: {
        state: migrations.state,
        pending: migrations.pending,
        appliedNow: migrations.appliedNow,
      },
    });
  }

  /** F1.c — re-evaluación on-demand del preflight (nunca lanza). */
  async refreshMpFallback(): Promise<MpFallbackStatus> {
    return runMpFallbackPreflight();
  }

  async isGhostMode(): Promise<boolean> {
    if (!this.flagsRepo) return false;
    return this.flagsRepo.get(GHOST_MODE_FLAG);
  }

  async getGhostMode(): Promise<{ enabled: boolean }> {
    return { enabled: await this.isGhostMode() };
  }

  async setGhostMode(enabled: boolean, updatedBy: string): Promise<{ enabled: boolean }> {
    if (!this.flagsRepo) {
      throw new Conflict("Flags de sistema no disponibles.");
    }
    const row = await this.flagsRepo.set(GHOST_MODE_FLAG, enabled, updatedBy);
    return { enabled: row.value };
  }
}
