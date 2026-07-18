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

export const barSessionsService = {
  listOptions(signal?: AbortSignal) {
    return apiFetch<BarSessionOptions>("/api/bar-sessions/options", { signal });
  },

  join(barId: string) {
    return apiFetch<{ joined: true; session: BarSession }>("/api/bar-sessions/join", {
      method: "POST",
      body: { barId },
    });
  },

  leave() {
    return apiFetch<{ ok: true }>("/api/bar-sessions/leave", {
      method: "DELETE",
    });
  },

  heartbeat() {
    return apiFetch<BarSession>("/api/bar-sessions/heartbeat", {
      method: "POST",
    });
  },
};
