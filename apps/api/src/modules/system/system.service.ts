import { exec } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventsRepository } from "../events/events.repository.js";
import type { MercadoPagoService } from "../mercadopago/mercadopago.service.js";
import type { ResolvedPosnet } from "../mercadopago/posnet-resolver.service.js";
import type { PrinterService } from "../printer/printer.service.js";
import {
  getMigrationsStatus,
  isDegraded,
  type MigrationsStatus,
} from "../../infra/migrations/migrations-status.js";
import {
  getMpFallbackStatus,
  runMpFallbackPreflight,
  type MpFallbackStatus,
} from "../mercadopago/mp-fallback-preflight.js";

const serverStartedAt = Date.now();

export type SystemHealth = {
  status: "ok" | "degraded";
  migrations: MigrationsStatus;
  /** F1.d — estado del preflight del fallback de emergencia de MP. */
  mpFallback: MpFallbackStatus;
  serverStartedAt: number;
};

export type SystemStatus = {
  internet: { connected: boolean };
  localDb: { connected: boolean };
  cloudDb: { connected: boolean; configured: boolean };
  posnet: {
    connected: boolean;
    configured: boolean;
    paired: boolean;
    deviceId: string | null;
    message: string;
    details: unknown;
  };
  printer: ReturnType<PrinterService["getStatus"]>;
  sync: { synced: boolean; pendingEvents: number };
  eventDetails: { id: string; status: string; orderCounter: number } | null;
  serverStartedAt: number;
  migrations: MigrationsStatus;
};

/**
 * Lógica de negocio de `/api/system` — antes vivía inline en los route handlers de
 * system.controller.ts (sin capa Service, la única excepción a Controller→Service→
 * Repository del resto del proyecto). Ver docs/specs/02-auditoria-api/deuda-estructural-fase2.md (punto 4).
 */
export class SystemService {
  constructor(
    private eventsRepo: EventsRepository,
    private mpService: MercadoPagoService,
    private printerService: PrinterService,
    private localDb: SupabaseClient,
    private cloudDb: SupabaseClient | null,
    /**
     * T18 (gestion-posnets): el device del bloque `posnet` sale del
     * PosnetResolver — la MISMA verdad que el cobro (caja → device activo, env
     * como último recurso) — nunca más de `env.MP_POS_DEVICE_ID` directo.
     * app.ts inyecta `peek()` (sin efectos: reportar no es cobrar).
     */
    private resolvePosnetForStatus: () => Promise<ResolvedPosnet>,
  ) {}

  /**
   * Liviano (lee un singleton en memoria, sin I/O) — a diferencia de
   * getStatus(), que hace fetchs con timeout y está rate-limiteado. Lo
   * pollea el banner de migraciones de /admin. El singleton se lee directo
   * (sin DI): lo escribe solo el runner del boot y es el diseño del estado.
   */
  getHealth(): SystemHealth {
    const migrations = getMigrationsStatus();
    return {
      status: isDegraded(migrations) ? "degraded" : "ok",
      migrations,
      // F1.d: singleton del preflight — un fallback degradado NO marca el
      // health general como "degraded" (es la red de seguridad, no el camino activo).
      mpFallback: getMpFallbackStatus(),
      serverStartedAt,
    };
  }

  /** F1.c — re-evaluación on-demand del preflight (nunca lanza). */
  async refreshMpFallback(): Promise<MpFallbackStatus> {
    return runMpFallbackPreflight();
  }

  async checkInternet(): Promise<boolean> {
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

  async getStatus(): Promise<SystemStatus> {
    const internetPromise = this.checkInternet();

    // Local Database Check
    let localDbConnected = false;
    try {
      const { error } = await this.localDb.from("users").select("id").limit(1);
      localDbConnected = !error;
    } catch {}

    // Cloud Database Check (with 2s timeout)
    let cloudDbConnected = false;
    const cloudDbConfigured = !!this.cloudDb;
    if (this.cloudDb) {
      try {
        const checkPromise = this.cloudDb.from("app_config").select("id").limit(1);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000));

        const result: any = await Promise.race([checkPromise, timeoutPromise]);
        cloudDbConnected = !result?.error;
      } catch {
        cloudDbConnected = false;
      }
    }

