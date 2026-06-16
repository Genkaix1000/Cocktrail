import { env } from "./config/env.js";
import { app, eventsService } from "./app.js";
import { seedHistoryDemo } from "./data/seed-history.js";

// Seed del historial demo (idempotente)
if (eventsService.listClosedEvents().length === 0) {
  seedHistoryDemo(eventsService);
  console.log("[boot] Historial demo seedeado");
}

app.listen(env.PORT, () => {
  console.log(`🍸 Cocktrail API corriendo en http://localhost:${env.PORT}`);
  console.log(`   CORS: ${env.FRONTEND_URL}`);
  console.log(`   Env: ${env.NODE_ENV}`);
});
