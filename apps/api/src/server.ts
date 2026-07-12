import { env } from "./config/env.js";
import { app, eventsService } from "./app.js";
import { syncService } from "./modules/sync/sync.service.js";
import { supabase } from "./shared/supabase.js";
import { exec } from "node:child_process";
import { networkInterfaces } from "node:os";

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

  async function initializeDatabase() {
    console.log("[boot] Checking local database connection...");
    await ensureDatabaseConnection();
    console.log("[boot] Local database connection verified.");

    // Initialize events service (queries local database)
    await eventsService.initialize();
    console.log("[boot] EventsService initialized");

    // Ensure local master data is seeded in the background (no Cloud Pull on boot)
    console.log("[boot] Ensuring local master data is seeded...");
    await syncService.ensureLocalMasterDataSeeded();
    console.log("[boot] Local master data check completed.");
    
    dbInitialized = true;
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
        
        // Re-run initialization steps
        await eventsService.initialize();
        console.log("[boot] [Retry] EventsService initialized");

        console.log("[boot] [Retry] Ensuring local master data is seeded...");
        await syncService.ensureLocalMasterDataSeeded();
        console.log("[boot] [Retry] Local master data check completed.");

        dbInitialized = true;
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
