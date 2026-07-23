import { Router } from "express";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { MercadoPagoProvisioningService } from "./mercadopago-provisioning.service.js";

export function createMercadoPagoProvisioningController(
  service: MercadoPagoProvisioningService,
): Router {
  const router = Router();
  const adminOnly = [authMiddleware, requireRole("admin")] as const;

  // GET /api/mercadopago/provisioning/store — estado de la sucursal
  router.get("/provisioning/store", ...adminOnly, async (_req, res, next) => {
    try {
      res.json(await service.getStoreStatus());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/provisioning/summary — resumen para UI
  router.get("/provisioning/summary", ...adminOnly, async (_req, res, next) => {
    try {
      res.json(await service.getSummary());
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/provisioning/store — crear sucursal en MP
  router.post("/provisioning/store", ...adminOnly, async (req, res, next) => {
    try {
      const { barId, name, address } = req.body ?? {};
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name es requerido." });
        return;
      }
      res.status(201).json(
        await service.createStore({
          barId: typeof barId === "string" ? barId : undefined,
          name,
          address: address && typeof address === "object" ? address : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/provisioning/cajas
  router.get("/provisioning/cajas", ...adminOnly, async (_req, res, next) => {
    try {
      res.json(await service.listCajas());
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/provisioning/pos
  router.post("/provisioning/pos", ...adminOnly, async (req, res, next) => {
    try {
      const { barId, name } = req.body ?? {};
      if (!barId || typeof barId !== "string") {
        res.status(400).json({ error: "barId es requerido." });
        return;
      }
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name es requerido." });
        return;
      }
      res.status(201).json(await service.createPos({ barId, name }));
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/provisioning/pos/:id
  router.delete("/provisioning/pos/:id", ...adminOnly, async (req, res, next) => {
    try {
      res.json(await service.deletePos(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/provisioning/pos/:id/reprovision — re-provisiona la
  // caja en la cuenta del seller activo (gestion-posnets H, R22). El QR cambia;
  // el aviso previo es del front. Devuelve la caja actualizada completa.
  router.post("/provisioning/pos/:id/reprovision", ...adminOnly, async (req, res, next) => {
    try {
      res.json(await service.reprovisionCaja(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/provisioning/pos/:id/refresh-qr — recupera QR desde MP
  router.post("/provisioning/pos/:id/refresh-qr", ...adminOnly, async (req, res, next) => {
    try {
      res.json(await service.refreshQr(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // PUT /api/mercadopago/provisioning/store — renombrar la sucursal (bloque E)
  router.put("/provisioning/store", ...adminOnly, async (req, res, next) => {
    try {
      const { name } = req.body ?? {};
      if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
        res.status(400).json({ error: "name es requerido (1 a 60 caracteres)." });
        return;
      }
      res.json(await service.renameStore(name));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/provisioning/devices
  router.get("/provisioning/devices", ...adminOnly, async (_req, res, next) => {
    try {
      res.json(await service.listDevices());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/provisioning/mp-devices — lista CRUDA de la cuenta de
  // MP + contexto de credenciales para la pantalla guía (gestion-posnets B).
  router.get("/provisioning/mp-devices", ...adminOnly, async (_req, res, next) => {
    try {
      res.json(await service.listMpDevices());
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/mercadopago/provisioning/device/:id/operating-mode — modo PDV
  // desde la app (gestion-posnets C): body { mode: "PDV" | "STANDALONE" }.
  router.patch(
    "/provisioning/device/:id/operating-mode",
    ...adminOnly,
    async (req, res, next) => {
      try {
        const { mode } = req.body ?? {};
        if (mode !== "PDV" && mode !== "STANDALONE") {
          res.status(400).json({ error: 'mode debe ser "PDV" o "STANDALONE".' });
          return;
        }
        res.json(await service.setDeviceOperatingMode(req.params.id as string, mode));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/mercadopago/provisioning/device
  // - { deviceId, deviceUsername? } → registra Posnet (sin PDV)
  // - { cajaId, deviceId } → vincula Posnet a PDV (reemplaza el anterior)
  // - { cajaId, deviceId: null } → desvincula ("Sin Posnet")
  router.post("/provisioning/device", ...adminOnly, async (req, res, next) => {
    try {
      const { cajaId, deviceId, deviceUsername } = req.body ?? {};

      if (typeof cajaId === "string" && cajaId.trim()) {
        const assigned = await service.assignDevice({
          cajaId,
          deviceId: typeof deviceId === "string" ? deviceId : null,
        });
        res.status(200).json(assigned ?? { ok: true, device: null });
        return;
      }

      if (!deviceId || typeof deviceId !== "string") {
        res.status(400).json({ error: "deviceId es requerido." });
        return;
      }
      res.status(201).json(
        await service.registerOrLinkDevice({
          deviceId,
          deviceUsername: typeof deviceUsername === "string" ? deviceUsername : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/provisioning/device/:id — elimina del registro
  router.delete("/provisioning/device/:id", ...adminOnly, async (req, res, next) => {
    try {
      res.json(await service.unlinkDevice(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