    // Sync status check — cuenta CUALQUIER night_event con sync_status != "synced",
    // sin filtrar por status (a propósito: incluye la noche activa todavía sin cerrar,
    // que nace con sync_status "pending" — mismo comportamiento que el endpoint tenía
    // antes de esta refactor. eventsRepo.getPendingSync() no sirve acá porque ESE sí
    // filtra por status="cerrado" para syncAllPendingEvents, semántica distinta).
    let synced = true;
    let pendingEvents = 0;
    try {
      const { data, error } = await this.localDb.from("night_events").select("id").neq("sync_status", "synced");
      if (!error && data) {
        pendingEvents = data.length;
        synced = pendingEvents === 0;
      }
    } catch {}

    // Posnet Check — vía PosnetResolver (T18): el mismo device que usaría el
    // cobro. `configured` = hay un device resoluble (caja o env-fallback);
    // "caja sin Posnet vinculado" llega como estado con el mensaje del 409 del
    // resolver, nunca como un error del endpoint.
    let posnetConfigured = false;
    let posnetConnected = false;
    let posnetDeviceId: string | null = null;
    let posnetMessage = "No configurado";
    let posnetDetails: unknown = null;
    try {
      const resolved = await this.resolvePosnetForStatus();
      posnetConfigured = true;
      posnetDeviceId = resolved.deviceId;
      try {
        const check = await this.mpService.checkDeviceConnection(resolved.deviceId);
        posnetConnected = check.connected;
        posnetMessage = check.message;
        posnetDetails = check.device || null;
      } catch (err) {
        posnetConnected = false;
        posnetMessage =
          err instanceof Error ? err.message : "Error al conectar con Posnet API";
      }
      if (resolved.source === "env") {
        // D2: cobrar por la env es el último recurso y tiene que ser VISIBLE.
        posnetMessage =
          `${posnetMessage} — Se cobra por MP_POS_DEVICE_ID de la env (último recurso): ` +
          "vinculá el Posnet a la caja desde /admin → Pagos.";
      }
    } catch (err) {
      posnetMessage =
        err instanceof Error ? err.message : "No se pudo resolver el Posnet de la caja.";
    }

    const internetConnected = await internetPromise;

    // Current Night Event check
    let eventDetails: SystemStatus["eventDetails"] = null;
    try {
      const active = await this.eventsRepo.getActive();
      if (active) {
        eventDetails = {
          id: active.id,
          status: active.status,
          orderCounter: active.orderCounter || 0,
        };
      }
    } catch {}

    return {
      internet: { connected: internetConnected },
      localDb: { connected: localDbConnected },
      cloudDb: { connected: cloudDbConnected, configured: cloudDbConfigured },
      posnet: {
        connected: posnetConnected,
        configured: posnetConfigured,
        paired: posnetConnected,
        deviceId: posnetDeviceId,
        message: posnetMessage,
        details: posnetDetails,
      },
      printer: this.printerService.getStatus(),
      sync: { synced, pendingEvents },
      eventDetails,
      serverStartedAt,
      migrations: getMigrationsStatus(),
    };
  }

  /** Apaga docker compose + supabase CLI y sale del proceso. No devuelve — quien llama ya respondió al cliente antes de invocar esto. */
  shutdown(initiatedBy: string): void {
    console.log("[SystemService] ⚠️ Shutdown initiated by user:", initiatedBy);
    exec("docker compose down", (errorDocker, stdoutDocker, stderrDocker) => {
      if (errorDocker) {
        console.error(`[SystemService] Error executing docker compose down: ${errorDocker.message}`);
      }
      console.log(`[SystemService] Docker compose output: ${stdoutDocker || stderrDocker}`);

      exec("pnpm exec supabase stop", (errorSupa, stdoutSupa, stderrSupa) => {
        if (errorSupa) {
          console.error(`[SystemService] Error executing supabase stop: ${errorSupa.message}`);
        }
        console.log(`[SystemService] Supabase stop output: ${stdoutSupa || stderrSupa}`);

        setTimeout(() => {
          console.log("[SystemService] Exiting Node process...");
          process.exit(0);
        }, 1000);
      });
    });
  }
}
