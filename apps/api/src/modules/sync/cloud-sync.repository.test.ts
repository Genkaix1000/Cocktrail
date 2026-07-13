import { describe, it, expect, vi, beforeEach } from "vitest";

type QueryResult = { data: any; error: any };

function makeQueryBuilder(result: QueryResult) {
  const builder: any = {};
  const chainable = ["select", "upsert"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
  return builder;
}

const localResults = new Map<string, QueryResult>();
const cloudResults = new Map<string, QueryResult>();
let cloudConfigured = true;

vi.mock("../../shared/supabase.js", () => ({
  get supabase() {
    return { from: (table: string) => makeQueryBuilder(localResults.get(table) ?? { data: null, error: null }) };
  },
  get supabaseCloud() {
    if (!cloudConfigured) return null;
    return { from: (table: string) => makeQueryBuilder(cloudResults.get(table) ?? { data: [], error: null }) };
  },
}));

const { SupabaseCloudSyncRepository } = await import("./cloud-sync.repository.js");

beforeEach(() => {
  localResults.clear();
  cloudResults.clear();
  cloudConfigured = true;
});

describe("SupabaseCloudSyncRepository.pullDrinks", () => {
  it("con datos en cloud y upsert local OK, devuelve el count real", async () => {
    cloudResults.set("drinks", { data: [{ id: 1, name: "Fernet" }], error: null });
    localResults.set("drinks", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    expect(result).toEqual({ count: 1 });
  });

  it("si el upsert LOCAL falla, devuelve count 0 (no reporta éxito falso) — bug real del 2026-07-13", async () => {
    cloudResults.set("drinks", { data: [{ id: 1, name: "Fernet" }], error: null });
    localResults.set("drinks", { data: null, error: { message: "constraint violation" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    // Antes de este fix, esto devolvía { count: 1 } aunque el upsert local hubiera
    // fallado — SyncService.pullMasterData nunca se enteraba y la tabla local de
    // drinks quedaba vacía en silencio, sin loguear el error real ni caer al seed.
    expect(result).toEqual({ count: 0 });
  });

  it("sin cloud configurada, devuelve count 0 sin tocar local", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    expect(result).toEqual({ count: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pullUsers", () => {
  it("si el upsert LOCAL falla, devuelve count 0", async () => {
    cloudResults.set("users", { data: [{ id: "u1", username: "admin" }], error: null });
    localResults.set("users", { data: null, error: { message: "constraint violation" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullUsers();

    expect(result).toEqual({ count: 0 });
  });
});
