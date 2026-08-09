import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { MercadoPagoProvisioningService } from "./mercadopago-provisioning.service.js";
import { Conflict, NotFound } from "../../shared/errors/http-errors.js";
import { errorHandler } from "../../shared/middleware/error-handler.js";

// Acá se prueban las rutas de gestion-posnets (T12/T13/T15 + bloque H), no la
// auth — pero el spy sobre requireRole verifica que el stack sea adminOnly.
const requireRoleSpy = vi.hoisted(() => vi.fn());
vi.mock("../auth/auth.middleware.js", () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: (role: string) => {
    requireRoleSpy(role);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
}));

import { createMercadoPagoProvisioningController } from "./mercadopago-provisioning.controller.js";

describe("createMercadoPagoProvisioningController (rutas gestion-posnets)", () => {
  let service: {
    listMpDevices: ReturnType<typeof vi.fn>;
    setDeviceOperatingMode: ReturnType<typeof vi.fn>;
    renameStore: ReturnType<typeof vi.fn>;
    reprovisionCaja: ReturnType<typeof vi.fn>;
  };
  let app: express.Express;

  // Fila con el mismo shape que las de GET /provisioning/cajas (contrato front).
  const CAJA_REPROVISIONADA = {
    id: "caja-1",
    barId: "bar-uuid-1",
    storeId: "999",
    externalPosId: "COCKTRAILBAR01",
    posIdMp: "777",
    qrImage: "https://new-qr.png",
    qrTemplate: "https://new-qr.pdf",
    sellerUserId: "seller-1",
    storeName: null,
    createdAt: "2026-07-17T00:00:00Z",
    device: null,
    isOrphan: false,
    barCode: "BARRA-01",
    barEnabled: true,
  };

  beforeEach(() => {
    requireRoleSpy.mockClear();
    service = {
      listMpDevices: vi.fn().mockResolvedValue({
        devices: [],
        token: { source: "seller", userId: "seller-1" },
        sellerUserId: "seller-1",
      }),
      setDeviceOperatingMode: vi.fn().mockResolvedValue({
        deviceId: "PAX_A910__X",
        operatingMode: "PDV",
        registeredLocally: true,
      }),
      renameStore: vi.fn().mockResolvedValue({ renamedInMp: true, name: "Bosko Bar" }),
      reprovisionCaja: vi.fn().mockResolvedValue(CAJA_REPROVISIONADA),
    };

    app = express();
    app.use(express.json());
    app.use(
      "/api/mercadopago",
      createMercadoPagoProvisioningController(
        service as unknown as MercadoPagoProvisioningService,
      ),
    );
    app.use(errorHandler);
  });

  describe("GET /provisioning/mp-devices", () => {
    it("devuelve el listado crudo con el contexto de credenciales", async () => {
      const res = await request(app).get("/api/mercadopago/provisioning/mp-devices");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        devices: [],
        token: { source: "seller", userId: "seller-1" },
        sellerUserId: "seller-1",
      });
      expect(service.listMpDevices).toHaveBeenCalledTimes(1);
    });

    it("un Conflict del service llega como 409 (la pantalla guía necesita el motivo)", async () => {
      service.listMpDevices.mockRejectedValue(new Conflict("MP no respondió"));

      const res = await request(app).get("/api/mercadopago/provisioning/mp-devices");

      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /provisioning/device/:id/operating-mode", () => {
    it("pasa el deviceId del path y el mode del body al service", async () => {
      const res = await request(app)
        .patch("/api/mercadopago/provisioning/device/PAX_A910__X/operating-mode")
        .send({ mode: "PDV" });

      expect(res.status).toBe(200);
      expect(service.setDeviceOperatingMode).toHaveBeenCalledWith("PAX_A910__X", "PDV");
      expect(res.body).toEqual({
        deviceId: "PAX_A910__X",
        operatingMode: "PDV",
        registeredLocally: true,
      });
    });

    it.each([{}, { mode: "pdv" }, { mode: "OTRO" }, { mode: 1 }])(
      "mode inválido (%j) → 400 sin tocar el service",
      async (body) => {
        const res = await request(app)
          .patch("/api/mercadopago/provisioning/device/PAX_A910__X/operating-mode")
          .send(body);

        expect(res.status).toBe(400);
        expect(service.setDeviceOperatingMode).not.toHaveBeenCalled();
      },
    );
  });

  describe("PUT /provisioning/store", () => {
    it("renombra la sucursal con el name del body", async () => {
      const res = await request(app)
        .put("/api/mercadopago/provisioning/store")
        .send({ name: "Bosko Bar" });

      expect(res.status).toBe(200);
      expect(service.renameStore).toHaveBeenCalledWith("Bosko Bar");
      expect(res.body).toEqual({ renamedInMp: true, name: "Bosko Bar" });
    });

    it("devuelve la rama degradada tal cual (alias local + nombre real de MP)", async () => {
      service.renameStore.mockResolvedValue({
        renamedInMp: false,
        name: "Bosko Bar",
        mpName: "GARCIAMANUEL20231019090947",
      });

      const res = await request(app)
        .put("/api/mercadopago/provisioning/store")
        .send({ name: "Bosko Bar" });

      expect(res.status).toBe(200);
      expect(res.body.renamedInMp).toBe(false);
      expect(res.body.mpName).toBe("GARCIAMANUEL20231019090947");
    });

    it.each([{}, { name: "" }, { name: "   " }, { name: "a".repeat(61) }, { name: 3 }])(
      "name inválido (%j) → 400 sin tocar el service",
      async (body) => {
        const res = await request(app).put("/api/mercadopago/provisioning/store").send(body);

        expect(res.status).toBe(400);
        expect(service.renameStore).not.toHaveBeenCalled();
      },
    );
  });

  describe("POST /provisioning/pos/:id/reprovision (bloque H)", () => {
    it("devuelve 200 con la caja actualizada completa (mismo shape que /provisioning/cajas)", async () => {
      const res = await request(app).post(
        "/api/mercadopago/provisioning/pos/caja-1/reprovision",
      );

      expect(res.status).toBe(200);
      expect(service.reprovisionCaja).toHaveBeenCalledWith("caja-1");
      expect(res.body).toEqual(CAJA_REPROVISIONADA);
    });

    it("la ruta va con el stack adminOnly (como sus vecinas)", async () => {
      await request(app).post("/api/mercadopago/provisioning/pos/caja-1/reprovision");
      expect(requireRoleSpy).toHaveBeenCalledWith("admin");
    });

    it("NotFound del service → 404", async () => {
      service.reprovisionCaja.mockRejectedValue(new NotFound("PDV no encontrado."));

      const res = await request(app).post(
        "/api/mercadopago/provisioning/pos/missing/reprovision",
      );

      expect(res.status).toBe(404);
    });

    it("sin seller activo → el Conflict accionable llega como 409", async () => {
      service.reprovisionCaja.mockRejectedValue(
        new Conflict("No hay ninguna cuenta de Mercado Pago vinculada. Vinculala desde /admin?tab=pagos."),
      );

      const res = await request(app).post(
        "/api/mercadopago/provisioning/pos/caja-1/reprovision",
      );

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("Vinculala desde /admin");
    });
  });
});
