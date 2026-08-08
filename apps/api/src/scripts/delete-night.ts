import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  NightDeletionResult,
  NightPreview,
  NightSummary,
} from "../modules/events/night-deletion.service.js";

export const HELP = `
Borra una noche registrada y todo lo que cuelga de ella. IRREVERSIBLE.

Uso:
  pnpm --filter cocktrail-api db:delete-night <YYYY-MM-DD> [opciones]
  pnpm --filter cocktrail-api db:delete-night --id <uuid>  [opciones]

Opciones:
  --id <uuid>    Borra la noche con ese identificador (obligatorio si una fecha
                 tiene más de una noche).
  --dry-run      Solo muestra el resumen. ES EL COMPORTAMIENTO POR DEFECTO.
  --confirm      Habilita el borrado real. Igual pide escribir la fecha a mano.
  --operator <n> Quién queda registrado en la auditoría (default: "cli").
  --help         Esto.

Cómo se clasifica una noche por fecha:
  Por su HORA DE APERTURA (started_at), en huso argentino. Una fiesta que arranca
  el viernes a las 23:00 y termina el sábado a las 05:00 es "la noche del viernes":
  se la borra con la fecha del VIERNES, no la del sábado.

Antes de borrar, el comando vuelca la noche completa (resumen + pedidos + tickets
+ cobros de MP) a ./backups/noche-<fecha>-<id>.json. Ese archivo es el único
resguardo: la app no tiene papelera.
`.trim();

export type ParsedArgs =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | {
      kind: "run";
      fecha: string | null;
      id: string | null;
      confirm: boolean;
      operator: string;
    };

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseArgs(argv: string[]): ParsedArgs {
  let fecha: string | null = null;
  let id: string | null = null;
  let confirm = false;
  let operator = "cli";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--dry-run") continue; // ya es el default; se acepta para poder ser explícito
    if (arg === "--confirm") {
      confirm = true;
      continue;
    }
    if (arg === "--id") {
      const valor = argv[++i];
      if (!valor) return { kind: "error", message: "--id necesita un uuid" };
      if (!UUID_RE.test(valor)) return { kind: "error", message: `"${valor}" no es un uuid válido` };
      id = valor;
      continue;
    }
    if (arg === "--operator") {
      const valor = argv[++i];
      if (!valor) return { kind: "error", message: "--operator necesita un nombre" };
      operator = valor;
      continue;
    }
    if (arg.startsWith("-")) return { kind: "error", message: `Opción desconocida: ${arg}` };
    if (fecha) return { kind: "error", message: `Sobra el argumento "${arg}"` };
    if (!FECHA_RE.test(arg)) {
      return { kind: "error", message: `"${arg}" no es una fecha YYYY-MM-DD` };
    }
    fecha = arg;
  }

  if (!fecha && !id) {
    return { kind: "error", message: "Falta la fecha (YYYY-MM-DD) o --id <uuid>." };
  }
  return { kind: "run", fecha, id, confirm, operator };
}

