import { apiFetch } from "./api-client";

export type SyncTableResult = { ok: number; failed: number; error?: string };

export type RestoreResult = {
  nightEvents: SyncTableResult;
  orders: SyncTableResult;
  tickets: SyncTableResult;
  cashSales: SyncTableResult;
  auditLogs: SyncTableResult;
};

export const systemService = {
  restore(password: string) {
    return apiFetch<RestoreResult>("/api/system/restore", {
      method: "POST",
      body: { password },
    });
  },
};
