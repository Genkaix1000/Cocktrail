import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import express from "express";
import request from "supertest";
import type { MercadoPagoService } from "./mercadopago.service.js";
import type { PointPaymentsService } from "./point-payments.service.js";
import type { ResolvedPosnet } from "./posnet-resolver.service.js";
import type { MpHealth } from "./mp-health.service.js";
import type { BarsRepository } from "./bars.repository.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import { errorHandler } from "../../shared/middleware/error-handler.js";
import { env } from "../../config/env.js";

// El controller monta authMiddleware/requireRole reales; acá se prueba la
// resolución del Posnet, no la auth — se los deja pasar.
vi.mock("../auth/auth.middleware.js", () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { createMercadoPagoController } from "./mercadopago.controller.js";
import { _setBarsRepoForTests } from "./mp-context.middleware.js";

const NOT_LINKED = new Conflict(
  "Esta caja no tiene Posnet vinculado. Vinculá uno desde /admin → Pagos.",
  "POSNET_NOT_LINKED",
);

describe("createMercadoPagoController (gestion-posnets A5: resolución server-side)", () => {
  let service: {
    checkDeviceConnection: ReturnType<typeof vi.fn>;
    testDeviceReachability: ReturnType<typeof vi.fn>;
    cancelPaymentIntent: ReturnType<typeof vi.fn>;
  };
  let pointPayments: {
    createIntent: ReturnType<typeof vi.fn>;
    findIntentDeviceId: ReturnType<typeof vi.fn>;
    markCanceledLocally: ReturnType<typeof vi.fn>;
  };
  let resolvePosnet: Mock<(barId: string | undefined) => Promise<ResolvedPosnet>>;
  let getMpHealth: Mock<(refresh: boolean) => Promise<MpHealth>>;
  let app: express.Express;

  const HEALTH: MpHealth = {
    checks: {
      singleSeller: { ok: true, detail: "ok" },
      deviceOwnership: { ok: true, detail: "ok" },
      deviceMode: { ok: true, detail: "ok" },
      cajaProvisioned: { ok: true, detail: "ok" },
    },
    fallback: { status: "unknown", checkedAt: null },
    usingEnvDevice: false,
    blocking: false,
    checkedAt: "2026-07-23T00:00:00.000Z",
  };

  beforeEach(() => {
    // El middleware siempre intenta resolver el UUID de la instalación; este
    // fake devuelve null → el contexto degrada a env.BAR_CODE (camino legacy),
    // que es lo que estos tests asumen.
    _setBarsRepoForTests({
      findByCode: vi.fn(async () => null),
      findById: vi.fn(async () => null),
      listAll: vi.fn(async () => []),
    } as unknown as BarsRepository);

    service = {
      checkDeviceConnection: vi.fn().mockResolvedValue({ connected: true, message: "ok" }),
      testDeviceReachability: vi.fn().mockResolvedValue({ reachedDevice: true, message: "ok" }),
      cancelPaymentIntent: vi.fn().mockResolvedValue({ status: "CANCELED" }),
    };
    pointPayments = {
      createIntent: vi.fn().mockResolvedValue({ id: "intent-1", expiresAt: "2026-07-23T00:00:00Z" }),
      findIntentDeviceId: vi.fn().mockResolvedValue("device-de-la-fila"),
      markCanceledLocally: vi.fn().mockResolvedValue(undefined),
    };
    resolvePosnet = vi.fn().mockResolvedValue({ deviceId: "device-resuelto", source: "caja", cajaId: "caja-1" });
    getMpHealth = vi.fn().mockResolvedValue(HEALTH);

    app = express();
    app.use(express.json());
    app.use(
      "/api/mercadopago",
      createMercadoPagoController(
        service as unknown as MercadoPagoService,
        pointPayments as unknown as PointPaymentsService,
        resolvePosnet,
        getMpHealth,
      ),
    );
    app.use(errorHandler);
  });

  describe("GET /health", () => {
    it("devuelve la salud con Cache-Control: no-store (sin refresh por defecto)", async () => {
      const res = await request(app).get("/api/mercadopago/health");

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.blocking).toBe(false);
      expect(getMpHealth).toHaveBeenCalledWith(false);
    });

    it("?refresh=1 fuerza el re-chequeo", async () => {
      await request(app).get("/api/mercadopago/health?refresh=1");

      expect(getMpHealth).toHaveBeenCalledWith(true);
    });
  });

  describe("POST /pos/intent", () => {
    it("pasa el barId del contexto y NUNCA un deviceId del cliente", async () => {
      const res = await request(app).post("/api/mercadopago/pos/intent").send({ amount: 1500 });

      expect(res.status).toBe(200);
      expect(pointPayments.createIntent).toHaveBeenCalledTimes(1);
      const input = pointPayments.createIntent.mock.calls[0][0];
      expect(input.barId).toBe(env.BAR_CODE);
      expect(input).not.toHaveProperty("deviceId");
    });

    it("un x-device-id forjado NO tiene ningún efecto sobre el cobro", async () => {
      const res = await request(app)
        .post("/api/mercadopago/pos/intent")
        .set("x-device-id", "PAX_A910__DEVICE_AJENO")
        .send({ amount: 1500 });

      expect(res.status).toBe(200);
      const input = pointPayments.createIntent.mock.calls[0][0];
      expect(JSON.stringify(input)).not.toContain("DEVICE_AJENO");
      expect(input).not.toHaveProperty("deviceId");
    });

    it("el 409 del resolver (caja sin Posnet) llega al cliente como 409", async () => {
      pointPayments.createIntent.mockRejectedValue(NOT_LINKED);

      const res = await request(app).post("/api/mercadopago/pos/intent").send({ amount: 1500 });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("no tiene Posnet vinculado");
    });
  });

  describe("GET /device/status", () => {
    it("consulta el device RESUELTO por la caja (no el del header ni el de la env)", async () => {
      const res = await request(app)
        .get("/api/mercadopago/device/status")
        .set("x-device-id", "PAX_A910__DEVICE_AJENO");

      expect(res.status).toBe(200);
      expect(resolvePosnet).toHaveBeenCalledWith(env.BAR_CODE);
      expect(service.checkDeviceConnection).toHaveBeenCalledWith("device-resuelto");
    });

    it("caja sin Posnet vinculado → estado coherente para el hook (200, connected:false), no un 500", async () => {
      resolvePosnet.mockRejectedValue(NOT_LINKED);

      const res = await request(app).get("/api/mercadopago/device/status");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connected: false,
        message: expect.stringContaining("no tiene Posnet vinculado"),
      });
      expect(service.checkDeviceConnection).not.toHaveBeenCalled();
    });

    it("un error que no es Conflict sí va al error handler", async () => {
      resolvePosnet.mockRejectedValue(new Error("db caída"));

      const res = await request(app).get("/api/mercadopago/device/status");

      expect(res.status).toBe(500);
    });
  });

  describe("POST /device/test-charge", () => {
    it("con deviceId en el body testea CONTRA ESE device (test por fila — criterio F)", async () => {
      const res = await request(app)
        .post("/api/mercadopago/device/test-charge")
        .send({ deviceId: "PAX_A910__FILA_2" });

      expect(res.status).toBe(200);
      expect(service.testDeviceReachability).toHaveBeenCalledWith("PAX_A910__FILA_2");
      expect(resolvePosnet).not.toHaveBeenCalled();
    });

    it("sin body resuelve el device por la caja", async () => {
      await request(app).post("/api/mercadopago/device/test-charge").send({});

      expect(resolvePosnet).toHaveBeenCalledWith(env.BAR_CODE);
      expect(service.testDeviceReachability).toHaveBeenCalledWith("device-resuelto");
    });

    it("caja sin Posnet → resultado de test claro (reachedDevice:false), no un 500", async () => {
      resolvePosnet.mockRejectedValue(NOT_LINKED);

      const res = await request(app).post("/api/mercadopago/device/test-charge").send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        reachedDevice: false,
        message: expect.stringContaining("no tiene Posnet vinculado"),
      });
      expect(service.testDeviceReachability).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /pos/intent/:id", () => {
    it("cancela contra el device de la FILA del intent (mismo aparato con el que se creó)", async () => {
      const res = await request(app).delete("/api/mercadopago/pos/intent/intent-1");

      expect(res.status).toBe(200);
      expect(pointPayments.findIntentDeviceId).toHaveBeenCalledWith("intent-1");
      expect(service.cancelPaymentIntent).toHaveBeenCalledWith("intent-1", "device-de-la-fila");
      expect(resolvePosnet).not.toHaveBeenCalled();
      expect(pointPayments.markCanceledLocally).toHaveBeenCalledWith("intent-1");
    });

    it("intent sin fila local (legacy) → resuelve el device por la caja", async () => {
      pointPayments.findIntentDeviceId.mockResolvedValue(null);

      await request(app).delete("/api/mercadopago/pos/intent/intent-legacy");

      expect(resolvePosnet).toHaveBeenCalledWith(env.BAR_CODE);
      expect(service.cancelPaymentIntent).toHaveBeenCalledWith("intent-legacy", "device-resuelto");
    });
  });
});
