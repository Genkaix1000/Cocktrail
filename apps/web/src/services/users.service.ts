import { apiFetch } from "./api-client";
import type { Role } from "@cocktrail/shared";

export type UserPermissions = {
  closeNight: boolean;
  modifyCarta: boolean;
  manageUsers: boolean;
  monitoreo: boolean;
  metricas: boolean;
  historial: boolean;
  general: boolean;
  carta: boolean;
  pagos: boolean;
  staff: boolean;
  cancelarTickets: boolean;
};

export type SafeUser = {
  id: string;
  username: string;
  role: Role;
  permissions: UserPermissions;
  createdAt: number;
};

export type CreateUserInput = {
  username: string;
  password: string;
  role: Role;
  permissions: UserPermissions;
};

export const usersService = {
  list() {
    return apiFetch<SafeUser[]>("/api/users");
  },

  create(input: CreateUserInput) {
    return apiFetch<SafeUser>("/api/users", { method: "POST", body: input });
  },

  delete(id: string) {
    return apiFetch<{ ok: true }>(`/api/users/${id}`, { method: "DELETE" });
  },

  update(id: string, input: Partial<CreateUserInput>) {
    return apiFetch<SafeUser>(`/api/users/${id}`, { method: "PATCH", body: input });
  },
};
