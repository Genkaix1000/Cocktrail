import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { deleteEmptyNights, findEmptyNightIds, parseArgs } from "./cleanup-empty-nights.js";

type FindResult = { data?: { id: string }[]; error?: { message: string } };

/**
 * Fake mínimo del query builder "thenable" de supabase-js para los dos usos
 * de este script: `.select("id").eq(...).eq(...)` (buscar) y
 * `.delete().in("id", ids)` (borrar).
 */
function makeFakeClient(opts: { find?: FindResult; deleteError?: { message: string } }) {
  const calls: { op: string; args: unknown[] }[] = [];

  const builder: any = {
    select: (...args: unknown[]) => {
      calls.push({ op: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ op: "eq", args });
      return builder;
    },
    delete: () => {
      calls.push({ op: "delete", args: [] });
      return builder;
    },
    in: (...args: unknown[]) => {
      calls.push({ op: "in", args });
      return Promise.resolve({ error: opts.deleteError ?? null });
    },
    then: (resolve: (v: FindResult) => unknown) => resolve(opts.find ?? { data: [] }),
  };

  const client = { from: () => builder } as unknown as SupabaseClient;
  return { client, calls };
}

describe("findEmptyNightIds", () => {
  it("filtra por order_counter = 0 y status = cerrado en local", async () => {
    const { client, calls } = makeFakeClient({ find: { data: [{ id: "a" }, { id: "b" }] } });

    const ids = await findEmptyNightIds(client, "local");

    expect(ids).toEqual(["a", "b"]);
    expect(calls).toContainEqual({ op: "eq", args: ["order_counter", 0] });
    expect(calls).toContainEqual({ op: "eq", args: ["status", "cerrado"] });
  });

  it("en cloud NO filtra por status (esa columna no existe ahí)", async () => {
    const { client, calls } = makeFakeClient({ find: { data: [{ id: "a" }] } });

    await findEmptyNightIds(client, "cloud");

    expect(calls).toContainEqual({ op: "eq", args: ["order_counter", 0] });
    expect(calls.some((c) => c.op === "eq" && c.args[0] === "status")).toBe(false);
  });

  it("devuelve [] si no hay datos", async () => {
    const { client } = makeFakeClient({ find: {} });

    await expect(findEmptyNightIds(client, "local")).resolves.toEqual([]);
  });

  it("lanza si supabase devuelve error", async () => {
    const { client } = makeFakeClient({ find: { error: { message: "boom" } } });

    await expect(findEmptyNightIds(client, "local")).rejects.toThrow(/boom/);
  });
});

describe("deleteEmptyNights", () => {
  it("no llama a la API si la lista está vacía", async () => {
    const { client, calls } = makeFakeClient({});

    const deleted = await deleteEmptyNights(client, []);

    expect(deleted).toBe(0);
    expect(calls).toEqual([]);
  });

  it("borra por id y devuelve la cantidad", async () => {
    const { client, calls } = makeFakeClient({});

    const deleted = await deleteEmptyNights(client, ["a", "b", "c"]);

    expect(deleted).toBe(3);
    expect(calls).toContainEqual({ op: "delete", args: [] });
    expect(calls).toContainEqual({ op: "in", args: ["id", ["a", "b", "c"]] });
  });

  it("lanza si el delete falla", async () => {
    const { client } = makeFakeClient({ deleteError: { message: "permission denied" } });

    await expect(deleteEmptyNights(client, ["a"])).rejects.toThrow(/permission denied/);
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
