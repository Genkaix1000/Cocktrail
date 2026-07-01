import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup/load-env.ts"],
    globalSetup: ["./tests/setup/global-setup.ts"],
    // Los tests de integración pegan contra el mismo Postgres local real (filas
    // compartidas como app_config/night_events y el cache en memoria de
    // EventsService) — correr los archivos en paralelo los hace pisarse entre sí.
    // Los unitarios no tocan DB, así que siguen corriendo en paralelo.
    fileParallelism: !process.env.INTEGRATION,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts"],
    },
  },
});
