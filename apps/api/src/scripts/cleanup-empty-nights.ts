import type { SupabaseClient } from "@supabase/supabase-js";
import { type Target, type ParsedArgs, parseArgs } from "./args.js";

/**
 * Noches "vacías": `order_counter = 0` (nunca se cargó un pedido). En local
 * se excluye explícitamente la noche `activa` — puede tener 0 pedidos
 * todavía y no por eso es basura de testing. Cloud no tiene columna
 * `status` (solo recibe noches ya cerradas vía push), así que ahí no hace
 * falta filtrar.
 */
export async function findEmptyNightIds(client: SupabaseClient, target: Target): Promise<string[]> {
  let query = client.from("night_events").select("id").eq("order_counter", 0);
  if (target === "local") {
    query = query.eq("status", "cerrado");
  }
  const { data, error } = await query;
  if (error) throw new Error(`No se pudo buscar noches vacías: ${error.message}`);
  return (data ?? []).map((row: { id: string }) => row.id);
}

/**
 * `orders`/`tickets`/`cash_sales` caen por ON DELETE CASCADE — no hace
 * falta borrarlas aparte (y de hecho no deberían existir para una noche con
 * order_counter = 0).
 */
export async function deleteEmptyNights(client: SupabaseClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error } = await client.from("night_events").delete().in("id", ids);
  if (error) throw new Error(`No se pudieron borrar las noches vacías: ${error.message}`);
  return ids.length;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const { env } = await import("../config/env.js");
  const { supabase, supabaseCloud } = await import("../shared/supabase.js");
  const { createInterface } = await import("node:readline/promises");

  const { target, yes } = parseArgs(process.argv.slice(2), "la limpieza en producción siempre pide confirmación tipeada.");

  const client = target === "local" ? supabase : supabaseCloud;
  if (!client) {
    console.error("❌ Supabase Cloud no está configurado (faltan SUPABASE_CLOUD_URL / SUPABASE_CLOUD_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  const label = target === "local" ? `local (${env.SUPABASE_URL})` : `CLOUD / PRODUCCIÓN (${env.SUPABASE_CLOUD_URL})`;
  console.log(`\n🧹 Buscando noches vacías (order_counter = 0${target === "local" ? ", status = cerrado" : ""}) en ${label}...\n`);

  const ids = await findEmptyNightIds(client, target);
  console.log(`   Encontradas: ${ids.length} noches vacías.\n`);

  if (ids.length === 0) {
    console.log("Nada para borrar.");
    process.exit(0);
  }

  if (!(target === "local" && yes)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Escribí BORRAR para confirmar el borrado de ${ids.length} noches (${target}): `);
    rl.close();
    if (answer.trim() !== "BORRAR") {
      console.log("Cancelado — no se borró nada.");
      process.exit(0);
    }
  }

  const deleted = await deleteEmptyNights(client, ids);
  console.log(`\n✅ Listo. ${deleted} noches vacías borradas de ${target}.`);
}
