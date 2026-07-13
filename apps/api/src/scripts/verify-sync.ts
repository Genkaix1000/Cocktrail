import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncCompareResult = {
  ok: boolean;
  mismatches: string[];
  summary?: {
    orders: number;
    tickets: number;
    totals: unknown;
  };
};

async function fetchEvent(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.from("night_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw new Error(`No se pudo leer night_events: ${error.message}`);
  return data as Record<string, unknown> | null;
}

async function fetchOrders(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.from("orders").select("*").eq("event_id", eventId);
  if (error) throw new Error(`No se pudo leer orders: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function fetchTickets(client: SupabaseClient, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const { data, error } = await client.from("tickets").select("*").in("order_id", orderIds);
  if (error) throw new Error(`No se pudo leer tickets: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/**
 * Compara un night_event cerrado entre local y cloud: existencia, totales,
 * y que orders/tickets matcheen en cantidad y campos clave
 * (id/total/payment_method/status para orders). No modifica nada, solo
 * lee de los dos clientes.
 */
export async function compareEventSync(
  localClient: SupabaseClient,
  cloudClient: SupabaseClient,
  eventId: string,
): Promise<SyncCompareResult> {
  const localEvent = await fetchEvent(localClient, eventId);
  if (!localEvent) {
    return { ok: false, mismatches: [`El evento ${eventId} no existe en local — id incorrecto.`] };
  }

  const cloudEvent = await fetchEvent(cloudClient, eventId);
  if (!cloudEvent) {
    return { ok: false, mismatches: [`El evento ${eventId} todavía no llegó a cloud (sync pendiente o fallido).`] };
  }

  const mismatches: string[] = [];

  const [localOrders, cloudOrders] = await Promise.all([
    fetchOrders(localClient, eventId),
    fetchOrders(cloudClient, eventId),
  ]);

  // `night_events.totals` es una columna cloud-only (no existe en las
  // migraciones locales — ver riesgo R2/docs/ROADMAP.md), así que no tiene
  // sentido comparar el campo crudo entre local y cloud: local nunca lo va
  // a tener. En cambio, se valida que el total que cloud calculó coincide
  // con la suma real de las orders locales.
  const localOrdersSum = localOrders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
  const cloudTotalsObj = cloudEvent.totals as { total?: number } | null | undefined;
  if (!cloudTotalsObj || typeof cloudTotalsObj.total !== "number") {
    mismatches.push(`cloud no tiene totals.total calculado (totals=${JSON.stringify(cloudEvent.totals)})`);
  } else if (cloudTotalsObj.total !== localOrdersSum) {
    mismatches.push(`totals.total de cloud (${cloudTotalsObj.total}) no coincide con la suma de orders locales (${localOrdersSum})`);
  }

  if (localOrders.length !== cloudOrders.length) {
    mismatches.push(`cantidad de orders no coincide: local=${localOrders.length} cloud=${cloudOrders.length}`);
  }

  const cloudOrdersById = new Map(cloudOrders.map((o) => [o.id as string, o]));
  for (const local of localOrders) {
    const cloud = cloudOrdersById.get(local.id as string);
    if (!cloud) {
      mismatches.push(`order ${local.id} no está en cloud`);
      continue;
    }
    if (cloud.total !== local.total) {
      mismatches.push(`order ${local.id}: total no coincide (local=${local.total} cloud=${cloud.total})`);
    }
    if (cloud.payment_method !== local.payment_method) {
      mismatches.push(
        `order ${local.id}: payment_method no coincide (local=${local.payment_method} cloud=${cloud.payment_method})`,
      );
    }
    if (cloud.status !== local.status) {
      mismatches.push(`order ${local.id}: status no coincide (local=${local.status} cloud=${cloud.status})`);
    }
  }

  const localOrderIds = localOrders.map((o) => o.id as string);
  const [localTickets, cloudTickets] = await Promise.all([
    fetchTickets(localClient, localOrderIds),
    fetchTickets(cloudClient, localOrderIds),
  ]);
  if (localTickets.length !== cloudTickets.length) {
    mismatches.push(`cantidad de tickets no coincide: local=${localTickets.length} cloud=${cloudTickets.length}`);
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    summary: {
      orders: localOrders.length,
      tickets: localTickets.length,
      totals: cloudEvent.totals,
    },
  };
}

/** Último night_event cerrado en local (el más reciente por closed_at). */
export async function getLastClosedEventId(localClient: SupabaseClient): Promise<string | null> {
  const { data, error } = await localClient
    .from("night_events")
    .select("id")
    .eq("status", "cerrado")
    .order("closed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo buscar el último evento cerrado: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta `compareEventSync` unas pocas veces con espera corta — el push
 * a cloud es fire-and-forget al cerrar la noche, puede no estar listo
 * todavía en el primer chequeo.
 */
export async function verifyWithRetries(
  localClient: SupabaseClient,
  cloudClient: SupabaseClient,
  eventId: string,
  attempts = 3,
  delayMs = 2000,
): Promise<SyncCompareResult> {
  let last: SyncCompareResult = { ok: false, mismatches: ["sin intentos"] };
  for (let i = 0; i < attempts; i++) {
    last = await compareEventSync(localClient, cloudClient, eventId);
    if (last.ok) return last;
    const isPending = last.mismatches.some((m) => m.includes("todavía no llegó a cloud"));
    if (!isPending) return last; // error real, no tiene sentido reintentar
    if (i < attempts - 1) await sleep(delayMs);
  }
  return last;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const { supabase, supabaseCloud } = await import("../shared/supabase.js");

  if (!supabaseCloud) {
    console.error("❌ Supabase Cloud no está configurado (faltan SUPABASE_CLOUD_URL / SUPABASE_CLOUD_SERVICE_ROLE_KEY).");
    process.exit(1);
  }

  const eventIdArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const eventId = eventIdArg ?? (await getLastClosedEventId(supabase));

  if (!eventId) {
    console.error("❌ No hay ningún night_event cerrado en local para verificar.");
    process.exit(1);
  }

  console.log(`Verificando sync del evento ${eventId}...`);
  const result = await verifyWithRetries(supabase, supabaseCloud, eventId);

  if (result.ok) {
    console.log(`✅ Sync verificado: ${result.summary?.orders} orders, ${result.summary?.tickets} tickets — coinciden entre local y cloud.`);
  } else {
    console.error("❌ El sync no coincide:");
    for (const m of result.mismatches) console.error(`   - ${m}`);
    process.exit(1);
  }
}
