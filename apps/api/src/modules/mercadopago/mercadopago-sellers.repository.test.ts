import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseMercadoPagoSellersRepository } from "./mercadopago-sellers.repository.js";
import { decryptTokenTolerant, encryptToken } from "./mp-token-cipher.js";

// Mock del cliente supabase LOCAL: captura la operación (upsert/update/select),
// el payload y la cadena de filtros, y resuelve con resultados encolados.
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
        upsert(row: unknown, opts?: unknown) {
          op.method = "upsert";
          op.payload = row;
          op.chain.push(["upsert-opts", opts]);
          return builder;
        },
        update(row: unknown) {
          op.method = "update";
          op.payload = row;
          return builder;
        },
        single: () => Promise.resolve(takeResult()),
        maybeSingle: () => Promise.resolve(takeResult()),
        then: (onF: any, onR: any) => Promise.resolve(takeResult()).then(onF, onR),
      };
      for (const m of ["select", "eq", "neq", "gt", "limit", "order", "not"]) {
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
    user_id: "seller-1",
    access_token: null,
    refresh_token: null,
    access_token_enc: null,
    refresh_token_enc: null,
    key_version: null,
    expires_at: "2027-01-01T00:00:00.000Z",
    status: "active",
    seller_nickname: "BOSKO BAR",
    seller_first_name: null,
    seller_last_name: null,
    seller_email: null,
    updated_at: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("SupabaseMercadoPagoSellersRepository", () => {
  const repo = new SupabaseMercadoPagoSellersRepository();

  beforeEach(() => {
    h.state.results.length = 0;
    h.state.ops.length = 0;
  });

  describe("upsert", () => {
    it("escribe SOLO _enc (claro en NULL) y key_version=1", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.upsert({
        userId: "seller-1",
        accessToken: "AT-nuevo",
        refreshToken: "RT-nuevo",
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      });

      const op = h.state.ops[0];
      expect(op.method).toBe("upsert");
      const row = op.payload as Row;
      expect(row.access_token).toBeNull();
      expect(row.refresh_token).toBeNull();
      expect(row.key_version).toBe(1);
      expect(String(row.access_token_enc).startsWith("v1.")).toBe(true);
      // El blob escrito descifra al token original (cifrado real, no placeholder).
      expect(decryptTokenTolerant(row.access_token_enc as string, 1, "seller-1")).toBe("AT-nuevo");
      expect(decryptTokenTolerant(row.refresh_token_enc as string, 1, "seller-1")).toBe("RT-nuevo");
    });

    it("stub sin tokens (provisioning): no toca las columnas de token", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.upsert({ userId: "seller-1", status: "active" });

      const row = h.state.ops[0].payload as Row;
      expect(row).not.toHaveProperty("access_token_enc");
      expect(row).not.toHaveProperty("access_token");
      expect(row).not.toHaveProperty("key_version");
    });
  });

  describe("mapRow (vía findByUserId)", () => {
    it("descifra las columnas _enc hacia el tipo Seller", async () => {
      h.state.results.push({
        data: makeRow({ access_token_enc: encryptToken("AT-cifrado"), key_version: 1 }),
        error: null,
      });

      const seller = await repo.findByUserId("seller-1");

      expect(seller?.accessToken).toBe("AT-cifrado");
    });

    it("tolerancia legacy: fila en claro (key_version NULL) se lee igual", async () => {
      h.state.results.push({
        data: makeRow({ access_token: "AT-en-claro", refresh_token: "RT-en-claro" }),
        error: null,
      });

      const seller = await repo.findByUserId("seller-1");

      expect(seller?.accessToken).toBe("AT-en-claro");
      expect(seller?.refreshToken).toBe("RT-en-claro");
    });
  });

  describe("findActive", () => {
    it("0 activos → null", async () => {
      h.state.results.push({ data: [], error: null });
      await expect(repo.findActive()).resolves.toBeNull();
    });

    it("1 activo → lo devuelve, filtrando por status sin order-by", async () => {
      h.state.results.push({ data: [makeRow()], error: null });

      const seller = await repo.findActive();

      expect(seller?.userId).toBe("seller-1");
      const chain = h.state.ops[0].chain;
      expect(chain).toContainEqual(["eq", "status", "active"]);
      expect(chain).toContainEqual(["limit", 2]);
      expect(chain.some((c) => c[0] === "order")).toBe(false);
    });

    it("2 activos → lanza con los user_id (invariante single-seller roto)", async () => {
      h.state.results.push({
        data: [makeRow(), makeRow({ user_id: "seller-2" })],
        error: null,
      });

      await expect(repo.findActive()).rejects.toThrow(/single-seller.*seller-1, seller-2/s);
    });
  });

  describe("update", () => {
    it("cifra los tokens nuevos", async () => {
      h.state.results.push({ data: makeRow(), error: null });

      await repo.update("seller-1", { accessToken: "AT-refrescado", status: "active" });

      const op = h.state.ops[0];
      expect(op.method).toBe("update");
      const row = op.payload as Row;
      expect(row.access_token).toBeNull();
      expect(decryptTokenTolerant(row.access_token_enc as string, 1, "seller-1")).toBe("AT-refrescado");
    });

    it("wipe explícito (accessToken null) deja _enc NULL y key_version NULL", async () => {
      h.state.results.push({ data: makeRow({ status: "expired" }), error: null });

      await repo.update("seller-1", { accessToken: null, refreshToken: null, status: "expired" });

      const row = h.state.ops[0].payload as Row;
      expect(row.access_token_enc).toBeNull();
      expect(row.refresh_token_enc).toBeNull();
      expect(row.key_version).toBeNull();
      expect(row.status).toBe("expired");
    });
  });

  describe("wipeAllTokens", () => {
    it("anula tokens (claro y _enc) en todas las filas y devuelve los user_id", async () => {
      h.state.results.push({ data: [{ user_id: "seller-1" }, { user_id: "seller-2" }], error: null });

      const wiped = await repo.wipeAllTokens();

      expect(wiped).toEqual(["seller-1", "seller-2"]);
      const row = h.state.ops[0].payload as Row;
      expect(row.access_token).toBeNull();
      expect(row.access_token_enc).toBeNull();
      expect(row.refresh_token).toBeNull();
      expect(row.refresh_token_enc).toBeNull();
      expect(row.key_version).toBeNull();
      expect(row.status).toBe("expired");
    });
  });

  describe("backfillEncryption", () => {
    it("cifra filas legacy en claro, saltea las ya cifradas y tolera filas ilegibles", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        h.state.results.push({
          data: [
            // legacy en claro → se re-escribe
            { user_id: "s-plain", access_token: "AT-claro", refresh_token: "RT-claro", access_token_enc: null, refresh_token_enc: null, key_version: null },
            // ya cifrada con la clave actual → no se toca
            { user_id: "s-ok", access_token: null, refresh_token: null, access_token_enc: encryptToken("AT-ok"), refresh_token_enc: null, key_version: 1 },
            // blob que ninguna clave abre → warn y se saltea (fail-open)
            { user_id: "s-broken", access_token: null, refresh_token: null, access_token_enc: "v1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAA", refresh_token_enc: null, key_version: 1 },
          ],
          error: null,
        });
        // resultado del update de s-plain
        h.state.results.push({ data: null, error: null });

        const result = await repo.backfillEncryption();

        expect(result.migrated).toBe(1);
        const update = h.state.ops.find((op) => op.method === "update");
        expect(update).toBeDefined();
        expect(update!.chain).toContainEqual(["eq", "user_id", "s-plain"]);
        const row = update!.payload as Row;
        expect(row.access_token).toBeNull();
        expect(row.key_version).toBe(1);
        expect(decryptTokenTolerant(row.access_token_enc as string, 1, "s-plain")).toBe("AT-claro");
        // El warn de la fila rota menciona el user_id pero JAMÁS un token.
        const warns = warnSpy.mock.calls.flat().map(String).join(" ");
        expect(warns).toContain("s-broken");
        expect(warns).not.toContain("AT-claro");
        expect(warns).not.toContain("AT-ok");
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
