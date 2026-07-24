import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tablas que se vacían en un reset: lo TRANSACCIONAL (cobros, noches,
 * usuarios, auditoría). `night_events` arrastra `orders`, `cash_sales`
 * (y transitivamente `tickets`) por ON DELETE CASCADE — no hace falta
 * listarlas aparte.
 *
 * El ORDEN importa: `mp_orders.event_id` referencia `night_events(id)`
 * SIN cascade, así que `mp_orders` va ANTES que `night_events` (si no,
 * el delete de las noches falla por FK). `mp_webhook_events` es
 * local-only (no se sincroniza a Cloud): en cloud no existe y el reset
 * la saltea con un aviso.
 *
 * La CONFIG operativa queda afuera a propósito — es lo que permite
 * seguir cobrando después del reset: `mercadopago_sellers`,
 * `mercadopago_cajas`, `mercadopago_cajas_devices`, `drinks`, `bars`,
 * `app_config`.
 */
export const TABLES_TO_RESET = [
  "mp_orders",
  "mp_webhook_events",
  "night_events",
  "users",
  "audit_logs",
] as const;

export type Target = "local" | "cloud";

function isMissingTableError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" || error.message.includes("Could not find the table");
}

/**
 * Cuenta las filas de `table`. Devuelve `null` si la tabla no existe en ese
 * entorno (ej. `mp_webhook_events` es local-only y no está en Cloud) — el
 * caller decide saltearla en vez de abortar todo el reset.
 */
export async function countRows(client: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`No se pudo contar filas de "${table}": ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Vacía cada tabla de `tables` en `client`. supabase-js no expone un
 * `.truncate()`, así que se usa el patrón estándar "borrar todo":
 * `.delete().not("id", "is", null)` — todas las tablas relevantes tienen
 * PK `id`.
 *
 * Si una tabla directamente no existe en ese entorno (ej. `audit_logs`
 * todavía no migrada a cloud — ver riesgo R13), se saltea con un aviso en
 * vez de abortar el resto del reset: no tiene sentido que falte una
 * migración en cloud bloquee el borrado de las tablas que sí existen.
 */
export async function resetData(
  client: SupabaseClient,
  tables: readonly string[] = TABLES_TO_RESET,
): Promise<Record<string, number | null>> {
  const deleted: Record<string, number | null> = {};
  for (const table of tables) {
    const before = await countRows(client, table);
    if (before === null) {
      console.warn(`⚠️  "${table}" no existe en este entorno — se saltea (no bloquea el resto).`);
      deleted[table] = null;
      continue;
    }
    const { error } = await client.from(table).delete().not("id", "is", null);
    if (error) {
      if (isMissingTableError(error)) {
        console.warn(`⚠️  "${table}" no existe en este entorno — se saltea (no bloquea el resto).`);
        deleted[table] = null;
        continue;
      }
      throw new Error(`No se pudo vaciar "${table}": ${error.message}`);
    }
    deleted[table] = before;
  }
  return deleted;
}

export type ParsedArgs = {
  target: Target;
  yes: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const targetArg = argv.find((a) => a.startsWith("--target="));
  const target = targetArg?.slice("--target=".length);

  if (target !== "local" && target !== "cloud") {
    throw new Error('Falta o es inválido --target. Uso: --target=local o --target=cloud (obligatorio, sin default).');
  }

  const yes = argv.includes("--yes");
  if (yes && target === "cloud") {
    throw new Error("--yes no está permitido con --target=cloud: el reset de producción siempre pide confirmación tipeada.");
  }

  return { target, yes };
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const { env } = await import("../config/env.js");
  const { supabase, supabaseCloud } = await import("../shared/supabase.js");
  const { createInterface } = await import("node:readline/promises");

  const { target, yes } = parseArgs(process.argv.slice(2));

  const client = target === "local" ? supabase : supabaseCloud;
  if (!client) {
    console.error("❌ Supabase Cloud no está configurado (faltan SUPABASE_CLOUD_URL / SUPABASE_CLOUD_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  const label = target === "local" ? `local (${env.SUPABASE_URL})` : `CLOUD / PRODUCCIÓN (${env.SUPABASE_CLOUD_URL})`;
  console.log(`\n⚠️  Vas a vaciar la base ${label}.`);
  console.log(`   Tablas: ${TABLES_TO_RESET.join(", ")} (orders/tickets/cash_sales caen por CASCADE de night_events).`);
  console.log(
    "   NO se toca la config operativa: mercadopago_sellers, mercadopago_cajas, " +
      "mercadopago_cajas_devices, drinks, bars, app_config — se puede seguir cobrando después del reset.\n",
  );

  // null = la tabla no existe en este entorno (ej. mp_webhook_events en Cloud)
  const counts: Record<string, number | null> = {};
  for (const table of TABLES_TO_RESET) {
    counts[table] = await countRows(client, table);
  }
  console.log("   Filas actuales:", counts, "\n");

  if (!(target === "local" && yes)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Escribí BORRAR para confirmar (${target}): `);
    rl.close();
    if (answer.trim() !== "BORRAR") {
      console.log("Cancelado — no se borró nada.");
      process.exit(0);
    }
  }

  const deleted = await resetData(client, TABLES_TO_RESET);
  console.log("\n✅ Listo. Filas borradas:", deleted);
  console.log(
    '   La tabla "users" se re-siembra sola con el admin default en el próximo boot del server ' +
      "(ensureLocalMasterDataSeeded). Los logins de fallback por env (ADMIN_USER/CAJA_USER) siguen andando.\n" +
      '   ⚠️  El usuario de "caja" creado desde /admin NO se re-siembra: hay que volver a crearlo a mano.',
  );
}
