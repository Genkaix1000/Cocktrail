import { apiFetch } from "./api-client";

// Espejo de MigrationsStatus / SystemHealth del backend (apps/api/src/infra/migrations).
export type MigrationsStatus = {
  state: "unknown" | "running" | "ok" | "degraded";
  lastRunAt: string | null;
  appliedNow: string[];
  pending: string[];
  failed: { version: string; error: string } | null;
  drift: { version: string; expected: string; actual: string }[];
};

// Espejo del preflight F1 del token de emergencia de MP (apps/api).
export type MpFallbackHealth = {
  status: "usable" | "unusable" | "unknown";
  tokenUserId?: string;
  deviceSeen?: boolean;
  operatingMode?: string;
  reason?: string;
  checkedAt: string;
};

export type SystemHealth = {
  status: "ok" | "degraded";
  migrations: MigrationsStatus;
  serverStartedAt: number;
  // Opcional: tolera un backend que todavía no expone el preflight de MP.
  mpFallback?: MpFallbackHealth;
};

export const systemService = {
  getHealth() {
    return apiFetch<SystemHealth>("/api/system/health");
  },
};
