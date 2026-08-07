import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { countRows, resetData, TABLES_TO_RESET } from "./reset-data.js";

type TableConfig = {
  count?: number;
  countError?: { message: string; code?: string };
  deleteError?: { message: string; code?: string };
};

/**
 * Fake mínimo del query builder "thenable" de supabase-js, con soporte para
 * los dos usos que hace reset-data.ts: `.select("*", {count, head})` (para
 * contar) y `.delete().not("id","is",null)` (para vaciar).
 */
function makeFakeClient(config: Record<string, TableConfig>) {
  const calls: { table: string; op: "select" | "delete" | "not" }[] = [];

  function makeBuilder(table: string) {
    const cfg = config[table] ?? {};
    const builder: any = {
      select: (_cols: string, _opts?: unknown) => {
        calls.push({ table, op: "select" });
        return Promise.resolve({ count: cfg.count ?? 0, error: cfg.countError ?? null });
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return builder;
      },
      not: (_col: string, _op: string, _val: unknown) => {
        calls.push({ table, op: "not" });
        return Promise.resolve({ error: cfg.deleteError ?? null });
      },
    };
    return builder;
  }

  const client = {
    from: (table: string) => makeBuilder(table),
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("countRows", () => {
  it("devuelve el count de la tabla", async () => {
    const { client } = makeFakeClient({ night_events: { count: 5 } });

    await expect(countRows(client, "night_events")).resolves.toBe(5);
  });

  it("devuelve 0 si count viene null", async () => {
    const { client } = makeFakeClient({ night_events: {} });

    await expect(countRows(client, "night_events")).resolves.toBe(0);
  });

  it("lanza si supabase devuelve error", async () => {
    const { client } = makeFakeClient({ night_events: { countError: { message: "boom" } } });

    await expect(countRows(client, "night_events")).rejects.toThrow(/night_events.*boom/);
  });

  it("devuelve null (sin lanzar) si la tabla no existe en ese entorno", async () => {
    const { client } = makeFakeClient({
      mp_webhook_events: {
        countError: {
          message: "Could not find the table 'public.mp_webhook_events' in the schema cache",
          code: "PGRST205",
        },
      },
    });

    await expect(countRows(client, "mp_webhook_events")).resolves.toBeNull();
  });
});

describe("resetData", () => {
  it("borra todas las tablas de TABLES_TO_RESET por defecto (incluye las MP transaccionales)", async () => {
    const { client, calls } = makeFakeClient({
      orders: { count: 5 },
      mp_orders: { count: 7 },
      mp_webhook_events: { count: 4 },
      night_events: { count: 3 },
      users: { count: 2 },
      audit_logs: { count: 10 },
    });

    const deleted = await resetData(client);

    expect(deleted).toEqual({
      orders: 5,
      mp_orders: 7,
      mp_webhook_events: 4,
      night_events: 3,
      users: 2,
      audit_logs: 10,
    });
    for (const table of TABLES_TO_RESET) {
      expect(calls).toContainEqual({ table, op: "delete" });
      expect(calls).toContainEqual({ table, op: "not" });
    }
  });

  it("borra mp_orders ANTES que night_events (FK a night_events sin CASCADE)", async () => {
    const { client, calls } = makeFakeClient({});

    await resetData(client);

    const deletes = calls.filter((c) => c.op === "delete").map((c) => c.table);
    expect(deletes.indexOf("mp_orders")).toBeGreaterThanOrEqual(0);
    expect(deletes.indexOf("mp_orders")).toBeLessThan(deletes.indexOf("night_events"));
    // y el orden declarado también lo refleja, por si alguien reordena la constante
    expect(TABLES_TO_RESET.indexOf("mp_orders")).toBeLessThan(TABLES_TO_RESET.indexOf("night_events"));
  });

  it("no toca la config operativa: drinks, app_config, bars ni las tablas de config MP", async () => {
    const { client, calls } = makeFakeClient({
      mp_orders: { count: 0 },
      mp_webhook_events: { count: 0 },
      night_events: { count: 0 },
      users: { count: 0 },
      audit_logs: { count: 0 },
    });

    await resetData(client);

    const preserved = [
      "drinks",
      "app_config",
      "bars",
      "mercadopago_sellers",
      "mercadopago_cajas",
      "mercadopago_cajas_devices",
    ];
    for (const table of preserved) {
      expect(calls.some((c) => c.table === table)).toBe(false);
    }
  });

  it("respeta una lista de tablas custom", async () => {
    const { client, calls } = makeFakeClient({ users: { count: 1 } });

    const deleted = await resetData(client, ["users"]);

    expect(deleted).toEqual({ users: 1 });
    expect(calls.every((c) => c.table === "users")).toBe(true);
  });

  it("lanza si el delete de una tabla falla por un error real", async () => {
    const { client } = makeFakeClient({
      night_events: { count: 1, deleteError: { message: "permission denied" } },
    });

    await expect(resetData(client, ["night_events"])).rejects.toThrow(/night_events.*permission denied/);
  });

  it("saltea (sin lanzar) una tabla que no existe en ese entorno, y sigue con las demás", async () => {
    // Caso real: mp_webhook_events es local-only, en Cloud no existe → el
    // count ya falla con PGRST205 y ni se intenta el delete.
    const { client, calls } = makeFakeClient({
      orders: { count: 5 },
      mp_orders: { count: 7 },
      mp_webhook_events: {
        countError: {
          message: "Could not find the table 'public.mp_webhook_events' in the schema cache",
          code: "PGRST205",
        },
      },
      night_events: { count: 3 },
      users: { count: 2 },
      audit_logs: { count: 10 },
    });

    const deleted = await resetData(client);

    expect(deleted).toEqual({
      orders: 5,
      mp_orders: 7,
      mp_webhook_events: null,
      night_events: 3,
      users: 2,
      audit_logs: 10,
    });
    expect(calls).not.toContainEqual({ table: "mp_webhook_events", op: "delete" });
  });

  it("también saltea si la tabla desaparece entre el count y el delete", async () => {
    const { client, calls } = makeFakeClient({
      night_events: { count: 3 },
      audit_logs: {
        deleteError: { message: "Could not find the table 'public.audit_logs' in the schema cache", code: "PGRST205" },
      },
    });

    const deleted = await resetData(client, ["night_events", "audit_logs"]);

    expect(deleted).toEqual({ night_events: 3, audit_logs: null });
    // acá el delete sí se intentó: el count había pasado
    expect(calls).toContainEqual({ table: "audit_logs", op: "delete" });
  });
});
