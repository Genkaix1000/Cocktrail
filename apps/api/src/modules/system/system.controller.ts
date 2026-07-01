import { Router } from "express";
import { exec } from "node:child_process";
import { supabase, supabaseCloud } from "../../shared/supabase.js";
import { authenticate } from "../auth/auth.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { syncService } from "../sync/sync.service.js";
import type { UsersRepository } from "../users/users.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import { MercadoPagoService } from "../mercadopago/mercadopago.service.js";
import type { PrinterService } from "../printer/printer.service.js";
import { env } from "../../config/env.js";
import { verifySession } from "../auth/auth.service.js";
import { systemStatusLimiter } from "../../shared/middleware/rate-limit.js";
import { AuditLogsService } from "../audit-logs/audit-logs.service.js";

const serverStartedAt = Date.now();

export function createSystemController(
  usersRepo: UsersRepository,
  ordersRepo: OrdersRepository,
  cashSalesRepo: CashSalesRepository,
  mpService: MercadoPagoService,
  printerService: PrinterService
): Router {
  const router = Router();

  // Helper to check internet connection
  async function checkInternet(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("https://1.1.1.1", { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch("https://api.mercadopago.com", { method: "HEAD", signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
      } catch {
        return false;
      }
    }
  }

  // GET /api/system/logs — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/logs", authMiddleware, requireRole("admin", "caja", "barman"), async (req, res, next) => {
    try {
      const logs = await AuditLogsService.getLatest(10);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/system/status — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/status", authMiddleware, requireRole("admin", "caja", "barman"), systemStatusLimiter, async (req, res, next) => {
    try {
      const internetPromise = checkInternet();
      
      // Local Database Check
      let localDbConnected = false;
      try {
        const { error } = await supabase.from("users").select("id").limit(1);
        localDbConnected = !error;
      } catch {}

      // Cloud Database Check (with 2s timeout)
      let cloudDbConnected = false;
      const cloudDbConfigured = !!supabaseCloud;
      if (cloudDbConfigured && supabaseCloud) {
        try {
          const checkPromise = supabaseCloud.from("app_config").select("id").limit(1);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000));
          
          const result: any = await Promise.race([checkPromise, timeoutPromise]);
          cloudDbConnected = !result?.error;
        } catch {
          cloudDbConnected = false;
        }
      }

      // Sync status check
      let synced = true;
      let pendingEvents = 0;
      try {
        const { data, error } = await supabase
          .from("night_events")
          .select("id")
          .neq("sync_status", "synced");
        if (!error && data) {
          pendingEvents = data.length;
          synced = pendingEvents === 0;
        }
      } catch {}

      // Posnet Check
      let posnetConfigured = !!env.MP_ACCESS_TOKEN && !!env.MP_POS_DEVICE_ID;
      let posnetConnected = false;
      let posnetMessage = "No configurado";
      let posnetDetails = null;

      if (posnetConfigured) {
        try {
          const check = await mpService.checkDeviceConnection();
          posnetConnected = check.connected;
          posnetMessage = check.message;
          posnetDetails = check.device || null;
        } catch (err: any) {
          posnetConnected = false;
          posnetMessage = err.message || "Error al conectar con Posnet API";
        }
      }

      const internetConnected = await internetPromise;

      // Current Night Event check
      let eventDetails = null;
      try {
        const { data, error } = await supabase
          .from("night_events")
          .select("id, status, order_counter")
          .eq("status", "activo")
          .maybeSingle();
        if (!error && data) {
          eventDetails = {
            id: data.id,
            status: data.status,
            orderCounter: data.order_counter || 0
          };
        }
      } catch {}

      res.json({
        internet: { connected: internetConnected },
        localDb: { connected: localDbConnected },
        cloudDb: { connected: cloudDbConnected, configured: cloudDbConfigured },
        posnet: {
          connected: posnetConnected,
          configured: posnetConfigured,
          paired: posnetConnected,
          deviceId: env.MP_POS_DEVICE_ID || null,
          message: posnetMessage,
          details: posnetDetails
        },
        printer: printerService.getStatus(),
        sync: {
          synced,
          pendingEvents
        },
        eventDetails,
        serverStartedAt
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/system/sync — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.post("/sync", authMiddleware, requireRole("admin", "caja", "barman"), async (req, res, next) => {
    try {
      // 1. Pull Master Data
      await syncService.pullMasterData();

      // 2. Push Pending Events
      let syncResult = { successCount: 0, failedCount: 0 };
      if (supabaseCloud) {
        syncResult = await syncService.syncAllPendingEvents(ordersRepo, cashSalesRepo);
      }

      res.json({
        success: true,
        message: "Proceso de sincronización completado.",
        pulled: true,
        pushed: syncResult
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/system/shutdown
  router.post("/shutdown", async (req, res, next) => {
    const { username, password } = req.body;

    try {
      // 1. Determine which credentials to authenticate
      let targetUser = username;
      let targetPass = password;

      // If already logged in, use req.cookies to verify session
      const rawCookie = req.cookies?.["cocktrail_session"];
      const session = verifySession(rawCookie);
      
      if (session) {
        targetUser = session.username;
      }

      if (!targetUser || !targetPass) {
        return res.status(401).json({ error: "Faltan credenciales para apagar la terminal." });
      }

      // 2. Authenticate
      const authenticated = await authenticate(targetUser, targetPass, usersRepo);
      if (!authenticated) {
        return res.status(401).json({ error: "Contraseña incorrecta." });
      }

      // 3. Initiate Shutdown
      res.json({ success: true, message: "Apagando terminal y base de datos..." });

      // Run docker compose down and exit
      console.log("[SystemController] ⚠️ Shutdown initiated by user:", targetUser);
      exec("docker compose down", (errorDocker, stdoutDocker, stderrDocker) => {
        if (errorDocker) {
          console.error(`[SystemController] Error executing docker compose down: ${errorDocker.message}`);
        }
        console.log(`[SystemController] Docker compose output: ${stdoutDocker || stderrDocker}`);

        // Stop Supabase CLI services as well
        exec("pnpm exec supabase stop", (errorSupa, stdoutSupa, stderrSupa) => {
          if (errorSupa) {
            console.error(`[SystemController] Error executing supabase stop: ${errorSupa.message}`);
          }
          console.log(`[SystemController] Supabase stop output: ${stdoutSupa || stderrSupa}`);

          setTimeout(() => {
            console.log("[SystemController] Exiting Node process...");
            process.exit(0);
          }, 1000);
        });
      });

    } catch (err) {
      next(err);
    }
  });

  return router;
}
