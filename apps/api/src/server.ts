import { env } from "./config/env.js";
import { app, eventsService, mpWebhooksService, mpSellersRepo } from "./app.js";
import { supabase } from "./shared/supabase.js";
import { setSessionVersion } from "./modules/auth/session.js";
import { runMpFallbackPreflight } from "./modules/mercadopago/mp-fallback-preflight.js";
import { runMigrations } from "./infra/migrations/migration-runner.js";
import { PgMigrationsRepository } from "./infra/migrations/pg-migrations.repository.js";
import { exec } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** IP LAN real de esta máquina (no "localhost") — la necesita cualquier dispositivo
 * de la red (tablet de caja/barra) para llegar al backend, a diferencia de localhost
 * que solo resuelve a sí mismo desde cada dispositivo. */
function getLanIp(): string | null {
  const interfaces = networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    // Puentes de Docker/Compose (docker0, br-*, veth*) no son la LAN real del boliche.
    if (/^(docker|br-|veth)/.test(name)) continue;
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }

  // Preferir rangos típicos de LAN doméstica/local (192.168.x.x, 10.x.x.x) por sobre
  // cualquier otro rango privado que pueda quedar de una interfaz virtual.
  return candidates.find((ip) => ip.startsWith("192.168.")) ?? candidates.find((ip) => ip.startsWith("10.")) ?? candidates[0] ?? null;
}

async function ensureDatabaseConnection(): Promise<void> {
  const maxAttempts = 6;
  let connected = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await supabase.from("night_events").select("id").limit(1);
      if (!error || (!error.message.includes("fetch failed") && !error.message.includes("ECONNREFUSED"))) {
        connected = true;
        break;
      }
      console.warn(`[boot] Connection attempt ${attempt}/${maxAttempts} failed: ${error.message}`);
    } catch (err: any) {
      console.warn(`[boot] Connection attempt ${attempt}/${maxAttempts} exception: ${err.message || err}`);
    }

    if (attempt === 1) {
      console.log("[boot] ⚠️ Local database connection refused. Attempting to start database services...");
      await new Promise<void>((resolve) => {
        // Try starting via supabase CLI first, fallback to docker compose
        exec("pnpm exec supabase start", (errSupabase, stdoutSupabase, stderrSupabase) => {
          if (errSupabase) {
            console.warn("[boot] Supabase CLI start failed or skipped. Trying Docker Compose...");
            exec("docker compose up -d", (errDocker, stdoutDocker, stderrDocker) => {
              if (errDocker) {
                console.error("[boot] Docker Compose up failed:", errDocker.message);
              } else {
                console.log("[boot] docker compose up -d executed:", stdoutDocker.trim() || stderrDocker.trim());
              }
              resolve();
            });
          } else {
            console.log("[boot] Supabase CLI started:", stdoutSupabase.trim() || stderrSupabase.trim());
            resolve();
          }
        });
      });
    }

    if (attempt < maxAttempts) {
      console.log(`[boot] Waiting 5 seconds before retry...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  if (!connected) {
    throw new Error("Could not connect to the local database after auto-healing attempts.");
  }
}

async function boot() {
  // 1. Start listening on configured port IMMEDIATELY so the port is open and Next.js doesn't receive ECONNREFUSED
  app.listen(env.PORT, () => {
    const lanIp = getLanIp();
    console.log(`🍸 Cocktrail API corriendo en http://localhost:${env.PORT}`);
    if (lanIp) {
      console.log(`   LAN (para tablets/otros dispositivos): http://${lanIp}:${env.PORT}`);
    } else {
      console.log(`   ⚠️ No se detectó una IP LAN — verificá la conexión de red si vas a acceder desde otro dispositivo.`);
    }
    console.log(`   CORS: ${env.FRONTEND_URL}`);
    console.log(`   Env: ${env.NODE_ENV}`);
  });

  // 2. Perform self-healing local DB connection check and initialization
  let dbInitialized = false;

  // Fail-open: una migración fallida NO impide arrancar (la base queda como
  // estaba — cada migración es una transacción atómica). La contrapartida es
  // el estado degradado visible en /api/system/health y el banner de /admin.
  async function runMigrationsFailOpen() {
    try {
      const migrationsDir = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../supabase/migrations",
      );
      await runMigrations({
        repo: new PgMigrationsRepository(env.DATABASE_URL),
        migrationsDir,
      });
    } catch (err: any) {
      // runMigrations no lanza; esto es un cinturón extra.
      console.error("[boot] Migrations runner failed unexpectedly:", err?.message || err);
    }
  }

  // Pasos comunes al camino feliz y al retry-loop: el runner corre después de
  // verificar conexión y ANTES de que nada lea el schema.
  async function initializeDatabaseCore() {
    // Cargar session version desde DB antes de que el auth funcione
    try {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", "session_version")
        .maybeSingle();
      if (data) setSessionVersion(Number(data.value) || 1);
    } catch {
      // Fallback: version 1 (default)
    }

    await runMigrationsFailOpen();

    // Webhooks de MP que quedaron persistidos sin procesar (el proceso murió
    // entre el 200 y el reconcile). Fail-open: un fallo acá no frena el boot.
    try {
      await mpWebhooksService.replayPending();
    } catch (err: any) {
      console.error("[boot] MP webhook replay failed:", err?.message || err);
    }

    // MP (fail-open: no frena el arranque, no loguea tokens):
    // Backfill de cifrado: filas legacy en claro → _enc; blobs abiertos con
    // MP_TOKEN_SECRET_PREVIOUS → re-cifrados con la clave actual.
    // F0: ya no hay pull del buzón — la Edge Function escribe tokens cifrados
    // directo en mercadopago_sellers.
    try {
      const { migrated } = await mpSellersRepo.backfillEncryption();
      if (migrated > 0) console.log(`[boot] MP: ${migrated} seller(s) re-cifrados.`);
    } catch (err: any) {
      console.warn("[boot] MP token backfill skipped:", err?.message || err);
    }
    // Preflight del fallback de emergencia — nunca lanza.
    await runMpFallbackPreflight();

    await eventsService.initialize();
    console.log("[boot] EventsService initialized");

    dbInitialized = true;
  }

  async function initializeDatabase() {
    console.log("[boot] Checking local database connection...");
    await ensureDatabaseConnection();
    console.log("[boot] Local database connection verified.");
    await initializeDatabaseCore();
  }

  initializeDatabase().catch(async (err: any) => {
    console.error("❌ Failed to initialize local database on boot:", err.message || err);
    console.log("[boot] Database initialization failed. Starting background auto-healing retry loop...");

    while (!dbInitialized) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Quick connection check
        const { error } = await supabase.from("night_events").select("id").limit(1);
        if (error && (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED"))) {
          throw new Error(error.message);
        }

        console.log("[boot] [Retry] Local database connection established!");
        await initializeDatabaseCore();
        console.log("[boot] [Retry] Database initialization fully completed successfully!");
      } catch (retryErr: any) {
        // Silently retry to avoid log spam in terminal
      }
    }
  });
}

boot().catch((err) => {
  console.error("❌ Failed to boot server process:", err);
  process.exit(1);
});
