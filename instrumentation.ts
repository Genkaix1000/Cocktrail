// Hook que Next.js corre una vez al iniciar el server.
// Acá seedeamos el store in-memory para que las primeras requests
// ya encuentren drinks y un evento activo.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init, listClosedEvents } = await import("@/server/store");
    init();
    // Seed del historial solo si está vacío (idempotente bajo HMR).
    if (listClosedEvents().length === 0) {
      const { seedHistoryDemo } = await import("@/server/seed-history");
      seedHistoryDemo();
    }
  }
}
