import { apiFetch } from "./api-client";
import type { Role } from "@cocktrail/shared";
import { setActiveBarContext } from "@/lib/bar-context";

type LoginResponse = { username: string; role: Role };
type MeResponse = {
  role: Role;
  username: string;
  permissions: {
    closeNight: boolean;
    cancelarTickets: boolean;
    historial: boolean;
    metricas: boolean;
  };
  isSuperadmin?: boolean;
} | null;

export const authService = {
  login(username: string, password: string, cfTurnstileToken?: string) {
    return apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      // apiFetch ya hace JSON.stringify — no wrappear de nuevo.
      body: { username, password, ...(cfTurnstileToken ? { cfTurnstileToken } : {}) },
    });
  },

  async logout() {
    try {
      return await apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } finally {
      setActiveBarContext(null);
    }
  },

  getMe() {
    return apiFetch<MeResponse>("/api/auth/me");
  },
};
