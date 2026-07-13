import { apiFetch } from "./api-client";
import type { Role } from "@cocktrail/shared";

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
} | null;

export const authService = {
  login(username: string, password: string) {
    return apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
  },

  logout() {
    return apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },

  getMe() {
    return apiFetch<MeResponse>("/api/auth/me");
  },
};
