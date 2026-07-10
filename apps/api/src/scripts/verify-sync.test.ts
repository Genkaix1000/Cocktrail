import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { compareEventSync, getLastClosedEventId, verifyWithRetries } from "./verify-sync.js";

type Db = {
  night_events?: Record<string, unknown>[];
  orders?: Record<string, unknown>[];
  tickets?: Record<string, unknown>[];
  cash_sales?: Record<string, unknown>[];
};

/**
 * Fake del query builder de supabase-js que soporta select/eq/in/order/
 * limit/maybeSingle encadenados, resolviendo contra una tabla en memoria.
 */
function makeFakeClient(db: Db) {
  function makeBuilder(table: string) {
    let rows = [...(db[table as keyof Db] ?? [])];
    const builder: any = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (r: { data: unknown; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return builder;
  }
  return { from: (table: string) => makeBuilder(table) } as unknown as SupabaseClient;
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return { id: "event-1", status: "cerrado", closed_at: "2026-07-10T22:00:00Z", totals: { total: 5000 }, ...overrides };
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return { id: "order-1", event_id: "event-1", total: 2500, payment_method: "efectivo", status: "entregado", ...overrides };
}

describe("compareEventSync", () => {
  it("ok:true cuando todo coincide", async () => {
    const local = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder()],
      tickets: [{ id: "t1", order_id: "order-1" }],
      cash_sales: [],
    });
    const cloud = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder()],
      tickets: [{ id: "t1", order_id: "order-1" }],
      cash_sales: [],
    });

    const result = await compareEventSync(local, cloud, "event-1");

    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.summary).toEqual({ orders: 1, tickets: 1, cashSales: 0, totals: { total: 5000 } });
  });

  it("ok:false si el evento no llegó a cloud todavía", async () => {
    const local = makeFakeClient({ night_events: [makeEvent()], orders: [], tickets: [], cash_sales: [] });
    const cloud = makeFakeClient({ night_events: [], orders: [], tickets: [], cash_sales: [] });

    const result = await compareEventSync(local, cloud, "event-1");

    expect(result.ok).toBe(false);
    expect(result.mismatches[0]).toMatch(/todavía no llegó a cloud/);
  });

  it("ok:false si falta un order en cloud", async () => {
    const local = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder(), makeOrder({ id: "order-2" })],
      tickets: [],
      cash_sales: [],
    });
    const cloud = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder()],
      tickets: [],
      cash_sales: [],
    });

    const result = await compareEventSync(local, cloud, "event-1");

    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes("cantidad de orders"))).toBe(true);
    expect(result.mismatches.some((m) => m.includes("order-2 no está en cloud"))).toBe(true);
  });

  it("ok:false si un order tiene distinto total en cloud", async () => {
    const local = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder({ total: 2500 })],
      tickets: [],
      cash_sales: [],
    });
    const cloud = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder({ total: 9999 })],
      tickets: [],
      cash_sales: [],
    });

    const result = await compareEventSync(local, cloud, "event-1");

    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes("total no coincide"))).toBe(true);
  });

  it("ok:false si totals del evento no coincide", async () => {
    const local = makeFakeClient({ night_events: [makeEvent({ totals: { total: 5000 } })], orders: [], tickets: [], cash_sales: [] });
    const cloud = makeFakeClient({ night_events: [makeEvent({ totals: { total: 1 } })], orders: [], tickets: [], cash_sales: [] });

    const result = await compareEventSync(local, cloud, "event-1");

    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes("totals no coincide"))).toBe(true);
  });
});

describe("getLastClosedEventId", () => {
  it("devuelve el id del último evento cerrado", async () => {
    const client = makeFakeClient({ night_events: [makeEvent({ id: "event-9" })] });

    await expect(getLastClosedEventId(client)).resolves.toBe("event-9");
  });

  it("devuelve null si no hay ninguno cerrado", async () => {
    const client = makeFakeClient({ night_events: [] });

    await expect(getLastClosedEventId(client)).resolves.toBeNull();
  });
});

describe("verifyWithRetries", () => {
  it("reintenta mientras el evento no llegó a cloud, y encuentra éxito en un intento posterior", async () => {
    const local = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder()],
      tickets: [],
      cash_sales: [],
    });

    let call = 0;
    const cloud = {
      from: (table: string) => {
        call++;
        // Primer intento: cloud vacío (todavía no sincronizado). Resto: ya sincronizado.
        const db = call <= 1 ? {} : { night_events: [makeEvent()], orders: [makeOrder()], tickets: [], cash_sales: [] };
        return (makeFakeClient(db) as any).from(table);
      },
    } as unknown as SupabaseClient;

    const result = await verifyWithRetries(local, cloud, "event-1", 3, 1);

    expect(result.ok).toBe(true);
  });

  it("no reintenta si el mismatch es un error real (no 'pendiente')", async () => {
    const local = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder({ total: 1 })],
      tickets: [],
      cash_sales: [],
    });
    const cloud = makeFakeClient({
      night_events: [makeEvent()],
      orders: [makeOrder({ total: 2 })],
      tickets: [],
      cash_sales: [],
    });

    const result = await verifyWithRetries(local, cloud, "event-1", 3, 1);

    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes("total no coincide"))).toBe(true);
  });
});
