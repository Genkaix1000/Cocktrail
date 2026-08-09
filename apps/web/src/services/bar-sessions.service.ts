import { apiFetch } from "./api-client";

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

// D6: la identidad de la sesión de caja la deriva el backend de la sesión
// autenticada (cookie). Acá ya no viaja ningún deviceId por pestaña.
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

  /** Solo admin — sesiones de caja activas (tab PDV y Posnets). */
  listAll(signal?: AbortSignal) {
    return apiFetch<BarSession[]>("/api/bar-sessions", { signal });
  },

  /** Solo admin — echa al usuario conectado a una barra. */
  forceLogout(barId: string) {
    return apiFetch<{ ok: true }>("/api/bar-sessions/force-logout", {
      method: "POST",
      body: { barId },
    });
  },

  /** Solo admin — oculta/muestra la barra en el selector de caja. */
  setBarEnabled(barId: string, enabled: boolean) {
    return apiFetch<{ bar: { id: string; enabled: boolean }; ejected: boolean }>(
      `/api/bar-sessions/bars/${encodeURIComponent(barId)}/enabled`,
      { method: "PATCH", body: { enabled } },
    );
  },
};