const pesos = (n: number): string =>
  `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function formatPreview(p: NightPreview): string {
  const lineas = [
    `  Noche          ${p.fechaAr}  (${p.eventId})`,
    `  Estado         ${p.status}${p.keyword ? `   ·   clave: ${p.keyword}` : ""}`,
    `  Abrió          ${p.startedAt}`,
    `  Cerró          ${p.closedAt ?? "—"}`,
    "",
    `  Pedidos        ${p.pedidos}${p.pedidosCancelados > 0 ? `  (${p.pedidosCancelados} cancelados)` : ""}`,
    `  Facturado      ${pesos(p.totalFacturado)}   (sin contar cancelados)`,
    `  Tickets        ${p.tickets}`,
    `  Ventas cash    ${p.cashSales}   ${pesos(p.cashSalesMonto)}`,
    `  Cobros MP      ${p.mpOrders}   (${p.mpOrdersCobrados} cobrados · ${pesos(p.mpMontoCobrado)})`,
  ];
  if (p.mpSinEventId > 0) {
    lineas.push(
      `                 ⚠ ${p.mpSinEventId} de esos cobros no tienen event_id: se detectaron por el pedido que los referencia.`,
    );
  }
  return lineas.join("\n");
}

export function formatNightList(noches: NightSummary[]): string {
  return noches
    .map((n) => `  ${n.eventId}   ${n.fechaAr}   ${n.status.padEnd(7)}   ${n.pedidos} pedidos   ${n.keyword ?? ""}`)
    .join("\n");
}

/** Todo lo que cuelga de la noche, para el volcado a JSON previo al borrado. */
export async function collectNightDump(
  client: SupabaseClient,
  eventId: string,
  preview: NightPreview,
): Promise<Record<string, unknown>> {
  const noche = await client.from("night_events").select("*").eq("id", eventId).maybeSingle();
  if (noche.error) throw new Error(`No se pudo leer la noche: ${noche.error.message}`);

  const orders = await client.from("orders").select("*").eq("event_id", eventId);
  if (orders.error) throw new Error(`No se pudieron leer los pedidos: ${orders.error.message}`);

  const orderIds = (orders.data ?? []).map((o: { id: string }) => o.id);
  const mpIds = (orders.data ?? [])
    .map((o: { mp_order_id?: string | null }) => o.mp_order_id)
    .filter((v): v is string => Boolean(v));

  const tickets = orderIds.length
    ? await client.from("tickets").select("*").in("order_id", orderIds)
    : { data: [], error: null };
  if (tickets.error) throw new Error(`No se pudieron leer los tickets: ${tickets.error.message}`);

  // Misma unión que night_mp_order_ids: por event_id y por el pedido que los referencia.
  const mpPorEvento = await client.from("mp_orders").select("*").eq("event_id", eventId);
  if (mpPorEvento.error) {
    throw new Error(`No se pudieron leer los cobros MP: ${mpPorEvento.error.message}`);
  }
  const mpPorPedido = mpIds.length
    ? await client.from("mp_orders").select("*").in("id", mpIds)
    : { data: [], error: null };
  if (mpPorPedido.error) {
    throw new Error(`No se pudieron leer los cobros MP: ${mpPorPedido.error.message}`);
  }
  const mpOrders = [...(mpPorEvento.data ?? []), ...(mpPorPedido.data ?? [])].filter(
    (fila: { id: string }, i, todas) => todas.findIndex((o: { id: string }) => o.id === fila.id) === i,
  );

  const cashSales = await client.from("cash_sales").select("*").eq("event_id", eventId);
  if (cashSales.error) {
    throw new Error(`No se pudieron leer las ventas en efectivo: ${cashSales.error.message}`);
  }

  return {
    generadoEn: new Date().toISOString(),
    resumen: preview,
    nightEvent: noche.data,
    orders: orders.data ?? [],
    tickets: tickets.data ?? [],
    mpOrders,
    cashSales: cashSales.data ?? [],
  };
}

export async function writeBackup(
  dump: Record<string, unknown>,
  fecha: string,
  eventId: string,
  dir = join(process.cwd(), "backups"),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const ruta = join(dir, `noche-${fecha}-${eventId}.json`);
  await writeFile(ruta, JSON.stringify(dump, null, 2), "utf8");
  return ruta;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === "help") {
    console.log(HELP);
    process.exit(0);
  }
  if (parsed.kind === "error") {
    console.error(`\n❌ ${parsed.message}\n`);
    console.error(HELP);
    process.exit(1);
  }

  const { env } = await import("../config/env.js");
  const { supabase } = await import("../shared/supabase.js");
  const { NightDeletionService } = await import("../modules/events/night-deletion.service.js");
  const { createInterface } = await import("node:readline/promises");

  const service = new NightDeletionService(supabase);

  console.log(`\n🗑️  Borrado de noche — base: ${env.SUPABASE_URL}\n`);

  let eventId = parsed.id;
  if (!eventId) {
    const noches = await service.findByArDate(parsed.fecha!);
    if (noches.length === 0) {
      console.error(`❌ No hay ninguna noche del ${parsed.fecha}.`);
      console.error(
        "   Recordá que la noche se clasifica por su hora de apertura: una fiesta que arranca\n" +
          "   el viernes 23:00 y termina el sábado 05:00 es la noche del VIERNES.\n",
      );
      process.exit(1);
    }
    if (noches.length > 1) {
      console.error(`❌ Hay ${noches.length} noches del ${parsed.fecha}. Elegí una con --id:\n`);
      console.error(formatNightList(noches));
      console.error("");
      process.exit(1);
    }
    eventId = noches[0]!.eventId;
  }

  const preview = await service.preview(eventId);
  console.log("Se va a borrar:\n");
  console.log(formatPreview(preview));
  console.log("");

  if (preview.status === "activo") {
    console.error("❌ La noche está ACTIVA. Cerrala antes de borrarla.\n");
    process.exit(1);
  }

  if (!parsed.confirm) {
    console.log("🔎 Modo dry-run (el default). No se borró nada.");
    console.log("   Para borrar de verdad, repetí el comando con --confirm.\n");
    process.exit(0);
  }

  const dump = await collectNightDump(supabase, eventId, preview);
  const ruta = await writeBackup(dump, preview.fechaAr, eventId);
  console.log(`💾 Resguardo escrito en ${ruta}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `Esto es IRREVERSIBLE. Escribí la fecha de la noche (${preview.fechaAr}) para confirmar: `,
  );
  rl.close();
  if (respuesta.trim() !== preview.fechaAr) {
    console.log("\nCancelado — no se borró nada.\n");
    process.exit(0);
  }

  // p_expected_ar_date siempre: la confirmación también se valida en el servidor.
  const resultado: NightDeletionResult = await service.delete(
    eventId,
    preview.fechaAr,
    parsed.operator,
  );

  console.log(`\n✅ Noche ${resultado.fechaAr} borrada por "${resultado.operator}".`);
  console.log(
    `   Pedidos: ${resultado.borrado.orders} · Tickets: ${resultado.borrado.tickets} · ` +
      `Ventas cash: ${resultado.borrado.cashSales} · Cobros MP: ${resultado.borrado.mpOrders}`,
  );
  if (resultado.borrado.webhooksNeutralizados > 0) {
    console.log(`   Webhooks pendientes neutralizados: ${resultado.borrado.webhooksNeutralizados}`);
  }
  if (resultado.borrado.mpOrdersDesligados > 0) {
    console.log(
      `   Cobros desligados (respaldaban una venta de otra noche): ${resultado.borrado.mpOrdersDesligados}`,
    );
  }
  console.log("");
}
