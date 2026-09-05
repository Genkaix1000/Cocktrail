import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// listMpDevices toma el userId del token de env del preflight F1 (sin llamadas
// extra a /users/me); acá se lo controla por test.
const preflightState = vi.hoisted(() => ({ tokenUserId: undefined as string | undefined }));
vi.mock("./mp-fallback-preflight.js", () => ({
  getMpFallbackStatus: () => ({
    status: "unknown",
    checkedAt: null,
    ...(preflightState.tokenUserId ? { tokenUserId: preflightState.tokenUserId } : {}),
  }),
}));

import { MercadoPagoProvisioningService } from "./mercadopago-provisioning.service.js";
import { env } from "../../config/env.js";
import type { BarsRepository, Bar } from "./bars.repository.js";
import type { MercadoPagoCajasRepository, Caja } from "./mercadopago-cajas.repository.js";
import type {
  MercadoPagoCajasDevicesRepository,
  CajaDevice,
} from "./mercadopago-cajas-devices.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";

function makeSeller(overrides: Partial<Seller> = {}): Seller {
  return {
    userId: "seller-1",
    accessToken: "AT",
    refreshToken: "RT",
    expiresAt: new Date(Date.now() + 86400000),
    status: "active",
    nickname: "BOSKO BAR",
    firstName: null,
    lastName: null,
    email: "bosko@example.com",
    linkedAt: new Date("2026-07-15T22:14:00Z"),
    ...overrides,
  };
}

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    id: "bar-uuid-1",
    name: "Barra VIP",
    code: "BARRA-01",
    enabled: true,
    createdAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function makeCaja(overrides: Partial<Caja> = {}): Caja {
  return {
    id: "caja-1",
    barId: "bar-uuid-1",
    storeId: "1234567",
    externalPosId: "COCKTRAILBAR01",
    posIdMp: "2711382",
    qrImage: "https://mp.example/qr.png",
    qrTemplate: "https://mp.example/qr.pdf",
    sellerUserId: "seller-1",
    storeName: null,
    createdAt: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

function makeDevice(overrides: Partial<CajaDevice> = {}): CajaDevice {
  return {
    id: "dev-link-1",
    cajaId: "caja-1",
    deviceId: "PAX_A910__X",
    deviceUsername: "Caja 1",
    operatingMode: "PDV",
    operatingModeSyncedAt: "2026-07-22T00:00:00Z",
    isActive: true,
    linkedAt: "2026-07-22T00:00:00Z",
    deactivatedAt: null,
    ...overrides,
  };
}

function mockFetchOk(body: unknown) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchFail(status: number, body: unknown = { message: "fail" }) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    status,
    statusText: "Error",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe("MercadoPagoProvisioningService", () => {
  let sellersRepo: MercadoPagoSellersRepository;
  let barsRepo: BarsRepository;
  let cajasRepo: MercadoPagoCajasRepository;
  let devicesRepo: MercadoPagoCajasDevicesRepository;
  let credentialsResolver: CredentialsResolverService;
  let service: MercadoPagoProvisioningService;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());

    sellersRepo = {
      // El stub local del seller (FK de mercadopago_cajas) sale por acá — PR 4.
      upsert: vi.fn().mockImplementation(async (s) => makeSeller(s)),
      findByUserId: vi.fn().mockResolvedValue(makeSeller()),
      findActive: vi.fn().mockResolvedValue(makeSeller()),
      findGhost: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      wipeAllTokens: vi.fn().mockResolvedValue([]),
      wipeGhostTokens: vi.fn().mockResolvedValue([]),
      backfillEncryption: vi.fn().mockResolvedValue({ migrated: 0 }),
    };

    barsRepo = {
      findByCode: vi.fn().mockResolvedValue(makeBar()),
      findById: vi.fn().mockResolvedValue(makeBar()),
      listAll: vi.fn().mockResolvedValue([makeBar()]),
      findOrCreateByCode: vi.fn().mockResolvedValue(makeBar()),
      setEnabled: vi.fn(async (id, enabled) => makeBar({ id, enabled })),
    };

    cajasRepo = {
      findById: vi.fn().mockResolvedValue(makeCaja()),
      findByBarId: vi.fn().mockResolvedValue(null),
      findBySellerUserId: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (c) => makeCaja({ ...c, id: "caja-new" })),
      update: vi.fn().mockImplementation(async (id, p) => makeCaja({ id, ...p })),
      updateProvisioning: vi.fn().mockImplementation(async (id, p) => makeCaja({ id, ...p })),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };

    devicesRepo = {
      findById: vi.fn().mockResolvedValue(makeDevice()),
      findByDeviceId: vi.fn().mockResolvedValue(null),
      findActiveByCajaId: vi.fn().mockResolvedValue(null),
      listByCajaId: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (d) =>
        makeDevice({ ...d, id: "dev-new", cajaId: null, isActive: false, linkedAt: null }),
      ),
      update: vi.fn().mockImplementation(async (id, patch) => makeDevice({ id, ...patch })),
      assignCaja: vi.fn().mockImplementation(async (id, cajaId) =>
        makeDevice({ id, cajaId, isActive: false, linkedAt: "2026-07-24T00:00:00Z" }),
      ),
      activate: vi.fn().mockImplementation(async (id) =>
        makeDevice({ id, isActive: true, deactivatedAt: null }),
      ),
      deactivate: vi.fn().mockImplementation(async (id) =>
        makeDevice({ id, isActive: false, deactivatedAt: "2026-07-24T00:00:00Z" }),
      ),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };

    credentialsResolver = {
      resolve: vi.fn().mockResolvedValue("AT-resolved"),
    } as unknown as CredentialsResolverService;

    service = new MercadoPagoProvisioningService(
      credentialsResolver,
      sellersRepo,
      barsRepo,
      cajasRepo,
      devicesRepo,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getStoreStatus", () => {
    it("devuelve linked=false si no hay cajas", async () => {
      await expect(service.getStoreStatus()).resolves.toEqual({
        linked: false,
        storeId: null,
        name: null,
        storeName: null,
        sellerUserId: null,
      });
    });

    it("devuelve el nombre REAL de la sucursal en MP (muere el literal 'Bosko') + el storeName local", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja({ storeName: "Bosko Bar" })]);
      mockFetchOk({
        id: 1234567,
        name: "GARCIAMANUEL20231019090947",
        external_id: "COCKTRAILSUC001",
      });

      await expect(service.getStoreStatus()).resolves.toEqual({
        linked: true,
        storeId: "1234567",
        name: "GARCIAMANUEL20231019090947",
        storeName: "Bosko Bar",
        sellerUserId: "seller-1",
      });
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/stores/1234567");
    });

    it("si MP no responde, name queda NULL honesto (nunca un literal) y storeName local sobrevive", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja({ storeName: "Bosko Bar" })]);
      vi.mocked(credentialsResolver.resolve).mockRejectedValue(new Error("sin credenciales"));

      await expect(service.getStoreStatus()).resolves.toEqual({
        linked: true,
        storeId: "1234567",
        name: null,
        storeName: "Bosko Bar",
        sellerUserId: "seller-1",
      });
    });
  });

  describe("createStore", () => {
    it("reusa store_id existente sin llamar a MP", async () => {
      vi.mocked(cajasRepo.findBySellerUserId).mockResolvedValue([makeCaja()]);
      const result = await service.createStore({ name: "Bosko Bar" });
      expect(result.storeId).toBe("1234567");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("crea la sucursal en MP cuando no hay store", async () => {
      mockFetchOk({ results: [] }); // search: no existe en MP
      mockFetchOk({ id: 999, name: "Bosko Bar" });
      const result = await service.createStore({ name: "Bosko Bar" });
      expect(result.storeId).toBe("999");
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/users/seller-1/stores"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("reusa el store de MP si ya existe (external_id duplicado)", async () => {
      mockFetchOk({ results: [{ id: 555, name: "Bosko Bar", external_id: "COCKTRAILSUC001" }] });
      const result = await service.createStore({ name: "Bosko Bar" });
      expect(result.storeId).toBe("555");
      // Solo debe llamar al search, nunca al POST de creación.
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ method: "GET" });
    });

    it("lanza Conflict si no hay seller vinculado", async () => {
      vi.mocked(sellersRepo.findActive).mockResolvedValue(null);
      await expect(service.createStore({ name: "X" })).rejects.toBeInstanceOf(Conflict);
    });
  });

  describe("createPos", () => {
    it("crea POS en MP y persiste la caja con QR", async () => {
      vi.mocked(cajasRepo.findBySellerUserId).mockResolvedValue([makeCaja({ id: "other" })]);
      mockFetchOk({
        id: 2711382,
        qr: { image: "https://qr.png", template_document: "https://qr.pdf" },
      });

      const caja = await service.createPos({ barId: "BARRA-01", name: "Barra VIP" });

      expect(barsRepo.findOrCreateByCode).toHaveBeenCalledWith("BARRA-01", "Barra VIP");
      expect(cajasRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          barId: "bar-uuid-1",
          storeId: "1234567",
          externalPosId: "COCKTRAILBAR01",
          posIdMp: "2711382",
          qrImage: "https://qr.png",
          qrTemplate: "https://qr.pdf",
          sellerUserId: "seller-1",
        }),
      );
      expect(caja.device).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/pos"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("garantiza la fila local del seller vía sellersRepo.upsert (sin tokens)", async () => {
      vi.mocked(cajasRepo.findBySellerUserId).mockResolvedValue([makeCaja({ id: "other" })]);
      mockFetchOk({ id: 2711382, qr: { image: "https://qr.png", template_document: null } });

      await service.createPos({ barId: "BARRA-01", name: "Barra VIP" });

      expect(sellersRepo.upsert).toHaveBeenCalledWith({
        userId: "seller-1",
        status: "active",
      });
    });

    it("crea store on-the-fly si el seller no tiene ninguna caja", async () => {
      // search store + createStore MP + createPos MP
      mockFetchOk({ results: [] });
      mockFetchOk({ id: 111, name: "BOSKO BAR" });
      mockFetchOk({
        id: 222,
        qr: { image: "https://q.png", template_document: null },
      });

      await service.createPos({ barId: "BARRA-01", name: "Barra VIP" });

      expect(fetch).toHaveBeenCalledTimes(3);  // solo MP calls (el stub del seller va por sellersRepo)
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/stores/search");
      expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/stores");
      expect(vi.mocked(fetch).mock.calls[2][0]).toContain("/pos");
    });

    it("lanza Conflict si la barra ya tiene PDV", async () => {
      vi.mocked(cajasRepo.findByBarId).mockResolvedValue(makeCaja());
      await expect(service.createPos({ barId: "BARRA-01", name: "X" })).rejects.toBeInstanceOf(
        Conflict,
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("lanza BadRequest sin name", async () => {
      await expect(service.createPos({ barId: "BARRA-01", name: "" })).rejects.toBeInstanceOf(
        BadRequest,
      );
    });
  });

  describe("deletePos", () => {
    it("borra la caja cuando no tiene Posnets vinculados", async () => {
      await expect(service.deletePos("caja-1")).resolves.toEqual({ ok: true });
      expect(devicesRepo.listByCajaId).toHaveBeenCalledWith("caja-1");
      expect(cajasRepo.deleteById).toHaveBeenCalledWith("caja-1");
    });

    it("lanza Conflict si la caja tiene Posnets (el vínculo histórico no se rompe)", async () => {
      vi.mocked(devicesRepo.listByCajaId).mockResolvedValue([makeDevice({ isActive: false })]);
      await expect(service.deletePos("caja-1")).rejects.toBeInstanceOf(Conflict);
      expect(cajasRepo.deleteById).not.toHaveBeenCalled();
    });

    it("mapea la FK 23503 a Conflict (carrera entre chequeo y DELETE)", async () => {
      vi.mocked(cajasRepo.deleteById).mockRejectedValue({ code: "23503" });
      await expect(service.deletePos("caja-1")).rejects.toBeInstanceOf(Conflict);
    });

    it("lanza NotFound si no existe", async () => {
      vi.mocked(cajasRepo.findById).mockResolvedValue(null);
      await expect(service.deletePos("missing")).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("registerOrLinkDevice", () => {
    it("registra un Posnet sin caja con el modo REAL que devolvió MP", async () => {
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "STANDALONE" }] });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);

      const device = await service.registerOrLinkDevice({
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
      });

      expect(devicesRepo.create).toHaveBeenCalledWith({
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
        operatingMode: "STANDALONE",
        operatingModeSyncedAt: expect.any(String),
      });
      expect(device.cajaId).toBeNull();
      expect(device.isActive).toBe(false);
    });

    it("guarda NULL honesto si MP no informa un modo conocido (R25: nada de ?? 'PDV')", async () => {
      mockFetchOk({ devices: [{ id: "PAX_A910__X" }] });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);

      await service.registerOrLinkDevice({ deviceId: "PAX_A910__X" });

      expect(devicesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ operatingMode: null }),
      );
    });
  });

  describe("linkDevice / assignDevice", () => {
    it("verifica el device en MP, lo registra, lo asigna a la caja y lo activa", async () => {
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "PDV", status: { state: "ACTIVE" } }] });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);

      const device = await service.linkDevice({
        cajaId: "caja-1",
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/point/integration-api/devices?offset=0&limit=50"),
        expect.objectContaining({ method: "GET" }),
      );
      expect(devicesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: "PAX_A910__X", operatingMode: "PDV" }),
      );
      expect(devicesRepo.assignCaja).toHaveBeenCalledWith("dev-new", "caja-1");
      expect(devicesRepo.activate).toHaveBeenCalledWith("dev-new");
      expect(devicesRepo.update).toHaveBeenCalledWith("dev-new", { deviceUsername: "Caja 1" });
      expect(device.deviceUsername).toBe("Caja 1");
    });

    it("reemplaza el activo: deactivate(viejo) → activate(nuevo), sin tocar caja_id del viejo", async () => {
      const previous = makeDevice({ id: "old", deviceId: "PAX_OLD" });
      const registered = makeDevice({ id: "new", cajaId: null, isActive: false, deviceId: "PAX_NEW" });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(registered);
      vi.mocked(devicesRepo.findActiveByCajaId).mockResolvedValue(previous);

      await service.assignDevice({ cajaId: "caja-1", deviceId: "PAX_NEW" });

      expect(devicesRepo.deactivate).toHaveBeenCalledWith("old");
      expect(devicesRepo.assignCaja).toHaveBeenCalledWith("new", "caja-1");
      expect(devicesRepo.activate).toHaveBeenCalledWith("new");
      expect(devicesRepo.update).not.toHaveBeenCalled();
    });

    it("reactiva un histórico de la MISMA caja sin re-asignar caja_id (swap)", async () => {
      const historic = makeDevice({ id: "hist", cajaId: "caja-1", isActive: false, deviceId: "PAX_HIST" });
      const active = makeDevice({ id: "act", cajaId: "caja-1", deviceId: "PAX_ACT" });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(historic);
      vi.mocked(devicesRepo.findActiveByCajaId).mockResolvedValue(active);

      await service.assignDevice({ cajaId: "caja-1", deviceId: "PAX_HIST" });

      expect(devicesRepo.deactivate).toHaveBeenCalledWith("act");
      expect(devicesRepo.assignCaja).not.toHaveBeenCalled();
      expect(devicesRepo.activate).toHaveBeenCalledWith("hist");
    });

    it("no-op si el device ya es el activo de la caja", async () => {
      const active = makeDevice({ id: "act", cajaId: "caja-1", deviceId: "PAX_ACT" });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(active);
      vi.mocked(devicesRepo.findActiveByCajaId).mockResolvedValue(active);

      const result = await service.assignDevice({ cajaId: "caja-1", deviceId: "PAX_ACT" });

      expect(result?.id).toBe("act");
      expect(devicesRepo.deactivate).not.toHaveBeenCalled();
      expect(devicesRepo.activate).not.toHaveBeenCalled();
    });

    it("lanza Conflict ANTES del trigger si el device pertenece a OTRA caja", async () => {
      const ajeno = makeDevice({
        id: "ajeno",
        cajaId: "caja-2",
        isActive: false,
        deviceId: "PAX_AJENO",
        caja: makeCaja({ id: "caja-2", externalPosId: "COCKTRAILBAR02" }),
      });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(ajeno);

      await expect(
        service.assignDevice({ cajaId: "caja-1", deviceId: "PAX_AJENO" }),
      ).rejects.toMatchObject({
        message: expect.stringContaining("pertenece históricamente a la caja COCKTRAILBAR02"),
      });
      expect(devicesRepo.deactivate).not.toHaveBeenCalled();
      expect(devicesRepo.assignCaja).not.toHaveBeenCalled();
      expect(devicesRepo.activate).not.toHaveBeenCalled();
    });

    it("desvincula con deviceId null → deactivate del activo (queda histórico)", async () => {
      vi.mocked(devicesRepo.findActiveByCajaId).mockResolvedValue(makeDevice({ id: "act" }));
      await expect(service.assignDevice({ cajaId: "caja-1", deviceId: null })).resolves.toBeNull();
      expect(devicesRepo.deactivate).toHaveBeenCalledWith("act");
    });

    it("deviceId null sin activo: no-op silencioso", async () => {
      await expect(service.assignDevice({ cajaId: "caja-1", deviceId: null })).resolves.toBeNull();
      expect(devicesRepo.deactivate).not.toHaveBeenCalled();
    });

    it("lanza NotFound si el device no esta en la lista de MP", async () => {
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);
      mockFetchOk({ devices: [{ id: "OTRO_DEVICE" }] });
      await expect(
        service.linkDevice({ cajaId: "caja-1", deviceId: "MISSING" }),
      ).rejects.toBeInstanceOf(NotFound);
    });

    it("propaga Conflict si la API de MP falla", async () => {
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);
      mockFetchFail(500, { message: "MP down" });
      await expect(
        service.linkDevice({ cajaId: "caja-1", deviceId: "MISSING" }),
      ).rejects.toBeInstanceOf(Conflict);
    });
  });

  describe("unlinkDevice", () => {
    it("elimina el vinculo", async () => {
      await expect(service.unlinkDevice("dev-link-1")).resolves.toEqual({ ok: true });
      expect(devicesRepo.deleteById).toHaveBeenCalledWith("dev-link-1");
    });

    it("mapea el 23503 del trigger (device con cobros) a Conflict", async () => {
      vi.mocked(devicesRepo.deleteById).mockRejectedValue({ code: "23503" });
      await expect(service.unlinkDevice("dev-link-1")).rejects.toBeInstanceOf(Conflict);
    });

    it("lanza NotFound si no existe", async () => {
      vi.mocked(devicesRepo.findById).mockResolvedValue(null);
      await expect(service.unlinkDevice("x")).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("listCajas", () => {
    it("mergea SOLO el device activo de cada caja (los históricos no aparecen)", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
      vi.mocked(devicesRepo.listAll).mockResolvedValue([
        makeDevice({ id: "hist", deviceId: "PAX_HIST", isActive: false, deactivatedAt: "2026-07-23T00:00:00Z" }),
        makeDevice({ id: "act", deviceId: "PAX_ACT" }),
      ]);
      const rows = await service.listCajas();
      expect(rows[0].device?.deviceId).toBe("PAX_ACT");
    });

    it("device null si la caja solo tiene históricos", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
      vi.mocked(devicesRepo.listAll).mockResolvedValue([
        makeDevice({ isActive: false, deactivatedAt: "2026-07-23T00:00:00Z" }),
      ]);
      const rows = await service.listCajas();
      expect(rows[0].device).toBeNull();
    });

    describe("isOrphan (R22 derivado, sin columna)", () => {
      it("false si la caja está provisionada en la cuenta del seller activo", async () => {
        vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja({ sellerUserId: "seller-1" })]);
        const rows = await service.listCajas();
        expect(rows[0].isOrphan).toBe(false);
      });

      it("true si la caja quedó en OTRA cuenta que la del seller activo", async () => {
        vi.mocked(cajasRepo.listAll).mockResolvedValue([
          makeCaja({ sellerUserId: "seller-1" }),
          makeCaja({ id: "caja-vieja", sellerUserId: "cuenta-saliente" }),
        ]);
        const rows = await service.listCajas();
        expect(rows.map((r) => r.isOrphan)).toEqual([false, true]);
      });

      it("sin seller activo → false (no hay cuenta contra la cual estar huérfana)", async () => {
        vi.mocked(sellersRepo.findActive).mockResolvedValue(null);
        vi.mocked(cajasRepo.listAll).mockResolvedValue([
          makeCaja({ sellerUserId: "cuenta-saliente" }),
        ]);
        const rows = await service.listCajas();
        expect(rows[0].isOrphan).toBe(false);
      });

      it("si findActive lanza (invariante single-seller roto), el listado NO se cae: false", async () => {
        vi.mocked(sellersRepo.findActive).mockRejectedValue(
          new Error("Invariante single-seller roto"),
        );
        vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
        const rows = await service.listCajas();
        expect(rows[0].isOrphan).toBe(false);
      });
    });
  });

  describe("reprovisionCaja (bloque H — R22, migrar la caja a la cuenta del seller activo)", () => {
    const HUERFANA = makeCaja({
      sellerUserId: "cuenta-saliente",
      storeId: "old-store",
      posIdMp: "old-pos",
    });

    beforeEach(() => {
      vi.mocked(cajasRepo.findById).mockResolvedValue(HUERFANA);
    });

    it("re-provisiona en la cuenta del seller activo con UPDATE de la fila EXISTENTE (mismo UUID, nunca delete+insert)", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([makeDevice()]); // vínculo histórico activo
      mockFetchOk({ results: [] }); // createStore: search sin match en la cuenta nueva
      mockFetchOk({ id: 999, name: "BOSKO BAR" }); // createStore: POST /users/{id}/stores
      mockFetchOk({
        id: 777,
        qr: { image: "https://new-qr.png", template_document: "https://new-qr.pdf" },
      }); // POST /pos

      const result = await service.reprovisionCaja("caja-1");

      // Misma fila, mismo UUID: los vínculos históricos de devices sobreviven.
      expect(cajasRepo.updateProvisioning).toHaveBeenCalledWith("caja-1", {
        storeId: "999",
        posIdMp: "777",
        qrImage: "https://new-qr.png",
        qrTemplate: "https://new-qr.pdf",
        sellerUserId: "seller-1",
      });
      expect(cajasRepo.create).not.toHaveBeenCalled();
      expect(cajasRepo.deleteById).not.toHaveBeenCalled();
      expect(result.id).toBe("caja-1");
      expect(result.sellerUserId).toBe("seller-1");
      expect(result.isOrphan).toBe(false);
      // El device vinculado sigue mergeado en la respuesta.
      expect(result.device?.deviceId).toBe("PAX_A910__X");
      // El POS se re-crea con el MISMO external_id (idempotencia con MP).
      const posCall = vi.mocked(fetch).mock.calls[2];
      expect(posCall[0]).toContain("/pos");
      expect(JSON.parse(String((posCall[1] as RequestInit).body))).toMatchObject({
        external_id: "COCKTRAILBAR01",
        store_id: 999,
      });
    });

    it("reintento (point_of_sale_exists): recupera por external_id IGNORANDO el pos_id_mp local de la cuenta saliente", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([HUERFANA]); // lo que ve recoverExistingPos
      mockFetchOk({ results: [{ id: 555, name: "BOSKO", external_id: "COCKTRAILSUC001" }] }); // store ya en MP
      mockFetchFail(409, { message: "POS exists", error: "point_of_sale_exists" }); // POST /pos
      mockFetchOk({ results: [{ id: 888, external_id: "COCKTRAILBAR01" }] }); // GET /pos (listado)
      mockFetchOk({ id: 888, qr: { image: "https://qr-nueva-cuenta.png", template_document: null } }); // GET /pos/888

      const result = await service.reprovisionCaja("caja-1");

      // Nunca consulta GET /pos/old-pos (pertenece a la cuenta saliente).
      const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/pos/old-pos"))).toBe(false);
      expect(cajasRepo.updateProvisioning).toHaveBeenCalledWith("caja-1", {
        storeId: "555",
        posIdMp: "888",
        qrImage: "https://qr-nueva-cuenta.png",
        qrTemplate: null,
        sellerUserId: "seller-1",
      });
      expect(result.qrImage).toBe("https://qr-nueva-cuenta.png");
    });

    it("garantiza la fila local del seller (FK) antes del UPDATE, como createPos", async () => {
      mockFetchOk({ results: [{ id: 555, external_id: "COCKTRAILSUC001" }] });
      mockFetchOk({ id: 777, qr: { image: "https://q.png", template_document: null } });

      await service.reprovisionCaja("caja-1");

      expect(sellersRepo.upsert).toHaveBeenCalledWith({ userId: "seller-1", status: "active" });
    });

    it("lanza NotFound si la caja no existe", async () => {
      vi.mocked(cajasRepo.findById).mockResolvedValue(null);
      await expect(service.reprovisionCaja("missing")).rejects.toBeInstanceOf(NotFound);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sin seller activo → el Conflict accionable de requireActiveSeller, sin tocar MP", async () => {
      vi.mocked(sellersRepo.findActive).mockResolvedValue(null);
      const promise = service.reprovisionCaja("caja-1");
      await expect(promise).rejects.toBeInstanceOf(Conflict);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining("Vinculala desde /admin"),
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(cajasRepo.updateProvisioning).not.toHaveBeenCalled();
    });
  });

  describe("listMpDevices (bloque B — lista cruda)", () => {
    it("expone TODOS los devices de MP (no filtra), con model derivado, storeId/posId y registeredLocally", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([makeDevice()]); // PAX_A910__X registrado
      mockFetchOk({
        devices: [
          { id: "PAX_A910__X", operating_mode: "PDV", store_id: 85068168, pos_id: 135641665 },
          { id: "NEWLAND_N950__N950NCC123", operating_mode: "STANDALONE" },
          { id: "SINSEPARADOR" },
        ],
      });

      const listing = await service.listMpDevices();

      expect(listing.devices).toEqual([
        {
          id: "PAX_A910__X",
          model: "PAX_A910",
          operatingMode: "PDV",
          storeId: "85068168",
          posId: "135641665",
          registeredLocally: true,
        },
        {
          id: "NEWLAND_N950__N950NCC123",
          model: "NEWLAND_N950",
          operatingMode: "STANDALONE",
          storeId: null,
          posId: null,
          registeredLocally: false,
        },
        // Sin separador "__": el model es el id entero (mejor que inventar).
        {
          id: "SINSEPARADOR",
          model: "SINSEPARADOR",
          operatingMode: null,
          storeId: null,
          posId: null,
          registeredLocally: false,
        },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/point/integration-api/devices?offset=0&limit=50"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("re-sincroniza operating_mode + synced_at del device registrado cuando el modo real cambió", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([makeDevice({ operatingMode: "PDV" })]);
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "STANDALONE" }] });

      await service.listMpDevices();

      expect(devicesRepo.update).toHaveBeenCalledWith("dev-link-1", {
        operatingMode: "STANDALONE",
        operatingModeSyncedAt: expect.any(String),
      });
    });

    it("NO escribe si el modo no cambió y ya hay synced_at (cero UPDATEs de más)", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([
        makeDevice({ operatingMode: "PDV", operatingModeSyncedAt: "2026-07-22T00:00:00Z" }),
      ]);
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "PDV" }] });

      await service.listMpDevices();

      expect(devicesRepo.update).not.toHaveBeenCalled();
    });

    it("escribe si synced_at es null aunque el modo coincida (primera sincronización declarada)", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([
        makeDevice({ operatingMode: "PDV", operatingModeSyncedAt: null }),
      ]);
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "PDV" }] });

      await service.listMpDevices();

      expect(devicesRepo.update).toHaveBeenCalledWith("dev-link-1", {
        operatingMode: "PDV",
        operatingModeSyncedAt: expect.any(String),
      });
    });

    it("no toca devices que no están registrados localmente", async () => {
      vi.mocked(devicesRepo.listAll).mockResolvedValue([]);
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "STANDALONE" }] });

      await service.listMpDevices();

      expect(devicesRepo.update).not.toHaveBeenCalled();
    });

    it("contexto para la pantalla guía: token del seller activo", async () => {
      mockFetchOk({ devices: [] });

      const listing = await service.listMpDevices();

      expect(listing.token).toEqual({ source: "seller", userId: "seller-1" });
      expect(listing.sellerUserId).toBe("seller-1");
      expect(credentialsResolver.resolve).toHaveBeenCalledWith({ allowGlobalFallback: true });
    });

    it("contexto: sin seller vinculado el token es de la env, con el userId del preflight F1", async () => {
      const originalEnvToken = env.MP_ACCESS_TOKEN;
      env.MP_ACCESS_TOKEN = "ENV-TOKEN";
      preflightState.tokenUserId = "1517393956";
      vi.mocked(sellersRepo.findActive).mockResolvedValue(null);
      vi.mocked(credentialsResolver.resolve).mockResolvedValue("ENV-TOKEN");
      try {
        mockFetchOk({ devices: [] });

        const listing = await service.listMpDevices();

        expect(listing.token).toEqual({ source: "env", userId: "1517393956" });
        expect(listing.sellerUserId).toBeNull();
      } finally {
        env.MP_ACCESS_TOKEN = originalEnvToken;
        preflightState.tokenUserId = undefined;
      }
    });

    it("propaga Conflict si el listado de MP falla (la pantalla guía necesita el error, no un [])", async () => {
      mockFetchFail(500, { message: "MP down" });
      await expect(service.listMpDevices()).rejects.toBeInstanceOf(Conflict);
    });

    it("sin NINGUNA credencial (ni seller ni env) → Conflict accionable, no un 500", async () => {
      vi.mocked(sellersRepo.findActive).mockResolvedValue(null);
      vi.mocked(credentialsResolver.resolve).mockRejectedValue(
        new Error("No hay ninguna cuenta de Mercado Pago vinculada. Vinculala desde /admin?tab=pagos."),
      );

      const promise = service.listMpDevices();
      await expect(promise).rejects.toBeInstanceOf(Conflict);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining("Vinculala desde /admin"),
        code: "MP_NOT_LINKED",
      });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("setDeviceOperatingMode (bloque C — PDV sin curl)", () => {
    it("PATCHea el modo contra MP y persiste el modo CONFIRMADO en el device registrado", async () => {
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(makeDevice());
      mockFetchOk({ id: "PAX_A910__X", operating_mode: "PDV" });

      const result = await service.setDeviceOperatingMode("PAX_A910__X", "PDV");

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/point/integration-api/devices/PAX_A910__X"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ operating_mode: "PDV" }),
        }),
      );
      expect(devicesRepo.update).toHaveBeenCalledWith("dev-link-1", {
        operatingMode: "PDV",
        operatingModeSyncedAt: expect.any(String),
      });
      expect(result).toEqual({
        deviceId: "PAX_A910__X",
        operatingMode: "PDV",
        registeredLocally: true,
      });
    });

    it("device no registrado: cambia el modo igual pero no persiste nada", async () => {
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);
      mockFetchOk({ id: "PAX_NUEVO__1", operating_mode: "STANDALONE" });

      const result = await service.setDeviceOperatingMode("PAX_NUEVO__1", "STANDALONE");

      expect(devicesRepo.update).not.toHaveBeenCalled();
      expect(result.registeredLocally).toBe(false);
      expect(result.operatingMode).toBe("STANDALONE");
    });

    it("si MP no devuelve el modo en la respuesta, persiste el modo pedido", async () => {
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(makeDevice());
      mockFetchOk({ id: "PAX_A910__X" });

      const result = await service.setDeviceOperatingMode("PAX_A910__X", "PDV");

      expect(result.operatingMode).toBe("PDV");
      expect(devicesRepo.update).toHaveBeenCalledWith(
        "dev-link-1",
        expect.objectContaining({ operatingMode: "PDV" }),
      );
    });

    it("404 de MP → Conflict accionable (lector de otra cuenta / sin reclamar), nunca un 500", async () => {
      mockFetchFail(404, { message: "device not found" });

      const promise = service.setDeviceOperatingMode("PAX_AJENO__1", "PDV");
      await expect(promise).rejects.toBeInstanceOf(Conflict);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining("otra cuenta"),
      });
      expect(devicesRepo.update).not.toHaveBeenCalled();
    });

    it("403 de MP → Conflict con la cuenta y el código de MP en el mensaje", async () => {
      mockFetchFail(403, { message: "forbidden" });

      const promise = service.setDeviceOperatingMode("PAX_A910__X", "PDV");
      await expect(promise).rejects.toBeInstanceOf(Conflict);
      await expect(promise).rejects.toMatchObject({
        message: expect.stringContaining("seller-1"),
      });
    });

    it("valida el modo y el deviceId antes de tocar MP", async () => {
      await expect(
        service.setDeviceOperatingMode("PAX_A910__X", "OTRO" as "PDV"),
      ).rejects.toBeInstanceOf(BadRequest);
      await expect(service.setDeviceOperatingMode("  ", "PDV")).rejects.toBeInstanceOf(BadRequest);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("renameStore (bloque E — rama A con degradación automática)", () => {
    const PREV_STORE = {
      id: 1234567,
      name: "GARCIAMANUEL20231019090947",
      external_id: "COCKTRAILSUC001",
      location: { street_name: "Ramon Castillo", street_number: "739" },
    };

    beforeEach(() => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
    });

    it("rama A: PUT aceptado y verificado con re-fetch → renamedInMp true + cache en store_name", async () => {
      mockFetchOk(PREV_STORE); // GET previo
      mockFetchOk({ id: 1234567, name: "Bosko Bar" }); // PUT
      mockFetchOk({ ...PREV_STORE, name: "Bosko Bar" }); // re-fetch: name quedó, nada vaciado

      const result = await service.renameStore("Bosko Bar");

      expect(result).toEqual({ renamedInMp: true, name: "Bosko Bar" });
      expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/users/seller-1/stores/1234567");
      expect(vi.mocked(fetch).mock.calls[1][1]).toMatchObject({
        method: "PUT",
        body: JSON.stringify({ name: "Bosko Bar" }),
      });
      expect(cajasRepo.updateProvisioning).toHaveBeenCalledWith("caja-1", {
        storeName: "Bosko Bar",
      });
    });

    it("rama degradada: MP rechaza el PUT → alias local + el nombre real de MP visible", async () => {
      mockFetchOk(PREV_STORE); // GET previo
      mockFetchFail(405, { message: "method not allowed" }); // PUT rechazado

      const result = await service.renameStore("Bosko Bar");

      expect(result).toEqual({
        renamedInMp: false,
        name: "Bosko Bar",
        mpName: "GARCIAMANUEL20231019090947",
      });
      // La pantalla no miente: el alias queda igual guardado.
      expect(cajasRepo.updateProvisioning).toHaveBeenCalledWith("caja-1", {
        storeName: "Bosko Bar",
      });
    });

    it("MP acepta el PUT pero IGNORA el name → rechazo: alias local + nombre real", async () => {
      mockFetchOk(PREV_STORE);
      mockFetchOk({ id: 1234567 }); // PUT 200
      mockFetchOk(PREV_STORE); // re-fetch: el name sigue siendo el viejo

      const result = await service.renameStore("Bosko Bar");

      expect(result).toEqual({
        renamedInMp: false,
        name: "Bosko Bar",
        mpName: "GARCIAMANUEL20231019090947",
      });
    });

    it("PUT-replace destructivo detectado: restaura el objeto previo y degrada a alias", async () => {
      mockFetchOk(PREV_STORE); // GET previo
      mockFetchOk({ id: 1234567, name: "Bosko Bar" }); // PUT 200
      mockFetchOk({ id: 1234567, name: "Bosko Bar" }); // re-fetch: external_id y location VACIADOS
      mockFetchOk({ id: 1234567 }); // PUT de restauración

      const result = await service.renameStore("Bosko Bar");

      expect(result).toEqual({
        renamedInMp: false,
        name: "Bosko Bar",
        mpName: "GARCIAMANUEL20231019090947",
      });
      // El 4º fetch es la restauración con el objeto previo COMPLETO.
      const restoreCall = vi.mocked(fetch).mock.calls[3];
      expect(restoreCall[0]).toContain("/users/seller-1/stores/1234567");
      expect(restoreCall[1]).toMatchObject({ method: "PUT" });
      expect(JSON.parse(String((restoreCall[1] as RequestInit).body))).toEqual({
        name: "GARCIAMANUEL20231019090947",
        external_id: "COCKTRAILSUC001",
        location: { street_name: "Ramon Castillo", street_number: "739" },
      });
    });

    it("sin sucursal provisionada → Conflict accionable", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([]);
      await expect(service.renameStore("Bosko Bar")).rejects.toBeInstanceOf(Conflict);
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["", "   ", "a".repeat(61)])("name inválido (%j) → BadRequest", async (bad) => {
      await expect(service.renameStore(bad)).rejects.toBeInstanceOf(BadRequest);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
