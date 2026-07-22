import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoProvisioningService } from "./mercadopago-provisioning.service.js";
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
      update: vi.fn(),
      wipeAllTokens: vi.fn().mockResolvedValue([]),
      backfillEncryption: vi.fn().mockResolvedValue({ migrated: 0 }),
    };

    barsRepo = {
      findByCode: vi.fn().mockResolvedValue(makeBar()),
      findById: vi.fn().mockResolvedValue(makeBar()),
      listAll: vi.fn().mockResolvedValue([makeBar()]),
      findOrCreateByCode: vi.fn().mockResolvedValue(makeBar()),
    };

    cajasRepo = {
      findById: vi.fn().mockResolvedValue(makeCaja()),
      findByBarId: vi.fn().mockResolvedValue(null),
      findBySellerUserId: vi.fn().mockResolvedValue([]),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (c) => makeCaja({ ...c, id: "caja-new" })),
      update: vi.fn().mockImplementation(async (id, p) => makeCaja({ id, ...p })),
      deleteById: vi.fn().mockResolvedValue(undefined),
    };

    devicesRepo = {
      findById: vi.fn().mockResolvedValue(makeDevice()),
      findByDeviceId: vi.fn().mockResolvedValue(null),
      findByCajaId: vi.fn().mockResolvedValue(null),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (d) => makeDevice({ ...d, id: "dev-new" })),
      update: vi.fn().mockImplementation(async (id, patch) => makeDevice({ id, ...patch })),
      clearCajaId: vi.fn().mockResolvedValue(undefined),
      deleteById: vi.fn().mockResolvedValue(undefined),
      deleteByCajaId: vi.fn().mockResolvedValue(undefined),
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
        sellerUserId: null,
      });
    });

    it("devuelve storeId y el nombre del comercio cuando hay caja", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
      await expect(service.getStoreStatus()).resolves.toEqual({
        linked: true,
        storeId: "1234567",
        name: "Bosko",
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
    it("desvincula devices y luego borra la caja", async () => {
      await expect(service.deletePos("caja-1")).resolves.toEqual({ ok: true });
      expect(devicesRepo.clearCajaId).toHaveBeenCalledWith("caja-1");
      expect(cajasRepo.deleteById).toHaveBeenCalledWith("caja-1");
    });

    it("lanza NotFound si no existe", async () => {
      vi.mocked(cajasRepo.findById).mockResolvedValue(null);
      await expect(service.deletePos("missing")).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("registerOrLinkDevice", () => {
    it("registra un Posnet sin caja", async () => {
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "PDV" }] });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);
      vi.mocked(devicesRepo.create).mockResolvedValue(makeDevice({ cajaId: null }));

      const device = await service.registerOrLinkDevice({
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
      });

      expect(devicesRepo.create).toHaveBeenCalledWith({
        cajaId: null,
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
        operatingMode: "PDV",
      });
      expect(device.cajaId).toBeNull();
    });
  });

  describe("linkDevice / assignDevice", () => {
    it("verifica el device en MP y crea el vinculo", async () => {
      mockFetchOk({ devices: [{ id: "PAX_A910__X", operating_mode: "PDV", status: { state: "ACTIVE" } }] });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(null);
      vi.mocked(devicesRepo.findByCajaId).mockResolvedValue(null);
      vi.mocked(devicesRepo.create).mockResolvedValue(makeDevice({ cajaId: null, deviceId: "PAX_A910__X" }));
      vi.mocked(devicesRepo.update).mockResolvedValue(makeDevice({ cajaId: "caja-1", deviceId: "PAX_A910__X" }));

      const device = await service.linkDevice({
        cajaId: "caja-1",
        deviceId: "PAX_A910__X",
        deviceUsername: "Caja 1",
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/point/integration-api/devices?offset=0&limit=50"),
        expect.objectContaining({ method: "GET" }),
      );
      expect(devicesRepo.update).toHaveBeenCalledWith("dev-link-1", { cajaId: "caja-1" });
      expect(devicesRepo.update).toHaveBeenCalledWith("dev-link-1", { deviceUsername: "Caja 1" });
      expect(device.cajaId).toBe("caja-1");
    });

    it("reemplaza el Posnet previo de la caja", async () => {
      const previous = makeDevice({ id: "old", deviceId: "PAX_OLD" });
      const registered = makeDevice({ id: "new", cajaId: null, deviceId: "PAX_NEW" });
      vi.mocked(devicesRepo.findByDeviceId).mockResolvedValue(registered);
      vi.mocked(devicesRepo.findByCajaId).mockResolvedValue(previous);
      vi.mocked(devicesRepo.update).mockImplementation(async (id, patch) =>
        makeDevice({ id, deviceId: id === "new" ? "PAX_NEW" : "PAX_OLD", ...patch }),
      );

      await service.assignDevice({ cajaId: "caja-1", deviceId: "PAX_NEW" });

      expect(devicesRepo.update).toHaveBeenCalledWith("old", { cajaId: null });
      expect(devicesRepo.update).toHaveBeenCalledWith("new", { cajaId: "caja-1" });
    });

    it("desvincula con deviceId null", async () => {
      await expect(service.assignDevice({ cajaId: "caja-1", deviceId: null })).resolves.toBeNull();
      expect(devicesRepo.clearCajaId).toHaveBeenCalledWith("caja-1");
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

    it("lanza NotFound si no existe", async () => {
      vi.mocked(devicesRepo.findById).mockResolvedValue(null);
      await expect(service.unlinkDevice("x")).rejects.toBeInstanceOf(NotFound);
    });
  });

  describe("listCajas", () => {
    it("mergea device por cajaId", async () => {
      vi.mocked(cajasRepo.listAll).mockResolvedValue([makeCaja()]);
      vi.mocked(devicesRepo.listAll).mockResolvedValue([makeDevice()]);
      const rows = await service.listCajas();
      expect(rows[0].device?.deviceId).toBe("PAX_A910__X");
    });
  });
});
