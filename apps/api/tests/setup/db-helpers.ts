import { randomUUID } from "node:crypto";
import { supabase } from "../../src/shared/supabase.js";
import { signSession, COOKIE_NAME } from "../../src/modules/auth/session.js";
import { hashPassword } from "../../src/modules/users/users.repository.js";
import type { Role } from "@cocktrail/shared";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Los tests de integración pegan contra el MISMO Supabase local que usa el
 * dev server (no hay una DB de test aislada) — un `cleanX()` sin acotar borra
 * catálogo/usuarios/noches reales de un boliche real. `TEST_DRINK_ID_FLOOR`/
 * `TEST_USERNAME_PREFIX` son la convención que evita eso: todo lo que crean
 * los helpers de este archivo cae en ese rango/prefijo, y los `cleanX()` solo
 * borran ahí. Ver docs/ROADMAP.md — sigue habiendo riesgo real para
 * night_events/orders/tickets/cash_sales, que no se crean por un helper único
 * y no tienen todavía una convención equivalente.
 */
export const TEST_DRINK_ID_FLOOR = 200;
export const TEST_USERNAME_PREFIX = "test-";

/**
 * Borra night_events (cascadea orders/tickets/cash_sales vía ON DELETE CASCADE).
 *
 * `mp_orders.event_id` es la excepción: referencia night_events SIN cascade, así
 * que hay que desvincularla ANTES o el delete falla por FK (mismo orden que
 * respeta TABLES_TO_RESET en scripts/reset-data.ts). Se pone en NULL en vez de
 * borrar: los cobros son historial real de la DB local compartida y no son
 * hijos de la noche.
 */
export async function cleanNightEvents(): Promise<void> {
  const { error: unlinkError } = await supabase
    .from("mp_orders")
    .update({ event_id: null })
    .not("event_id", "is", null);
  if (unlinkError) throw unlinkError;

  const { error } = await supabase.from("night_events").delete().neq("id", NIL_UUID);
  if (error) throw error;
}

/** Solo borra usuarios de test (username con prefijo `test-`) — nunca cuentas reales. */
export async function cleanUsers(): Promise<void> {
  const { error } = await supabase.from("users").delete().like("username", `${TEST_USERNAME_PREFIX}%`);
  if (error) throw error;
}

/** Solo borra tragos de test (id >= TEST_DRINK_ID_FLOOR) — nunca el catálogo real. */
export async function cleanDrinks(): Promise<void> {
  const { error } = await supabase.from("drinks").delete().gte("id", TEST_DRINK_ID_FLOOR);
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

/** Crea un usuario de test en la tabla `users` (password sin hashear para login por API). */
export async function createTestAdmin(opts?: {
  username?: string;
  password?: string;
  role?: Role;
}): Promise<{ id: string; username: string; password: string; role: Role }> {
  const username = opts?.username ?? `test-admin-${randomUUID().slice(0, 8)}`;
  if (!username.startsWith(TEST_USERNAME_PREFIX)) {
    throw new Error(
      `createTestAdmin: username "${username}" no arranca con "${TEST_USERNAME_PREFIX}" — cleanUsers() no lo va a borrar y va a quedar como basura en la DB compartida.`,
    );
  }
  const password = opts?.password ?? "test-password-123";
  const role = opts?.role ?? "admin";

  const { data, error } = await supabase
    .from("users")
    .insert({
      id: randomUUID(),
      username,
      password_hash: hashPassword(password),
      role,
      // permissions ya no es un concepto de la app (se calculan por rol) — la
      // columna sigue NOT NULL en DB, se satisface con un objeto vacío.
      permissions: {},
    })
    .select()
    .single();

  if (error) throw error;
  return { id: data.id, username, password, role };
}

/**
 * Solo borra filas de cobro de test (external_ref con prefijo `TEST-`) — nunca
 * cobros reales. Llamarlo DESPUÉS de borrar las orders que las referencian
 * (orders.mp_order_id es FK ON DELETE NO ACTION; cleanNightEvents cascadea orders).
 */
export async function cleanTestMpOrders(): Promise<void> {
  const { error } = await supabase.from("mp_orders").delete().like("external_ref", "TEST-%");
  if (error) throw error;
}

/** Crea una fila de cobro de test en mp_orders (type point por default). */
export async function createTestMpOrder(overrides?: {
  status?: string;
  amount?: number;
  paidAmount?: number;
  paymentId?: string;
}): Promise<{ id: string; orderIdMp: string }> {
  const suffix = randomUUID();
  const status = overrides?.status ?? "created";
  const { data, error } = await supabase
    .from("mp_orders")
    .insert({
      order_id_mp: `TEST-INTENT-${suffix}`,
      external_ref: `TEST-${suffix}`,
      idempotency_key: `TEST-KEY-${suffix}`,
      amount: overrides?.amount ?? 1500,
      status,
      type: "point",
      device_id: "TEST-DEVICE",
      // El CHECK exige paid_amount + payment_id cuando status='processed'.
      paid_amount: overrides?.paidAmount ?? (status === "processed" ? (overrides?.amount ?? 1500) : null),
      payment_id: overrides?.paymentId ?? (status === "processed" ? `TEST-PAY-${suffix}` : null),
    })
    .select("id, order_id_mp")
    .single();
  if (error) throw error;
  return { id: data.id, orderIdMp: data.order_id_mp };
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
  const id = opts?.id ?? TEST_DRINK_ID_FLOOR + Math.floor(Math.random() * 999_800);
  if (id < TEST_DRINK_ID_FLOOR) {
    throw new Error(
      `createTestDrink: id ${id} es menor a TEST_DRINK_ID_FLOOR (${TEST_DRINK_ID_FLOOR}) — cleanDrinks() no lo va a borrar y puede pisar un trago real del catálogo.`,
    );
  }
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
