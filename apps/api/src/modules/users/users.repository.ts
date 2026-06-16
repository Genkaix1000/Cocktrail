import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Role } from "@cocktrail/shared";

// ── Types ──

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

export type StaffUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  permissions: UserPermissions;
  createdAt: number;
};

/** Public-facing user data (sin hash de contraseña). */
export type SafeUser = Omit<StaffUser, "passwordHash">;

// ── Interface (contrato) ──

export interface UsersRepository {
  list(): SafeUser[];
  findById(id: string): StaffUser | undefined;
  findByUsername(username: string): StaffUser | undefined;
  create(user: StaffUser): StaffUser;
  update(user: StaffUser): StaffUser;
  delete(id: string): boolean;
}

// ── Helpers ──

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export { hashPassword };

// ── Implementación JSON Local (fase 3.5 — persistencia en disco) ──

const DATA_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../../data",
);
const USERS_FILE = path.join(DATA_DIR, "users.json");

export class LocalJSONUsersRepository implements UsersRepository {
  private users = new Map<string, StaffUser>();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, "utf-8");
        const arr: StaffUser[] = JSON.parse(raw);
        this.users.clear();
        for (const u of arr) this.users.set(u.id, u);
      }
    } catch (err) {
      console.error("[LocalJSONUsersRepository] Error loading users.json:", err);
    }
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const arr = Array.from(this.users.values());
      fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2), "utf-8");
    } catch (err) {
      console.error("[LocalJSONUsersRepository] Error persisting users.json:", err);
    }
  }

  list(): SafeUser[] {
    return Array.from(this.users.values()).map(
      ({ passwordHash: _ph, ...rest }) => rest,
    );
  }

  findById(id: string): StaffUser | undefined {
    return this.users.get(id);
  }

  findByUsername(username: string): StaffUser | undefined {
    for (const u of this.users.values()) {
      if (u.username === username) return u;
    }
    return undefined;
  }

  create(user: StaffUser): StaffUser {
    this.users.set(user.id, user);
    this.persist();
    return user;
  }

  update(user: StaffUser): StaffUser {
    this.users.set(user.id, user);
    this.persist();
    return user;
  }

  delete(id: string): boolean {
    const deleted = this.users.delete(id);
    if (deleted) this.persist();
    return deleted;
  }
}
