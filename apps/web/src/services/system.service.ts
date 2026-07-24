import { apiFetch } from "./api-client";

export type SyncTableResult = { ok: number; failed: number; error?: string };

// Espejo de RestoreResult del backend (apps/api/src/modules/sync/sync.service.ts).
export type RestoreResult = {
  nightEvents: SyncTableResult;
  mpCajas: SyncTableResult;
  mpDevices: SyncTableResult;
  mpOrders: SyncTableResult;
  orders: SyncTableResult;
  tickets: SyncTableResult;
  auditLogs: SyncTableResult;
};

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
  restore(password: string) {
    return apiFetch<RestoreResult>("/api/system/restore", {
      method: "POST",
      body: { password },
    });
  },

  getHealth() {
    return apiFetch<SystemHealth>("/api/system/health");
  },
};
