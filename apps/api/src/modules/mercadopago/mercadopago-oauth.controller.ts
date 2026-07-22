import { Router } from "express";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { env } from "../../config/env.js";

/**
 * Rutas OAuth de MP que corren en el backend Express. El CALLBACK no vive acá:
 * es una Edge Function en Supabase Cloud (`supabase/functions/mp-auth-callback`),
 * porque MP redirige el navegador del vendedor a una URL pública sin cookie.
 */
export function createMercadoPagoOAuthController(service: MercadoPagoOAuthService): Router {
  const router = Router();

  // GET /api/mercadopago/oauth/url?barId=BARRA-01 — genera la URL de autorización (admin).
  router.get("/oauth/url", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const barId = service.requireBarId(req.query.barId ?? env.BAR_CODE);
      const result = await service.generateAuthUrl(barId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/seller-status?barId=... — estado de vinculación para la UI (admin).
  router.get("/seller-status", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const barId = typeof req.query.barId === "string" && req.query.barId ? req.query.barId : null;
      res.json(await service.getSellerStatus(barId));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/oauth/pull-seller — baja el seller del buzón de traspaso Cloud (admin).
  router.post("/oauth/pull-seller", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      res.json(await service.pullSellerFromCloud());
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/oauth/seller — desvincular (wipe local + Cloud) (admin).
  // Contrato con el frontend: { ok: true, cloudCleaned: boolean }.
  router.delete("/oauth/seller", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      res.json(await service.unlinkSeller());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
