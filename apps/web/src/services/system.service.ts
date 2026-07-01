import { apiFetch } from "./api-client";

export type SystemStatus = {
  internet: { connected: boolean };
  localDb: { connected: boolean };
  cloudDb: { connected: boolean; configured: boolean };
  posnet: {
    connected: boolean;
    configured: boolean;
    paired: boolean;
    deviceId: string | null;
    message: string;
    details?: {
      model: string;
      serialNumber: string;
      operatingMode: string;
    } | null;
  };
  printer: {
    connected: boolean;
    configured: boolean;
    message: string;
  };
  sync: {
    synced: boolean;
    pendingEvents: number;
  };
  eventDetails?: {
    id: string;
    status: string;
    orderCounter: number;
  } | null;
  serverStartedAt?: number;
};

export const systemService = {
  getStatus() {
    return apiFetch<SystemStatus>("/api/system/status");
  },

  sync() {
    return apiFetch<{ success: boolean; message: string; pulled: boolean; pushed: { successCount: number; failedCount: number } }>("/api/system/sync", {
      method: "POST"
    });
  },

  shutdown(password: string, username?: string) {
    return apiFetch<{ success: boolean; message: string }>("/api/system/shutdown", {
      method: "POST",
      body: { username, password }
    });
  }
};
