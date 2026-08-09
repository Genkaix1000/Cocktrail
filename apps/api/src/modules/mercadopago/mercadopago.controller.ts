import { Router } from "express";
import type { MercadoPagoService } from "./mercadopago.service.js";
import type { PointPaymentsService } from "./point-payments.service.js";
import type { MpCartItem } from "./mp-orders.repository.js";
import type { ResolvedPosnet } from "./posnet-resolver.service.js";
import type { MpHealth } from "./mp-health.service.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { mpContextMiddleware } from "./mp-context.middleware.js";

// Semilla que genera el frontend con crypto.randomUUID() — mismas reglas que
// la idempotencyKey del camino QR.
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function parseItems(raw: unknown): MpCartItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: MpCartItem[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as MpCartItem).drinkId === "number" &&
      typeof (it as MpCartItem).qty === "number"
    ) {
      items.push({ drinkId: (it as MpCartItem).drinkId, qty: (it as MpCartItem).qty });
    }
  }
  return items.length > 0 ? items : undefined;
}

export function createMercadoPagoController(
  service: MercadoPagoService,
  pointPayments: PointPaymentsService,
  // gestion-posnets (A5): el device se resuelve server-side por la caja —
  // `x-device-id` / `mpContext.deviceId` ya no participan del cobro.
  resolvePosnet: (barId: string | undefined) => Promise<ResolvedPosnet>,
  // Bloque G (gestion-posnets): salud de la vinculación, cacheada 30 s en
  // MpHealthService — se inyecta la función, no el service (mismo criterio
  // que resolvePosnet).
  getMpHealth: (refresh: boolean, barId?: string | null) => Promise<MpHealth>,
): Router {
  const router = Router();

  // GET /api/mercadopago/health — chequeos por barra activa (X-Bar-Id).
  // Cache 30 s server-side; ?refresh=1 fuerza re-chequeo contra MP.
  router.get(
    "/health",
    authMiddleware,
    requireRole("admin", "caja"),
    mpContextMiddleware,
    async (req, res, next) => {
      try {
        res.set("Cache-Control", "no-store");
        res.json(await getMpHealth(req.query.refresh === "1", req.mpContext?.barId));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/mercadopago/pos/intent - Enviar monto al Posnet (persiste el intent en mp_orders)
  router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const { amount, description, attemptId, items } = req.body;
      if (!amount || typeof amount !== "number") {
        res.status(400).json({ error: "Amount es requerido y debe ser un número." });
        return;
      }
      if (attemptId !== undefined && (typeof attemptId !== "string" || !ATTEMPT_ID_PATTERN.test(attemptId))) {
        res.status(400).json({
          error: "attemptId inválido: debe ser alfanumérico (con guiones) de 16 a 64 caracteres.",
        });
        return;
      }
      const intent = await pointPayments.createIntent({
        amount,
        description: typeof description === "string" ? description : undefined,
        // A5: se pasa la BARRA del contexto, nunca un deviceId del cliente —
        // un x-device-id forjado no tiene ningún efecto sobre el cobro.
        barId: req.mpContext?.barId,
        attemptId,
        items: parseItems(items),
      });
      res.json(intent);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/device/status - Probar conexión y modo del Posnet (análogo a /api/printer/test)
  router.get("/device/status", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      let resolved: ResolvedPosnet;
      try {
        resolved = await resolvePosnet(req.mpContext?.barId);
      } catch (err) {
        // "Caja sin Posnet vinculado" es un ESTADO para el hook del front
        // (usePosnetStatus), no un error del sistema: nunca un 500.
        if (err instanceof Conflict) {
          res.json({ connected: false, message: err.message });
          return;
        }
        throw err;
      }
      res.json(await service.checkDeviceConnection(resolved.deviceId));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/device/test-charge - Manda $15 real al Posnet y confirma si lo recibió.
  // A propósito NO pasa por PointPaymentsService: el intent de prueba no se persiste en mp_orders.
  router.post("/device/test-charge", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      // `deviceId` en el body = test por fila desde /admin (criterio F de
      // gestion-posnets). Sin body, se prueba el Posnet resuelto de la caja.
      let deviceId =
        typeof req.body?.deviceId === "string" && req.body.deviceId.trim()
          ? req.body.deviceId.trim()
          : undefined;
      if (!deviceId) {
        try {
          deviceId = (await resolvePosnet(req.mpContext?.barId)).deviceId;
        } catch (err) {
          if (err instanceof Conflict) {
            res.json({ reachedDevice: false, message: err.message });
            return;
          }
          throw err;
        }
      }
      res.json(await service.testDeviceReachability(deviceId));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/pos/intent/:id - Veredicto del cobro (decide el pago real, no el state)
  router.get("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      // Criterio I: sin no-store, el ETag por defecto de Express deja al
      // navegador cachear el estado del cobro (304) en pleno polling.
      res.set("Cache-Control", "no-store");
      res.json(await pointPayments.getIntentVerdict(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/pos/intent/:id/resolve - Re-consulta MP y devuelve el
  // veredicto actualizado (recupera un cobro desde otro dispositivo/pestaña).
  router.post("/pos/intent/:id/resolve", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await pointPayments.resolveIntent(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/pos/intent/:id - Cancelar intención de pago en cola
  router.delete("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      // El device sale de la fila del intent en mp_orders (el MISMO aparato
      // con el que se creó); si el intent no está registrado (legacy), se
      // resuelve por la caja.
      const intentId = req.params.id as string;
      const deviceId =
        (await pointPayments.findIntentDeviceId(intentId)) ??
        (await resolvePosnet(req.mpContext?.barId)).deviceId;
      const result = await service.cancelPaymentIntent(intentId, deviceId);
      // Best-effort: deja la fila local coherente (MP ya confirmó la cancelación).
      await pointPayments.markCanceledLocally(req.params.id as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
