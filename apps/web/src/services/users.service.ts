import { apiFetch } from "./api-client";
import type { Role } from "@cocktrail/shared";

export type SafeUser = {
  id: string;
  username: string;
  role: Role;
  createdAt: number;
};

export type CreateUserInput = {
  username: string;
  password: string;
  role: Role;
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
