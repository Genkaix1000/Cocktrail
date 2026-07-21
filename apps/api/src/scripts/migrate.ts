import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "@/config/env";
import { runMigrations } from "@/infra/migrations/migration-runner";
import { isDegraded } from "@/infra/migrations/migrations-status";
import { PgMigrationsRepository } from "@/infra/migrations/pg-migrations.repository";

/**
 * Corre el runner de migraciones one-shot, sin bootear el backend.
 * Uso: pnpm --filter cocktrail-api db:migrate
 * (DATABASE_URL overridea el destino, ej. para una base scratch.)
 */
async function main() {
  const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../supabase/migrations",
  );
  console.log(`[db:migrate] Base: ${env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`[db:migrate] Migraciones: ${migrationsDir}`);

  const status = await runMigrations({
    repo: new PgMigrationsRepository(env.DATABASE_URL),
    migrationsDir,
  });

  if (status.appliedNow.length > 0) {
    for (const version of status.appliedNow) console.log(`  ✔ ${version}`);
  }
  if (status.failed) {
    console.error(`  ✖ ${status.failed.version}: ${status.failed.error}`);
  }
  for (const d of status.drift) {
    console.warn(`  ⚠ drift: ${d.version}`);
  }

  if (isDegraded(status)) {
    console.error("[db:migrate] Estado: DEGRADADO");
    process.exit(1);
  }
  console.log("[db:migrate] Estado: OK");
}

main().catch((err) => {
  console.error("[db:migrate] Error inesperado:", err);
  process.exit(1);
});
