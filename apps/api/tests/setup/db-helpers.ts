import { randomUUID } from "node:crypto";
import { supabase } from "../../src/shared/supabase.js";
import { signSession, COOKIE_NAME } from "../../src/modules/auth/session.js";
import { hashPassword } from "../../src/modules/users/users.repository.js";
import type { Role } from "@cocktrail/shared";
import type { UserPermissions } from "../../src/modules/users/users.repository.js";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Borra night_events (cascadea orders/tickets/cash_sales vía ON DELETE CASCADE). */
export async function cleanNightEvents(): Promise<void> {
  const { error } = await supabase.from("night_events").delete().neq("id", NIL_UUID);
  if (error) throw error;
}

export async function cleanUsers(): Promise<void> {
  const { error } = await supabase.from("users").delete().neq("id", NIL_UUID);
  if (error) throw error;
}

export async function cleanDrinks(): Promise<void> {
  const { error } = await supabase.from("drinks").delete().neq("id", -1);
  if (error) throw error;
}

export async function cleanAppConfig(): Promise<void> {
  const { error } = await supabase.from("app_config").delete().neq("id", "__never__");
  if (error) throw error;
}

export async function cleanAuditLogs(): Promise<void> {
  const { error } = await supabase.from("audit_logs").delete().neq("id", NIL_UUID);
  if (error) throw error;
}

const FULL_PERMISSIONS: UserPermissions = {
  closeNight: true,
  modifyCarta: true,
  manageUsers: true,
  monitoreo: true,
  metricas: true,
  historial: true,
  general: true,
  carta: true,
  pagos: true,
  staff: true,
  cancelarTickets: true,
};

/** Crea un usuario de test en la tabla `users` (password sin hashear para login por API). */
export async function createTestAdmin(opts?: {
  username?: string;
  password?: string;
  role?: Role;
  permissions?: Partial<UserPermissions>;
}): Promise<{ id: string; username: string; password: string; role: Role }> {
  const username = opts?.username ?? `test-admin-${randomUUID().slice(0, 8)}`;
  const password = opts?.password ?? "test-password-123";
  const role = opts?.role ?? "admin";

  const { data, error } = await supabase
    .from("users")
    .insert({
      id: randomUUID(),
      username,
      password_hash: hashPassword(password),
      role,
      permissions: { ...FULL_PERMISSIONS, ...opts?.permissions },
    })
    .select()
    .single();

  if (error) throw error;
  return { id: data.id, username, password, role };
}

/** Firma una cookie de sesión válida sin pasar por /api/auth/login. */
export function signTestSession(username: string, role: Role): string {
  const { value } = signSession(username, role);
  return `${COOKIE_NAME}=${value}`;
}


/** Crea un trago de test disponible, para tests de orders/drinks. */
export async function createTestDrink(opts?: {
  id?: number;
  name?: string;
  price?: number;
  available?: boolean;
}): Promise<{ id: number; name: string; price: number }> {
  const id = opts?.id ?? Math.floor(Math.random() * 1_000_000) + 1;
  const name = opts?.name ?? `Trago Test ${id}`;
  const price = opts?.price ?? 1500;
  const { error } = await supabase.from("drinks").insert({
    id,
    name,
    price,
    description: "trago de test",
    vibe: "test",
    flavors: [],
    icon_name: "GlassWater",
    trending: false,
    promo: false,
    available: opts?.available ?? true,
  });
  if (error) throw error;
  return { id, name, price };
}
