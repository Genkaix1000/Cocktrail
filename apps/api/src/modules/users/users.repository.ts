import { createHash } from "node:crypto";
import type { Role } from "@cocktrail/shared";

// ── Types ──

export type StaffUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: number;
};

/** Public-facing user data (sin hash de contraseña). */
export type SafeUser = Omit<StaffUser, "passwordHash">;

// ── Interface (contrato) ──

export interface UsersRepository {
  list(): Promise<SafeUser[]>;
  findById(id: string): Promise<StaffUser | undefined>;
  findByUsername(username: string): Promise<StaffUser | undefined>;
  create(user: StaffUser): Promise<StaffUser>;
  update(user: StaffUser): Promise<StaffUser>;
  delete(id: string): Promise<boolean>;
}

// ── Helpers ──

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export { hashPassword };

// ── Implementación Supabase (fase 4 — Edge Sync) ──

import { supabase, supabaseCloud } from "../../shared/supabase.js";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  created_at: string;
};

function mapRowToUser(row: UserRow): StaffUser {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role as Role,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export class SupabaseUsersRepository implements UsersRepository {
  async list(): Promise<SafeUser[]> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseUsersRepository] Error listing users:", error);
      throw error;
    }

    return data.map(row => {
      const { passwordHash: _ph, ...rest } = mapRowToUser(row);
      return rest;
    });
  }

  async findById(id: string): Promise<StaffUser | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseUsersRepository] Error finding user by id:", error);
      throw error;
    }

    return data ? mapRowToUser(data) : undefined;
  }

  async findByUsername(username: string): Promise<StaffUser | undefined> {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseUsersRepository] Error finding user by username:", error);
      throw error;
    }

    return data ? mapRowToUser(data) : undefined;
  }

  async create(user: StaffUser): Promise<StaffUser> {
    const { data, error } = await supabase
      .from("users")
      .insert({
        id: user.id,
        username: user.username,
        password_hash: user.passwordHash,
        role: user.role,
        // permissions ya no es un concepto de la app — se calculan por rol
        // (ver auth.controller.ts /me). La columna sigue NOT NULL en DB, se
        // satisface con un objeto vacío.
        permissions: {},
        created_at: new Date(user.createdAt).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseUsersRepository] Error creating user locally:", error);
      throw error;
    }

    if (supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("users")
          .insert({
            id: user.id,
            username: user.username,
            password_hash: user.passwordHash,
            role: user.role,
            permissions: {},
            created_at: new Date(user.createdAt).toISOString(),
          });
        if (cloudError) {
          console.error("[SupabaseUsersRepository] Error creating user in cloud:", cloudError);
        } else {
          console.log(`[SupabaseUsersRepository] User ${user.id} synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseUsersRepository] Exception syncing user to cloud:", err);
      }
    }

    return mapRowToUser(data);
  }

  async update(user: StaffUser): Promise<StaffUser> {
    const { data, error } = await supabase
      .from("users")
      .update({
        username: user.username,
        password_hash: user.passwordHash,
        role: user.role,
        permissions: {},
      })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[SupabaseUsersRepository] Error updating user locally:", error);
      throw error;
    }

    if (supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("users")
          .update({
            username: user.username,
            password_hash: user.passwordHash,
            role: user.role,
            permissions: {},
          })
          .eq("id", user.id);
        if (cloudError) {
          console.error("[SupabaseUsersRepository] Error updating user in cloud:", cloudError);
        } else {
          console.log(`[SupabaseUsersRepository] User ${user.id} update synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseUsersRepository] Exception updating user in cloud:", err);
      }
    }

    return mapRowToUser(data);
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[SupabaseUsersRepository] Error deleting user locally:", error);
      return false;
    }

    if (supabaseCloud) {
      try {
        const { error: cloudError } = await supabaseCloud
          .from("users")
          .delete()
          .eq("id", id);
        if (cloudError) {
          console.error("[SupabaseUsersRepository] Error deleting user in cloud:", cloudError);
        } else {
          console.log(`[SupabaseUsersRepository] User ${id} deletion synced to cloud.`);
        }
      } catch (err) {
        console.error("[SupabaseUsersRepository] Exception deleting user in cloud:", err);
      }
    }

    return true;
  }
}
