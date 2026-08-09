import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MercadoPagoOAuthService, type MpOAuthConfig } from "./mercadopago-oauth.service.js";
import type { OAuthStatesRepository } from "./oauth-states.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
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

    it("persiste el state con code_verifier, bar_id, redirect_url y TTL ~10 min", async () => {
      const before = Date.now();
      await service.generateAuthUrl("BARRA-01", "http://localhost:3000");
      const arg = statesRepo.insert.mock.calls[0][0];
      expect(arg.barId).toBe("BARRA-01");
      expect(arg.redirectUrl).toBe("http://localhost:3000");
      const ttl = arg.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(9 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    });

    it("rechaza redirect host externo (anti open-redirect) y cae a FRONTEND_URL", async () => {
      await service.generateAuthUrl("BARRA-01", "https://evil.example/phish");
      expect(statesRepo.insert.mock.calls[0][0].redirectUrl).toBe(
        new URL(env.FRONTEND_URL).origin,
      );
    });

    it("acepta localhost aunque FRONTEND_URL sea otro origen", async () => {
      await service.generateAuthUrl("BARRA-01", "http://localhost:3000");
      expect(statesRepo.insert.mock.calls[0][0].redirectUrl).toBe("http://localhost:3000");
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

  // ── F0 — handoff deprecated; unlink limpia residuales ──

  describe("pullSellerFromCloud", () => {
    it("F0 deprecated → siempre no-op, no toca sellers ni Cloud", async () => {
      const cloud = makeCloudDb();
      const svc = new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud.db,
      );
      await expect(svc.pullSellerFromCloud()).resolves.toMatchObject({
        pulled: false,
        reason: expect.stringContaining("Deprecated"),
      });
      expect(sellersRepo.upsert).not.toHaveBeenCalled();
      expect(cloud.state.ops).toHaveLength(0);
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

    it("wipe + limpieza handoffs/bars → cloudCleaned: true", async () => {
      sellersRepo.wipeAllTokens.mockResolvedValue(["seller-1"]);
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: null, error: null }); // delete handoffs
      cloud.state.results.push({ data: null, error: null }); // update bars

      const result = await makeService(cloud).unlinkSeller();

      expect(result).toEqual({ ok: true, cloudCleaned: true });
      expect(sellersRepo.wipeAllTokens).toHaveBeenCalledTimes(1);
      expect(cloud.state.ops.find((op) => op.table === "mercadopago_seller_handoff")?.method).toBe("delete");
      expect(cloud.state.ops.find((op) => op.table === "bars")?.payload).toEqual({ seller_user_id: null });
    });

    it("tolera fallo residual: wipe local igual y cloudCleaned: false", async () => {
      sellersRepo.wipeAllTokens.mockResolvedValue(["seller-1"]);
      const cloud = makeCloudDb();
      cloud.state.results.push({ data: null, error: { message: "fetch failed" } });

      const result = await makeService(cloud).unlinkSeller();

      expect(result).toEqual({ ok: true, cloudCleaned: false });
      expect(sellersRepo.wipeAllTokens).toHaveBeenCalledTimes(1);
    });

    it("sin Cloud configurado → cloudCleaned: false", async () => {
      await expect(makeService(null).unlinkSeller()).resolves.toEqual({ ok: true, cloudCleaned: false });
    });
  });

  describe("getSellerStatus", () => {
    it("sin seller → linked false; no intenta pull (F0)", async () => {
      const cloud = makeCloudDb();
      const svc = new MercadoPagoOAuthService(
        statesRepo as unknown as OAuthStatesRepository,
        sellersRepo as unknown as MercadoPagoSellersRepository,
        CONFIG,
        cloud.db,
      );
      const pullSpy = vi.spyOn(svc, "pullSellerFromCloud");

      const res = await svc.getSellerStatus("BARRA-01");

      expect(res.linked).toBe(false);
      expect(pullSpy).not.toHaveBeenCalled();
      expect(cloud.state.ops).toHaveLength(0);
    });

    it("con seller activo → linked true", async () => {
      sellersRepo.findActive.mockResolvedValue(makeSeller());
      const res = await service.getSellerStatus("BARRA-01");
      expect(res.linked).toBe(true);
      expect(res.nickname).toBe("BOSKO BAR");
    });
  });
});
