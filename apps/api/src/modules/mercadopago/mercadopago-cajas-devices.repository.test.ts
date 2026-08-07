import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { SupabaseMercadoPagoCajasDevicesRepository } from "./mercadopago-cajas-devices.repository.js";

// Mock del cliente supabase LOCAL (mismo patrón que mercadopago-sellers.repository.test.ts):
// captura la operación (insert/update/select), el payload y la cadena de filtros,
// y resuelve con resultados encolados.
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
        maybeSingle: () => {
          op.chain.push(["maybeSingle"]);
          return Promise.resolve(takeResult());
        },
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
    id: "dev-1",
    caja_id: "caja-1",
    device_id: "PAX_A910__X",
    device_username: "Caja 1",
    operating_mode: "PDV",
    operating_mode_synced_at: "2026-07-23T00:00:00.000Z",
    is_active: true,
    linked_at: "2026-07-22T00:00:00.000Z",
    deactivated_at: null,
    caja: null,
    ...overrides,
  };
}

describe("SupabaseMercadoPagoCajasDevicesRepository", () => {
  const repo = new SupabaseMercadoPagoCajasDevicesRepository();

  beforeEach(() => {
    h.state.results.length = 0;
    h.state.ops.length = 0;
  });

  describe("mapRow (vía findByDeviceId)", () => {
    it("mapea las columnas nuevas del ciclo de vida", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      const device = await repo.findByDeviceId("PAX_A910__X");

      expect(device).toMatchObject({
        id: "dev-1",
        cajaId: "caja-1",
        deviceId: "PAX_A910__X",
        operatingMode: "PDV",
        operatingModeSyncedAt: "2026-07-23T00:00:00.000Z",
        isActive: true,
        linkedAt: "2026-07-22T00:00:00.000Z",
        deactivatedAt: null,
      });
    });
  });

  describe("findActiveByCajaId", () => {
    it("filtra por caja_id + is_active=true con maybeSingle", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      const device = await repo.findActiveByCajaId("caja-1");

      const op = h.state.ops[0];
      expect(op.table).toBe("mercadopago_cajas_devices");
      expect(op.chain).toContainEqual(["eq", "caja_id", "caja-1"]);
      expect(op.chain).toContainEqual(["eq", "is_active", true]);
      expect(op.chain).toContainEqual(["maybeSingle"]);
      expect(device?.isActive).toBe(true);
    });

    it("devuelve null si la caja no tiene activo", async () => {
      h.state.results.push({ data: null, error: null });
      await expect(repo.findActiveByCajaId("caja-1")).resolves.toBeNull();
    });
  });

  describe("listByCajaId", () => {
    it("lista activo + históricos de la caja, ordenados por created_at", async () => {
      h.state.results.push({
        data: [makeRow(), makeRow({ id: "dev-2", is_active: false, deactivated_at: "2026-07-23T00:00:00.000Z" })],
        error: null,
      });

      const devices = await repo.listByCajaId("caja-1");

      expect(devices).toHaveLength(2);
      expect(devices[1].isActive).toBe(false);
      const op = h.state.ops[0];
      expect(op.chain).toContainEqual(["eq", "caja_id", "caja-1"]);
      expect(op.chain).toContainEqual(["order", "created_at", { ascending: true }]);
    });
  });

  describe("create", () => {
    it("inserta sin caja_id ni is_active (nace suelto e inactivo por default de la DB)", async () => {
      h.state.results.push({ data: makeRow({ caja_id: null, is_active: false }), error: null });

      await repo.create({
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
        operatingMode: "STANDALONE",
        operatingModeSyncedAt: "2026-07-24T00:00:00.000Z",
      });

      const payload = h.state.ops[0].payload as Row;
      expect(payload).not.toHaveProperty("caja_id");
      expect(payload).not.toHaveProperty("is_active");
      expect(payload.operating_mode).toBe("STANDALONE");
      expect(payload.operating_mode_synced_at).toBe("2026-07-24T00:00:00.000Z");
    });
  });

  describe("update", () => {
    it("solo escribe los campos del patch (y no admite caja_id)", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.update("dev-1", { operatingMode: "PDV", operatingModeSyncedAt: "2026-07-24T00:00:00.000Z" });

      const payload = h.state.ops[0].payload as Row;
      expect(payload).toEqual({
        operating_mode: "PDV",
        operating_mode_synced_at: "2026-07-24T00:00:00.000Z",
      });
    });
  });

  describe("assignCaja", () => {
    it("setea caja_id y linked_at=now()", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.assignCaja("dev-1", "caja-1");

      const op = h.state.ops[0];
      expect(op.method).toBe("update");
      const payload = op.payload as Row;
      expect(payload.caja_id).toBe("caja-1");
      expect(typeof payload.linked_at).toBe("string");
      expect(op.chain).toContainEqual(["eq", "id", "dev-1"]);
    });
  });

  describe("activate / deactivate", () => {
    it("activate: is_active=true y limpia deactivated_at", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.activate("dev-1");

      expect(h.state.ops[0].payload).toEqual({ is_active: true, deactivated_at: null });
    });

    it("deactivate: is_active=false y sella deactivated_at=now()", async () => {
      h.state.results.push({
        data: makeRow({ is_active: false, deactivated_at: "2026-07-24T00:00:00.000Z" }),
        error: null,
      });

      const device = await repo.deactivate("dev-1");

      const payload = h.state.ops[0].payload as Row;
      expect(payload.is_active).toBe(false);
      expect(typeof payload.deactivated_at).toBe("string");
      expect(device.isActive).toBe(false);
    });
  });

  describe("errores", () => {
    it("propaga el error de supabase", async () => {
      h.state.results.push({ data: null, error: { code: "23505", message: "dup" } });
      await expect(repo.activate("dev-1")).rejects.toMatchObject({ code: "23505" });
    });
  });
});
