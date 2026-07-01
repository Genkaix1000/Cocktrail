import { config } from "dotenv";
import { resolve } from "node:path";

process.env.NODE_ENV = "test";
config({ path: resolve(import.meta.dirname, "../../.env.test") });

// Los tests de integración importan `app` directo, sin pasar por el boot de
// server.ts — sin esto, EventsService.ensureInitialized() poll-espera hasta
// 60s a que alguien llame initialize() y nunca lo hace.
if (process.env.INTEGRATION) {
  const { eventsService } = await import("../../src/app.js");
  await eventsService.initialize();
}
