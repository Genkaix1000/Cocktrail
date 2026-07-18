import { apiFetch } from "./api-client";
export { setActiveBarContext } from "@/lib/bar-context";

export type BarSession = {
  id: string;
  barId: string;
  userId: string;
  username: string;
  role: "caja" | "admin";
  connectedAt: string;
  lastSeenAt: string;
};

export type BarSessionOption = {
  barId: string;
  name: string;
  code: string | null;
  status: "available" | "occupied" | "mine";
  session: Pick<BarSession, "username" | "connectedAt"> | null;
};

export type BarSessionOptions = {
  boxes: BarSessionOption[];
  currentSession: BarSession | null;
};

function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem("cocktrail-device-id");
  if (!id) {
    id = randomUUID();
    sessionStorage.setItem("cocktrail-device-id", id);
  }
  return id;
}

export const barSessionsService = {
  listOptions(signal?: AbortSignal) {
    return apiFetch<BarSessionOptions>("/api/bar-sessions/options", {
      signal,
      headers: { "X-Device-Id": getDeviceId() },
    });
  },

  join(barId: string) {
    return apiFetch<{ joined: true; session: BarSession }>("/api/bar-sessions/join", {
      method: "POST",
      body: { barId, deviceId: getDeviceId() },
    });
  },

  leave() {
    return apiFetch<{ ok: true }>("/api/bar-sessions/leave", {
      method: "DELETE",
      body: { deviceId: getDeviceId() },
    });
  },

  heartbeat() {
    return apiFetch<BarSession>("/api/bar-sessions/heartbeat", {
      method: "POST",
      body: { deviceId: getDeviceId() },
    });
  },
};
