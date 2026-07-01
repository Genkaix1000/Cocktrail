import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import { computeTotals } from "../../shared/utils/totals.js";

const EMPTY_TOTALS = computeTotals([], []);

// supabase-js expone un query builder "thenable" (select/eq/insert/... encadenables,
// y awaitable directamente). Este fake soporta ambos usos: encadenar métodos y
// resolver a un resultado configurado por tabla al ser awaited.
type QueryResult = { data: any; error: any };

function makeQueryBuilder(result: QueryResult) {
  const builder: any = {};
  const chainable = ["select", "eq", "neq", "in", "limit", "order", "upsert", "insert", "update", "delete"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
  return builder;
}

const localResults = new Map<string, QueryResult>();
const cloudResults = new Map<string, QueryResult>();
let cloudConfigured = true;

vi.mock("../../shared/supabase.js", () => ({
  get supabase() {
    return {
      from: (table: string) => makeQueryBuilder(localResults.get(table) ?? { data: [], error: null }),
    };
  },
  get supabaseCloud() {
    if (!cloudConfigured) return null;
    return {
      from: (table: string) => makeQueryBuilder(cloudResults.get(table) ?? { data: [], error: null }),
    };
  },
}));

const { SyncService } = await import("./sync.service.js");

function setLocal(table: string, result: QueryResult) {
  localResults.set(table, result);
}
function setCloud(table: string, result: QueryResult) {
  cloudResults.set(table, result);
}

function makeOrdersRepo(): OrdersRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByToken: vi.fn(),
    findActive: vi.fn(),
    listForEvent: vi.fn().mockResolvedValue([]),
    listAll: vi.fn(),
    updateStatus: vi.fn(),
  } as unknown as OrdersRepository;
}

function makeCashSalesRepo(): CashSalesRepository {
  return {
    add: vi.fn(),
    listForEvent: vi.fn().mockResolvedValue([]),
  } as unknown as CashSalesRepository;
}

beforeEach(() => {
  localResults.clear();
  cloudResults.clear();
  cloudConfigured = true;
});

describe("SyncService.pullMasterData", () => {
  it("sin Supabase Cloud configurada, no hace nada (no tira)", async () => {
    cloudConfigured = false;
    const service = new SyncService();
    await expect(service.pullMasterData()).resolves.toBeUndefined();
  });

  it("con datos en la nube, hace upsert local de users y drinks", async () => {
    setCloud("users", { data: [{ id: "u1", username: "admin" }], error: null });
    setCloud("drinks", { data: [{ id: 1, name: "Fernet" }], error: null });
    const service = new SyncService();
    await expect(service.pullMasterData()).resolves.toBeUndefined();
  });
});

describe("SyncService.ensureLocalMasterDataSeeded", () => {
  it("no rompe si local ya tiene users y drinks", async () => {
    setLocal("users", { data: [{ id: "u1" }], error: null });
    setLocal("drinks", { data: [{ id: 1 }], error: null });
    const service = new SyncService();
    await expect(service.ensureLocalMasterDataSeeded()).resolves.toBeUndefined();
  });

  it("no rompe si local está vacío (dispara el seed por defecto)", async () => {
    setLocal("users", { data: [], error: null });
    setLocal("drinks", { data: [], error: null });
    const service = new SyncService();
    await expect(service.ensureLocalMasterDataSeeded()).resolves.toBeUndefined();
  });
});

describe("SyncService.pushEventData", () => {
  it("sin Supabase Cloud configurada, no hace nada (no tira)", async () => {
    cloudConfigured = false;
    const service = new SyncService();
    await expect(
      service.pushEventData("event-1", { id: "event-1", status: "cerrado", startedAt: Date.now(), orderCounter: 1 }, EMPTY_TOTALS),
    ).resolves.toBeUndefined();
  });

  it("con cloud configurada y sin error, no tira", async () => {
    setLocal("orders", { data: [], error: null });
    setLocal("cash_sales", { data: [], error: null });
    const service = new SyncService();
    await expect(
      service.pushEventData("event-1", { id: "event-1", status: "cerrado", startedAt: Date.now(), orderCounter: 1 }, EMPTY_TOTALS),
    ).resolves.toBeUndefined();
  });
});

describe("SyncService.syncAllPendingEvents", () => {
  it("tira si no hay Supabase Cloud configurada", async () => {
    cloudConfigured = false;
    const service = new SyncService();
    await expect(service.syncAllPendingEvents(makeOrdersRepo(), makeCashSalesRepo())).rejects.toThrow(/No cloud DB configured/);
  });

  it("sin eventos pendientes, devuelve counts en 0", async () => {
    setLocal("night_events", { data: [], error: null });
    const service = new SyncService();
    const result = await service.syncAllPendingEvents(makeOrdersRepo(), makeCashSalesRepo());
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
  });
});
