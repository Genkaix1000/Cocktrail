/**
 * Estado en memoria del runner de migraciones. Singleton deliberado:
 * el sistema asume un único proceso Node (ARCHITECTURE §7), y este estado
 * lo escribe solo el runner en el boot y lo leen /api/system/health y
 * /api/system/status para el banner de /admin.
 */

export type MigrationDrift = {
  version: string;
  expected: string;
  actual: string;
};

export type MigrationsStatus = {
  state: "unknown" | "running" | "ok" | "degraded";
  lastRunAt: string | null;
  /** Migraciones aplicadas en esta corrida. */
  appliedNow: string[];
  /** Quedaron sin aplicar (por un fallo previo en la cadena). */
  pending: string[];
  /** La primera que falló; el runner se detiene ahí. "(infra)" si falló la conexión/lock. */
  failed: { version: string; error: string } | null;
  /** Aplicadas cuyo contenido en disco ya no coincide con el checksum registrado. */
  drift: MigrationDrift[];
};

const initialStatus: MigrationsStatus = {
  state: "unknown",
  lastRunAt: null,
  appliedNow: [],
  pending: [],
  failed: null,
  drift: [],
};

let status: MigrationsStatus = initialStatus;

export function getMigrationsStatus(): MigrationsStatus {
  return status;
}

export function setMigrationsStatus(next: MigrationsStatus): void {
  status = next;
}

export function isDegraded(s: MigrationsStatus): boolean {
  return s.failed !== null || s.pending.length > 0 || s.drift.length > 0;
}

export function resetMigrationsStatusForTests(): void {
  status = initialStatus;
}
