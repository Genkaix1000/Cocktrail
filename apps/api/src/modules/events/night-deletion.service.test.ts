import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { NightDeletionService } from "./night-deletion.service.js";

/**
 * La RPC va SIEMPRE mockeada. Nunca un test de integración acá: `delete_night` borra plata y los
 * tests de integración del repo pegan contra la base de producción (R16 del roadmap; ya borraron
 * datos reales dos veces).
 */
function makeClient(respuesta: { data?: unknown; error?: { message: string } }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const PREVIEW_ROW = {
  event_id: "11111111-1111-1111-1111-111111111111",
  status: "cerrado",
  fecha_ar: "2026-08-07",
  keyword: "lluvia",
  started_at: "2026-08-08T02:30:00+00:00",
  closed_at: "2026-08-08T08:00:00+00:00",
  pedidos: 3,
  pedidos_cancelados: 1,
  total_facturado: 8000,
  tickets: 2,
  cash_sales: 1,
  cash_sales_monto: 1500,
  mp_orders: 2,
  mp_orders_cobrados: 2,
  mp_monto_cobrado: 8000.5,
  mp_sin_event_id: 1,
};

describe("NightDeletionService.preview", () => {
  it("llama a preview_night y mapea el resumen a camelCase", async () => {
    const { client, calls } = makeClient({ data: PREVIEW_ROW });

    const preview = await new NightDeletionService(client).preview(PREVIEW_ROW.event_id);

    expect(calls).toEqual([{ fn: "preview_night", args: { p_event_id: PREVIEW_ROW.event_id } }]);
    expect(preview).toEqual({
      eventId: PREVIEW_ROW.event_id,
      status: "cerrado",
      fechaAr: "2026-08-07",
      keyword: "lluvia",
      startedAt: "2026-08-08T02:30:00+00:00",
      closedAt: "2026-08-08T08:00:00+00:00",
      pedidos: 3,
      pedidosCancelados: 1,
      totalFacturado: 8000,
      tickets: 2,
      cashSales: 1,
      cashSalesMonto: 1500,
      mpOrders: 2,
      mpOrdersCobrados: 2,
      mpMontoCobrado: 8000.5,
      mpSinEventId: 1,
    });
  });

  it("traduce NOCHE_NO_ENCONTRADA a NotFound y le saca el prefijo al mensaje", async () => {
    const { client } = makeClient({
      error: { message: "NOCHE_NO_ENCONTRADA: no existe una noche con id abc" },
    });

    const error = await new NightDeletionService(client).preview("abc").catch((e) => e);

    expect(error).toBeInstanceOf(NotFound);
    expect(error.message).toBe("no existe una noche con id abc");
  });
});

describe("NightDeletionService.delete", () => {
  const DELETION_ROW = {
    ...PREVIEW_ROW,
    borrado: {
      orders: 3,
      tickets: 2,
      cash_sales: 1,
      mp_orders: 2,
      webhooks_neutralizados: 1,
      mp_orders_desligados: 1,
    },
    operator: "cli",
  };

  it("pasa event_id, la fecha esperada y el operador a la RPC", async () => {
    const { client, calls } = makeClient({ data: DELETION_ROW });

    await new NightDeletionService(client).delete(PREVIEW_ROW.event_id, "2026-08-07", "manuel");

    expect(calls).toEqual([
      {
        fn: "delete_night",
        args: {
          p_event_id: PREVIEW_ROW.event_id,
          p_expected_ar_date: "2026-08-07",
          p_operator: "manuel",
        },
      },
    ]);
  });

  it("mapea el detalle de lo borrado", async () => {
    const { client } = makeClient({ data: DELETION_ROW });

    const res = await new NightDeletionService(client).delete(PREVIEW_ROW.event_id, null, "cli");

    expect(res.fechaAr).toBe("2026-08-07");
    expect(res.operator).toBe("cli");
    expect(res.borrado).toEqual({
      orders: 3,
      tickets: 2,
      cashSales: 1,
      mpOrders: 2,
      webhooksNeutralizados: 1,
      mpOrdersDesligados: 1,
    });
  });

  it("traduce NOCHE_ACTIVA a Conflict con code estable", async () => {
    const { client } = makeClient({
      error: { message: "NOCHE_ACTIVA: la noche x está activa, hay que cerrarla antes de borrarla" },
    });

    const error = await new NightDeletionService(client).delete("x", null, "cli").catch((e) => e);

    expect(error).toBeInstanceOf(Conflict);
    expect(error.code).toBe("NOCHE_ACTIVA");
  });

  it("traduce FECHA_NO_COINCIDE a BadRequest", async () => {
    const { client } = makeClient({
      error: { message: "FECHA_NO_COINCIDE: la noche x es del 2026-08-07 y se esperaba 2026-08-06" },
    });

    const error = await new NightDeletionService(client)
      .delete("x", "2026-08-06", "cli")
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequest);
    expect(error.message).toBe("la noche x es del 2026-08-07 y se esperaba 2026-08-06");
  });

  it("deja pasar un error desconocido sin disfrazarlo de 404", async () => {
    const { client } = makeClient({ error: { message: "permission denied for function" } });

    const error = await new NightDeletionService(client).delete("x", null, "cli").catch((e) => e);

    expect(error).not.toBeInstanceOf(NotFound);
    expect(error.message).toBe("permission denied for function");
  });
});

describe("NightDeletionService.findByArDate", () => {
  it("mapea las filas y devuelve [] si no hay ninguna", async () => {
    const { client, calls } = makeClient({
      data: [
        {
          event_id: "a",
          fecha_ar: "2026-08-07",
          status: "cerrado",
          keyword: null,
          started_at: "2026-08-08T02:30:00+00:00",
          closed_at: null,
          pedidos: 5,
        },
      ],
    });

    const noches = await new NightDeletionService(client).findByArDate("2026-08-07");

    expect(calls).toEqual([{ fn: "find_nights_by_ar_date", args: { p_fecha: "2026-08-07" } }]);
    expect(noches).toEqual([
      {
        eventId: "a",
        fechaAr: "2026-08-07",
        status: "cerrado",
        keyword: null,
        startedAt: "2026-08-08T02:30:00+00:00",
        closedAt: null,
        pedidos: 5,
      },
    ]);

    const vacio = makeClient({ data: null });
    await expect(new NightDeletionService(vacio.client).findByArDate("2026-01-01")).resolves.toEqual(
      [],
    );
  });
});
