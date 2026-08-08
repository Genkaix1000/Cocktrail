import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { supabase } from "../../shared/supabase.js";

/** Resumen de lo que una noche contiene — lo que se pierde si se la borra. */
export type NightPreview = {
  eventId: string;
  status: "activo" | "cerrado";
  /** Día calendario argentino de `started_at`, "YYYY-MM-DD". */
  fechaAr: string;
  keyword: string | null;
  startedAt: string;
  closedAt: string | null;
  pedidos: number;
  pedidosCancelados: number;
  /** Pesos. Excluye los pedidos cancelados, igual que `computeTotals`. */
  totalFacturado: number;
  tickets: number;
  cashSales: number;
  cashSalesMonto: number;
  mpOrders: number;
  mpOrdersCobrados: number;
  /** Pesos, con decimales: `mp_orders.paid_amount` es NUMERIC(12,2). */
  mpMontoCobrado: number;
  /** Cobros descubiertos solo por `orders.mp_order_id` (nunca hubo backfill de `event_id`). */
  mpSinEventId: number;
};

export type NightDeletionResult = NightPreview & {
  borrado: {
    orders: number;
    tickets: number;
    cashSales: number;
    mpOrders: number;
    webhooksNeutralizados: number;
    /** Cobros de la noche que respaldaban una venta ajena: se les puso `event_id = NULL`. */
    mpOrdersDesligados: number;
  };
  operator: string;
};

/** Una noche en la lista de candidatas de una fecha. */
export type NightSummary = {
  eventId: string;
  fechaAr: string;
  status: "activo" | "cerrado";
  keyword: string | null;
  startedAt: string;
  closedAt: string | null;
  pedidos: number;
};

type PreviewRow = {
  event_id: string;
  status: "activo" | "cerrado";
  fecha_ar: string;
  keyword: string | null;
  started_at: string;
  closed_at: string | null;
  pedidos: number;
  pedidos_cancelados: number;
  total_facturado: number;
  tickets: number;
  cash_sales: number;
  cash_sales_monto: number;
  mp_orders: number;
  mp_orders_cobrados: number;
  mp_monto_cobrado: number;
  mp_sin_event_id: number;
};

type DeletionRow = PreviewRow & {
  borrado: {
    orders: number;
    tickets: number;
    cash_sales: number;
    mp_orders: number;
    webhooks_neutralizados: number;
    mp_orders_desligados: number;
  };
  operator: string;
};

type NightRow = {
  event_id: string;
  fecha_ar: string;
  status: "activo" | "cerrado";
  keyword: string | null;
  started_at: string;
  closed_at: string | null;
  pedidos: number;
};

function toPreview(row: PreviewRow): NightPreview {
  return {
    eventId: row.event_id,
    status: row.status,
    fechaAr: row.fecha_ar,
    keyword: row.keyword ?? null,
    startedAt: row.started_at,
    closedAt: row.closed_at ?? null,
    pedidos: Number(row.pedidos),
    pedidosCancelados: Number(row.pedidos_cancelados),
    totalFacturado: Number(row.total_facturado),
    tickets: Number(row.tickets),
    cashSales: Number(row.cash_sales),
    cashSalesMonto: Number(row.cash_sales_monto),
    mpOrders: Number(row.mp_orders),
    mpOrdersCobrados: Number(row.mp_orders_cobrados),
    mpMontoCobrado: Number(row.mp_monto_cobrado),
    mpSinEventId: Number(row.mp_sin_event_id),
  };
}

/**
 * Traduce el error de la función de Postgres al error HTTP correspondiente.
 *
 * Se matchea por el prefijo del mensaje (`NOCHE_NO_ENCONTRADA:`, …) y no por el SQLSTATE:
 * PostgREST no propaga el ERRCODE de forma estable en todas las versiones, mientras que el
 * prefijo lo controla la migración `20260808120000_delete_night.sql`.
 */
function traducirError(mensaje: string): Error {
  const limpio = mensaje.replace(/^[A-Z_]+:\s*/, "");
  if (mensaje.includes("NOCHE_NO_ENCONTRADA")) return new NotFound(limpio);
  if (mensaje.includes("NOCHE_ACTIVA")) return new Conflict(limpio, "NOCHE_ACTIVA");
  if (mensaje.includes("FECHA_NO_COINCIDE")) return new BadRequest(limpio);
  return new Error(mensaje);
}

/**
 * Borrado de noches registradas (spec `noches-de-prueba-y-borrado`, sección D).
 *
 * Todo el trabajo vive en funciones de Postgres invocadas por RPC: borrar una noche toca 4 tablas
 * con FKs sin cascada y `supabase-js` no tiene transacciones — 4 DELETE sueltos dejarían las
 * ventas borradas con los cobros de MP vivos si falla a mitad. PostgREST corre cada RPC en una
 * única transacción, así que la operación es todo-o-nada.
 */
export class NightDeletionService {
  constructor(private readonly client: SupabaseClient = supabase) {}

  /** Qué contiene la noche. No modifica nada. */
  async preview(eventId: string): Promise<NightPreview> {
    const { data, error } = await this.client.rpc("preview_night", { p_event_id: eventId });
    if (error) throw traducirError(error.message);
    if (!data) throw new NotFound(`No existe una noche con id ${eventId}`);
    return toPreview(data as PreviewRow);
  }

  /**
   * Borra la noche y todo lo que cuelga de ella. Irreversible.
   *
   * `expectedArDate` ("YYYY-MM-DD") es la confirmación tipeada, validada en el servidor: si no
   * coincide con la fecha argentina real de la noche, la función aborta sin tocar nada.
   */
  async delete(
    eventId: string,
    expectedArDate: string | null,
    operator: string,
  ): Promise<NightDeletionResult> {
    const { data, error } = await this.client.rpc("delete_night", {
      p_event_id: eventId,
      p_expected_ar_date: expectedArDate,
      p_operator: operator,
    });
    if (error) throw traducirError(error.message);
    if (!data) throw new NotFound(`No existe una noche con id ${eventId}`);

    const row = data as DeletionRow;
    return {
      ...toPreview(row),
      borrado: {
        orders: Number(row.borrado.orders),
        tickets: Number(row.borrado.tickets),
        cashSales: Number(row.borrado.cash_sales),
        mpOrders: Number(row.borrado.mp_orders),
        webhooksNeutralizados: Number(row.borrado.webhooks_neutralizados),
        mpOrdersDesligados: Number(row.borrado.mp_orders_desligados),
      },
      operator: row.operator,
    };
  }

  /**
   * Noches de un día calendario argentino. Puede devolver más de una: la fecha se calcula sobre
   * `started_at`, y nada impide abrir y cerrar dos noches el mismo día.
   */
  async findByArDate(fecha: string): Promise<NightSummary[]> {
    const { data, error } = await this.client.rpc("find_nights_by_ar_date", { p_fecha: fecha });
    if (error) throw traducirError(error.message);

    return ((data ?? []) as NightRow[]).map((row) => ({
      eventId: row.event_id,
      fechaAr: row.fecha_ar,
      status: row.status,
      keyword: row.keyword ?? null,
      startedAt: row.started_at,
      closedAt: row.closed_at ?? null,
      pedidos: Number(row.pedidos),
    }));
  }
}
