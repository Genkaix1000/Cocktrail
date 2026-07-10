import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { countRows, parseArgs, resetData, TABLES_TO_RESET } from "./reset-data.js";

type TableConfig = { count?: number; countError?: { message: string }; deleteError?: { message: string } };

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
});

describe("resetData", () => {
  it("borra todas las tablas de TABLES_TO_RESET por defecto", async () => {
    const { client, calls } = makeFakeClient({
      night_events: { count: 3 },
      users: { count: 2 },
      audit_logs: { count: 10 },
    });

    const deleted = await resetData(client);

    expect(deleted).toEqual({ night_events: 3, users: 2, audit_logs: 10 });
    for (const table of TABLES_TO_RESET) {
      expect(calls).toContainEqual({ table, op: "delete" });
      expect(calls).toContainEqual({ table, op: "not" });
    }
  });

  it("no toca drinks ni app_config", async () => {
    const { client, calls } = makeFakeClient({
      night_events: { count: 0 },
      users: { count: 0 },
      audit_logs: { count: 0 },
    });

    await resetData(client);

    expect(calls.some((c) => c.table === "drinks")).toBe(false);
    expect(calls.some((c) => c.table === "app_config")).toBe(false);
  });

  it("respeta una lista de tablas custom", async () => {
    const { client, calls } = makeFakeClient({ users: { count: 1 } });

    const deleted = await resetData(client, ["users"]);

    expect(deleted).toEqual({ users: 1 });
    expect(calls.every((c) => c.table === "users")).toBe(true);
  });

  it("lanza si el delete de una tabla falla", async () => {
    const { client } = makeFakeClient({
      night_events: { count: 1, deleteError: { message: "permission denied" } },
    });

    await expect(resetData(client, ["night_events"])).rejects.toThrow(/night_events.*permission denied/);
  });
});

describe("parseArgs", () => {
  it("acepta --target=local", () => {
    expect(parseArgs(["--target=local"])).toEqual({ target: "local", yes: false });
  });

  it("acepta --target=cloud", () => {
    expect(parseArgs(["--target=cloud"])).toEqual({ target: "cloud", yes: false });
  });

  it("acepta --yes con local", () => {
    expect(parseArgs(["--target=local", "--yes"])).toEqual({ target: "local", yes: true });
  });

  it("rechaza la falta de --target", () => {
    expect(() => parseArgs([])).toThrow(/--target/);
  });

  it("rechaza un --target inválido", () => {
    expect(() => parseArgs(["--target=produccion"])).toThrow(/--target/);
  });

  it("rechaza --yes combinado con --target=cloud", () => {
    expect(() => parseArgs(["--target=cloud", "--yes"])).toThrow(/--yes.*cloud/);
  });
});
