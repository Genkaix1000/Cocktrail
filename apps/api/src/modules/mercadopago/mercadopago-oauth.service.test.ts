import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MercadoPagoOAuthService, type MpOAuthConfig } from "./mercadopago-oauth.service.js";
import type { OAuthStatesRepository } from "./oauth-states.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import { encryptSecret } from "../../shared/crypto/aes-gcm.js";
import { MP_HANDOFF_INFO } from "./mp-token-cipher.js";
import { env } from "../../config/env.js";

const CONFIG: MpOAuthConfig = {
  appId: "app-123",
  clientSecret: "secret-xyz",
  redirectUri: "https://proj.supabase.co/functions/v1/mp-auth-callback",
  refreshMarginDays: 5,
};

function makeStatesRepo() {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn(),
  };
}

function makeSellersRepo() {
  return {
    upsert: vi.fn().mockImplementation(async (s) => s),
    findByUserId: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockImplementation(async (userId, patch) => ({ userId, ...patch })),
    wipeAllTokens: vi.fn().mockResolvedValue([]),
    backfillEncryption: vi.fn().mockResolvedValue({ migrated: 0 }),
  };
}

/**
 * Mock del cliente de Cloud: cola global de resultados en orden de llamada +
 * captura de operaciones (tabla, método, payload, cadena de filtros).
 */
