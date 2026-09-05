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

export type ReleaseNotes = {
  version: string;
  date: string | null;
  highlights: string[];
};

export type AppVersionInfo = {
  version: string;
  channel: string;
  label: string;
  environment: string;
  deploy: {
    provider: "koyeb" | "render" | "local" | "unknown";
    service: string | null;
    commit: string | null;
    commitShort: string | null;
    branch: string | null;
    externalUrl: string | null;
  };
  runtime: {
    node: string;
    serverStartedAt: number;
    uptimeSec: number;
  };
  migrations: {
    state: string;
    pendingCount: number;
    lastApplied: string | null;
  };
  releaseNotes: ReleaseNotes | null;
};

export const systemService = {
  getHealth() {
    return apiFetch<SystemHealth>("/api/system/health");
  },

  getVersion() {
    return apiFetch<AppVersionInfo>("/api/system/version");
  },

  getGhostMode() {
    return apiFetch<{ enabled: boolean }>("/api/system/ghost-mode");
  },

  setGhostMode(enabled: boolean) {
    return apiFetch<{ enabled: boolean }>("/api/system/ghost-mode", {
      method: "PUT",
      body: { enabled },
    });
  },

  /** Acepta drift legítimo (checksum disco → registrado). Admin only. */
  acceptMigrationDrift() {
    return apiFetch<{ updated: number; versions: string[] }>(
      "/api/system/migrations/accept-drift",
      { method: "POST" },
    );
  },
};
