import type { SupabaseClient } from "@supabase/supabase-js";
import { type Target, type ParsedArgs, parseArgs } from "./args.js";

/**
 * Tablas que se vacían en un reset. `night_events` arrastra `orders`,
 * `cash_sales` (y transitivamente `tickets`) por ON DELETE CASCADE — no
 * hace falta listarlas aparte. `drinks`/`app_config` quedan afuera a
 * propósito: son contenido real del local, no dato de prueba.
 */
export const TABLES_TO_RESET = ["night_events", "users", "audit_logs"] as const;

export async function countRows(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`No se pudo contar filas de "${table}": ${error.message}`);
  return count ?? 0;
}

function isMissingTableError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" || error.message.includes("Could not find the table");
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

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const { env } = await import("../config/env.js");
  const { supabase, supabaseCloud } = await import("../shared/supabase.js");
  const { createInterface } = await import("node:readline/promises");

  const { target, yes } = parseArgs(process.argv.slice(2), "el reset de producción siempre pide confirmación tipeada.");

  const client = target === "local" ? supabase : supabaseCloud;
  if (!client) {
    console.error("❌ Supabase Cloud no está configurado (faltan SUPABASE_CLOUD_URL / SUPABASE_CLOUD_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  const label = target === "local" ? `local (${env.SUPABASE_URL})` : `CLOUD / PRODUCCIÓN (${env.SUPABASE_CLOUD_URL})`;
  console.log(`\n⚠️  Vas a vaciar la base ${label}.`);
  console.log(`   Tablas: ${TABLES_TO_RESET.join(", ")} (orders/tickets/cash_sales caen por CASCADE de night_events).`);
  console.log(`   drinks/app_config NO se tocan.\n`);

  const counts: Record<string, number> = {};
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
      "(ensureLocalMasterDataSeeded). El login de admin/caja sigue funcionando igual — no depende de esa tabla.",
  );
}