function makeCloudDb() {
  type Result = { data: unknown; error: unknown };
  type Op = { table: string; method: string; payload?: unknown; chain: unknown[][] };
  const state = { results: [] as Result[], ops: [] as Op[] };
  const takeResult = (): Result => state.results.shift() ?? { data: null, error: null };
  const db = {
    from(table: string) {
      const op: Op = { table, method: "select", chain: [] };
      state.ops.push(op);
      const builder: any = {
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
      for (const m of ["select", "eq", "neq", "gt", "limit", "order", "not"]) {
        builder[m] = (...args: unknown[]) => {
          op.chain.push([m, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, state };
}

function mockFetchOnce(response: { ok: boolean; status?: number; body?: unknown }) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    statusText: "Error",
    json: vi.fn().mockResolvedValue(response.body ?? {}),
  } as unknown as Response);
}

function makeSeller(overrides: Partial<Seller> = {}): Seller {
  return {
    userId: "seller-1",
    accessToken: "AT-old",
    refreshToken: "RT-old",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: "active",
    nickname: "BOSKO BAR",
    firstName: null,
    lastName: null,
    email: "bosko@example.com",
    linkedAt: new Date("2026-07-15T22:14:00Z"),
    ...overrides,
  };
}

describe("MercadoPagoOAuthService", () => {
  let statesRepo: ReturnType<typeof makeStatesRepo>;
  let sellersRepo: ReturnType<typeof makeSellersRepo>;
  let service: MercadoPagoOAuthService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    statesRepo = makeStatesRepo();
    sellersRepo = makeSellersRepo();
    service = new MercadoPagoOAuthService(
      statesRepo as unknown as OAuthStatesRepository,
      sellersRepo as unknown as MercadoPagoSellersRepository,
      CONFIG,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("generateAuthUrl", () => {
    it("genera un state único entre llamadas consecutivas", async () => {
      const a = await service.generateAuthUrl("BARRA-01");
      const b = await service.generateAuthUrl("BARRA-01");
      const sa = new URL(a.url).searchParams.get("state");
      const sb = new URL(b.url).searchParams.get("state");
      expect(sa).toBeTruthy();
      expect(sa).not.toBe(sb);
    });

    it("el code_verifier tiene 43-128 chars base64url y el challenge es S256", async () => {
      await service.generateAuthUrl("BARRA-01");
      const verifier: string = statesRepo.insert.mock.calls[0][0].codeVerifier;
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it("arma la URL con client_id, response_type, redirect_uri, state, PKCE S256", async () => {
      const { url } = await service.generateAuthUrl("BARRA-01");
      const p = new URL(url);
      expect(p.origin + p.pathname).toBe("https://auth.mercadopago.com/authorization");
      expect(p.searchParams.get("client_id")).toBe("app-123");
      expect(p.searchParams.get("response_type")).toBe("code");
      expect(p.searchParams.get("platform_id")).toBe("mp");
      expect(p.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
      expect(p.searchParams.get("code_challenge_method")).toBe("S256");
      expect(p.searchParams.get("code_challenge")).toBeTruthy();
      expect(p.searchParams.get("state")).toBe(statesRepo.insert.mock.calls[0][0].state);
    });

    it("NO incluye scope por defecto (se agrega solo si MP no devuelve refresh_token)", async () => {
      const { url } = await service.generateAuthUrl("BARRA-01");
      expect(new URL(url).searchParams.has("scope")).toBe(false);
    });

    it("persiste el state con code_verifier, bar_id y TTL ~10 min", async () => {
      const before = Date.now();
      await service.generateAuthUrl("BARRA-01");
      const arg = statesRepo.insert.mock.calls[0][0];
      expect(arg.barId).toBe("BARRA-01");
      const ttl = arg.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(9 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    });

    it("lanza si faltan MP_APP_ID / MP_REDIRECT_URI", async () => {
      const svc = new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        { ...CONFIG, appId: undefined },
      );
      await expect(svc.generateAuthUrl("BARRA-01")).rejects.toThrow(/no está configurado/i);
      expect(statesRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe("requireBarId", () => {
    it("acepta un string no vacío", () => {
      expect(service.requireBarId("BARRA-01")).toBe("BARRA-01");
    });
    it("rechaza vacío / no-string", () => {
      expect(() => service.requireBarId("")).toThrow();
      expect(() => service.requireBarId(undefined)).toThrow();
    });
  });

  describe("getSellerStatus", () => {
    it("devuelve linked:false si no hay seller activo", async () => {
      sellersRepo.findActive.mockResolvedValue(null);
      const res = await service.getSellerStatus("BARRA-01");
      expect(res).toEqual({ linked: false, status: null, nickname: null, email: null, linkedAt: null, displayName: null });
    });

    it("devuelve datos de cuenta si hay seller activo", async () => {
      sellersRepo.findActive.mockResolvedValue(makeSeller());
      const res = await service.getSellerStatus("BARRA-01");
      expect(res).toMatchObject({ linked: true, status: "active", nickname: "BOSKO BAR", email: "bosko@example.com", displayName: "BOSKO BAR" });
      expect(res.linkedAt).toBe("2026-07-15T22:14:00.000Z");
    });
  });

  describe("refreshTokenIfNeeded", () => {
    it("NO refresca si el token vence en más del margen (5 días)", async () => {
      const result = await service.refreshTokenIfNeeded(makeSeller());
      expect(result).toBe("AT-old");
      expect(fetch).not.toHaveBeenCalled();
      expect(sellersRepo.update).not.toHaveBeenCalled();
    });

    it("refresca (form-urlencoded, sin redirect_uri) y persiste el nuevo refresh_token", async () => {
      mockFetchOnce({ ok: true, body: { access_token: "AT-new", refresh_token: "RT-new", expires_in: 15552000 } });

      const s = makeSeller({ expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) });
      const result = await service.refreshTokenIfNeeded(s);

      expect(result).toBe("AT-new");
      const call = vi.mocked(fetch).mock.calls[0];
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(headers.Authorization).toBeUndefined();
      const body = (call[1] as RequestInit).body as URLSearchParams;
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("RT-old");
      expect(body.get("redirect_uri")).toBeNull();

      expect(sellersRepo.update).toHaveBeenCalledWith(
        "seller-1",
        expect.objectContaining({ accessToken: "AT-new", refreshToken: "RT-new", status: "active" }),
      );
    });

    it("ante invalid_grant marca el seller como expired y lanza Conflict tageado", async () => {
      mockFetchOnce({ ok: false, status: 400, body: { error: "invalid_grant" } });
      const s = makeSeller({ expiresAt: new Date(Date.now() + 1000) });
      await expect(service.refreshTokenIfNeeded(s)).rejects.toMatchObject({ code: "MP_SELLER_DISCONNECTED" });
      expect(sellersRepo.update).toHaveBeenCalledWith("seller-1", { status: "expired" });
    });

    it("ante otro error lanza Conflict sin marcar expired", async () => {
      mockFetchOnce({ ok: false, status: 500, body: { error: "server_error" } });
      const s = makeSeller({ expiresAt: new Date(Date.now() + 1000) });
      await expect(service.refreshTokenIfNeeded(s)).rejects.toThrow(/no se pudo refrescar/i);
      expect(sellersRepo.update).not.toHaveBeenCalled();
    });

    it("con accessToken/expiresAt nulos (stub o wipe) fuerza el refresh", async () => {
      mockFetchOnce({ ok: true, body: { access_token: "AT-new", refresh_token: "RT-new", expires_in: 100 } });
      const s = makeSeller({ accessToken: null, expiresAt: null });
      await expect(service.refreshTokenIfNeeded(s)).resolves.toBe("AT-new");
    });
  });

  // ── PR 4 — buzón de traspaso Cloud→local y desvincular ──

  describe("pullSellerFromCloud", () => {
    const HANDOFF_KEY = "clave-del-buzon-para-tests-de-oauth-32-chars!!";
    const payload = {
      user_id: "seller-nuevo",
      access_token: "APP_USR-traspasado",
      refresh_token: "TG-traspasado",
      expires_at: "2027-01-19T00:00:00.000Z",
    };
    let savedHandoffKey: string | undefined;

    beforeEach(() => {
      savedHandoffKey = env.MP_HANDOFF_KEY;
      env.MP_HANDOFF_KEY = HANDOFF_KEY;
    });

    afterEach(() => {
      env.MP_HANDOFF_KEY = savedHandoffKey;
    });

    function makeHandoffRow(overrides: Record<string, unknown> = {}) {
      return {
        id: "handoff-1",
        user_id: payload.user_id,
        payload_enc: encryptSecret(JSON.stringify(payload), HANDOFF_KEY, MP_HANDOFF_INFO),
        key_version: 1,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        ...overrides,
      };
    }

    function makeService(cloud: ReturnType<typeof makeCloudDb>) {
      return new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud.db,
      );
    }

    it("sin cloudDb configurado → no-op con motivo", async () => {
      await expect(service.pullSellerFromCloud()).resolves.toMatchObject({
        pulled: false,
        reason: expect.stringContaining("Cloud"),
      });
    });

    it("descifra el handoff, persiste vía repo (re-cifrado local) y borra el buzón", async () => {
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: makeHandoffRow(), error: null }); // handoff
      cloud.state.results.push({
        data: { seller_nickname: "BOSKO", seller_first_name: "Manu", seller_last_name: null, seller_email: "b@x.com" },
        error: null,
      }); // metadata cloud
      cloud.state.results.push({ data: null, error: null }); // delete handoff

      const result = await makeService(cloud).pullSellerFromCloud();

      expect(result).toEqual({ pulled: true, userId: "seller-nuevo" });
      // El upsert recibe el token EN CLARO — el repo es quien cifra local.
      expect(sellersRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "seller-nuevo",
          accessToken: "APP_USR-traspasado",
          refreshToken: "TG-traspasado",
          status: "active",
          nickname: "BOSKO",
        }),
      );
      // El buzón queda vacío (D3): DELETE por id del handoff consumido.
      const del = cloud.state.ops.find((op) => op.method === "delete");
      expect(del?.table).toBe("mercadopago_seller_handoff");
      expect(del?.chain).toContainEqual(["eq", "id", "handoff-1"]);
      // Y la query del handoff filtró los vencidos.
      expect(cloud.state.ops[0].chain.some((c) => c[0] === "gt" && c[1] === "expires_at")).toBe(true);
    });

    it("handoff vencido (query vacía) → no-op sin tocar sellers", async () => {
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: null, error: null });

      const result = await makeService(cloud).pullSellerFromCloud();

      expect(result.pulled).toBe(false);
      expect(sellersRepo.upsert).not.toHaveBeenCalled();
    });

    it("reemplazo: expira al seller activo previo ANTES de upsertear el nuevo", async () => {
      sellersRepo.findActive.mockResolvedValue(makeSeller({ userId: "seller-viejo" }));
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: makeHandoffRow(), error: null });

      await makeService(cloud).pullSellerFromCloud();

      expect(sellersRepo.update).toHaveBeenCalledWith("seller-viejo", {
        accessToken: null,
        refreshToken: null,
        status: "expired",
      });
      const updateOrder = sellersRepo.update.mock.invocationCallOrder[0];
      const upsertOrder = sellersRepo.upsert.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(upsertOrder);
    });

    it("MP_HANDOFF_KEY desincronizada → error accionable, nunca silencioso", async () => {
      const cloud = makeCloudDb();
      cloud.state.results.push({
        data: makeHandoffRow({
          payload_enc: encryptSecret(JSON.stringify(payload), "otra-clave-en-la-edge-function-32-chars!!!", MP_HANDOFF_INFO),
        }),
        error: null,
      });

      await expect(makeService(cloud).pullSellerFromCloud()).rejects.toThrow(/MP_HANDOFF_KEY/);
      expect(sellersRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe("unlinkSeller", () => {
    function makeService(cloud: ReturnType<typeof makeCloudDb> | null) {
      return new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud?.db ?? null,
      );
    }

    it("wipe local + limpieza Cloud completa → cloudCleaned: true", async () => {
      sellersRepo.wipeAllTokens.mockResolvedValue(["seller-1"]);
      const cloud = makeCloudDb();
      // update sellers, delete handoffs, update bars — los tres OK.
      cloud.state.results.push({ data: null, error: null });
      cloud.state.results.push({ data: null, error: null });
      cloud.state.results.push({ data: null, error: null });

      const result = await makeService(cloud).unlinkSeller();

      expect(result).toEqual({ ok: true, cloudCleaned: true });
      expect(sellersRepo.wipeAllTokens).toHaveBeenCalledTimes(1);
      const sellersOp = cloud.state.ops.find((op) => op.table === "mercadopago_sellers");
      expect(sellersOp?.payload).toMatchObject({
        access_token: null,
        refresh_token: null,
        status: "expired",
      });
      expect(cloud.state.ops.find((op) => op.table === "mercadopago_seller_handoff")?.method).toBe("delete");
      expect(cloud.state.ops.find((op) => op.table === "bars")?.payload).toEqual({ seller_user_id: null });
    });

    it("tolera Cloud caído: local se limpia igual y cloudCleaned: false", async () => {
      sellersRepo.wipeAllTokens.mockResolvedValue(["seller-1"]);
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: null, error: { message: "fetch failed" } });

      const result = await makeService(cloud).unlinkSeller();

      expect(result).toEqual({ ok: true, cloudCleaned: false });
      expect(sellersRepo.wipeAllTokens).toHaveBeenCalledTimes(1);
    });

    it("sin Cloud configurado → cloudCleaned: false (no hay nada que limpiar remoto)", async () => {
      await expect(makeService(null).unlinkSeller()).resolves.toEqual({ ok: true, cloudCleaned: false });
    });
  });

  describe("getSellerStatus — pull lazy", () => {
    it("sin seller local intenta UN pull (throttled a 1/min) y re-lee", async () => {
      const cloud = makeCloudDb();
      const svc = new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud.db,
      );
      const pullSpy = vi.spyOn(svc, "pullSellerFromCloud").mockResolvedValue({ pulled: false });

      await svc.getSellerStatus("BARRA-01");
      await svc.getSellerStatus("BARRA-01");

      expect(pullSpy).toHaveBeenCalledTimes(1); // la segunda quedó throttled
    });

    it("con seller local NO consulta Cloud", async () => {
      sellersRepo.findActive.mockResolvedValue(makeSeller());
      const cloud = makeCloudDb();
      const svc = new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud.db,
      );
      const pullSpy = vi.spyOn(svc, "pullSellerFromCloud");

      const res = await svc.getSellerStatus("BARRA-01");

      expect(res.linked).toBe(true);
      expect(pullSpy).not.toHaveBeenCalled();
    });
  });
});
