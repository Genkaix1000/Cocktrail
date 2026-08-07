import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { SupabaseMercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";

// Mock del cliente supabase LOCAL (mismo patrón que mercadopago-sellers.repository.test.ts).
const h = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown };
  type Op = { table: string; method: string; payload?: unknown; chain: unknown[][] };
  const state = { results: [] as Result[], ops: [] as Op[] };
  const takeResult = (): Result => state.results.shift() ?? { data: null, error: null };
  const supabase = {
    from(table: string) {
      const op: Op = { table, method: "select", chain: [] };
      state.ops.push(op);
      const builder: any = {
        insert(row: unknown) {
          op.method = "insert";
          op.payload = row;
          return builder;
        },
        update(row: unknown) {
          op.method = "update";
          op.payload = row;
          return builder;
        },
        delete() {
          op.method = "delete";
          return builder;
        },
        single: () => Promise.resolve(takeResult()),
        maybeSingle: () => Promise.resolve(takeResult()),
        then: (onF: any, onR: any) => Promise.resolve(takeResult()).then(onF, onR),
      };
      for (const m of ["select", "eq", "order", "limit"]) {
        builder[m] = (...args: unknown[]) => {
          op.chain.push([m, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { state, supabase };
});

vi.mock("../../shared/supabase.js", () => ({
  supabase: h.supabase,
}));

type Row = Record<string, unknown>;

function makeRow(overrides: Row = {}): Row {
  return {
    id: "caja-1",
    bar_id: "bar-uuid-1",
    store_id: "85068168",
    external_pos_id: "COCKTRAILBAR01",
    pos_id_mp: "135641665",
    qr_image: "https://mp.example/qr.png",
    qr_template: "https://mp.example/qr.pdf",
    seller_user_id: "seller-1",
    store_name: null,
    created_at: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("SupabaseMercadoPagoCajasRepository", () => {
  const repo = new SupabaseMercadoPagoCajasRepository();

  beforeEach(() => {
    h.state.results.length = 0;
    h.state.ops.length = 0;
  });

  describe("mapRow (vía findById)", () => {
    it("mapea store_name → storeName", async () => {
      h.state.results.push({ data: makeRow({ store_name: "Bosko Bolívar" }), error: null });

      const caja = await repo.findById("caja-1");

      expect(caja?.storeName).toBe("Bosko Bolívar");
      expect(caja?.externalPosId).toBe("COCKTRAILBAR01");
    });
  });

  describe("create", () => {
    it("persiste store_name en NULL si no viene (cache diferida)", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.create({
        barId: "bar-uuid-1",
        storeId: "85068168",
        externalPosId: "COCKTRAILBAR01",
        posIdMp: "135641665",
        qrImage: null,
        qrTemplate: null,
        sellerUserId: "seller-1",
      });

      const payload = h.state.ops[0].payload as Row;
      expect(payload.store_name).toBeNull();
      expect(payload.seller_user_id).toBe("seller-1");
    });
  });

  describe("updateProvisioning", () => {
    it("escribe SOLO las claves del patch, en snake_case", async () => {
      h.state.results.push({ data: makeRow({ store_id: "999", store_name: "Nueva" }), error: null });

      const caja = await repo.updateProvisioning("caja-1", {
        storeId: "999",
        storeName: "Nueva",
      });

      const op = h.state.ops[0];
      expect(op.method).toBe("update");
      expect(op.payload).toEqual({ store_id: "999", store_name: "Nueva" });
      expect(op.chain).toContainEqual(["eq", "id", "caja-1"]);
      expect(caja.storeId).toBe("999");
      expect(caja.storeName).toBe("Nueva");
    });

    it("re-provisioning completo: store, pos, QRs y seller sobre la MISMA fila", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.updateProvisioning("caja-1", {
        storeId: "999",
        posIdMp: "888",
        qrImage: "https://mp.example/qr2.png",
        qrTemplate: "https://mp.example/qr2.pdf",
        sellerUserId: "seller-2",
      });

      expect(h.state.ops[0].payload).toEqual({
        store_id: "999",
        pos_id_mp: "888",
        qr_image: "https://mp.example/qr2.png",
        qr_template: "https://mp.example/qr2.pdf",
        seller_user_id: "seller-2",
      });
    });

    it("propaga el error de supabase", async () => {
      h.state.results.push({ data: null, error: { code: "23503", message: "fk" } });
      await expect(repo.updateProvisioning("caja-1", { storeId: "x" })).rejects.toMatchObject({
        code: "23503",
      });
    });
  });
});
