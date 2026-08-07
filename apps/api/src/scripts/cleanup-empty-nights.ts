import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Noches "vacías": `order_counter = 0` (nunca se cargó un pedido) y ya cerradas
 * — la noche `activa` se excluye explícitamente: puede tener 0 pedidos todavía
 * y no por eso es basura de testing.
 */
export async function findEmptyNightIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client
    .from("night_events")
    .select("id")
    .eq("order_counter", 0)
    .eq("status", "cerrado");
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
  const { supabase } = await import("../shared/supabase.js");
  const { createInterface } = await import("node:readline/promises");

  console.log(`\n🧹 Buscando noches vacías (order_counter = 0, status = cerrado) en ${env.SUPABASE_URL}...\n`);

  const ids = await findEmptyNightIds(supabase);
  console.log(`   Encontradas: ${ids.length} noches vacías.\n`);

  if (ids.length === 0) {
    console.log("Nada para borrar.");
    process.exit(0);
  }

  // Una sola base (Supabase Cloud): siempre confirmación tipeada.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Escribí BORRAR para confirmar el borrado de ${ids.length} noches: `);
  rl.close();
  if (answer.trim() !== "BORRAR") {
    console.log("Cancelado — no se borró nada.");
    process.exit(0);
  }

  const deleted = await deleteEmptyNights(supabase, ids);
  console.log(`\n✅ Listo. ${deleted} noches vacías borradas.`);
}
