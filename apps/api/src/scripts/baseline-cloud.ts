import { Client } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { readMigrationFiles } from "../infra/migrations/migration-runner.js";

/**
 * Registra las migraciones existentes como `baseline` en una base que YA tiene
 * el schema y los datos, sin ejecutar una línea de SQL.
 *
 * Por qué existe: el runner trata `schema_migrations` vacía como "instalación
 * nueva" y aplica todo (migration-runner.ts:91-94), asumiendo que las
 * migraciones son idempotentes. No lo son: `20260724150000_drink_categories.sql`
 * y `20260725060000_delete_mojito_drinks.sql` hacen DELETE sobre `drinks`.
 * Arrancar la API contra una base con datos y sin tabla de control borra la
 * carta — ya pasó una vez.
 *
 * Uso:
 *   TARGET_DATABASE_URL=postgres://... pnpm --filter cocktrail-api exec tsx src/scripts/baseline-cloud.ts
 *   ... --yes    (sin --yes es dry-run)
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL,
  applied_by  TEXT NOT NULL
);
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
`;

/** Tablas que prueban que la base ya está poblada (no es una instalación nueva). */
const EXPECTED_TABLES = ["drinks", "orders", "night_events", "users"];

async function main(): Promise<void> {
  const databaseUrl = process.env.TARGET_DATABASE_URL;
  const confirm = process.argv.includes("--yes");

  if (!databaseUrl) {
    fail("Falta TARGET_DATABASE_URL (connection string de la base a marcar).");
  }

  const files = readMigrationFiles(MIGRATIONS_DIR);
  if (files.length === 0) fail(`No encontré migraciones en ${MIGRATIONS_DIR}`);

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();

  try {
    const host = new URL(databaseUrl.replace(/^postgres(ql)?:/, "http:")).host;
    console.log(`Base:        ${host}`);
    console.log(`Migraciones: ${files.length} archivos en supabase/migrations/\n`);

    // 1. La base tiene que estar poblada — si no, esto no es un baseline, es
    //    una instalación nueva y corresponde que el runner aplique todo.
    const counts: Record<string, number> = {};
    for (const table of EXPECTED_TABLES) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.${table}`,
      );
      counts[table] = Number(rows[0]?.n ?? 0);
      console.log(`  ${table.padEnd(14)} ${counts[table]} filas`);
    }
    if (counts.drinks === 0 && counts.orders === 0) {
      fail(
        "\nLa base está vacía: no corresponde baseline. Dejá que el runner aplique las migraciones normalmente.",
      );
    }

    // 2. No pisar un registro existente.
    const { rows: existing } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'schema_migrations'`,
    );
    if (Number(existing[0]?.n ?? 0) > 0) {
      const { rows } = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM public.schema_migrations",
      );
      const already = Number(rows[0]?.n ?? 0);
      if (already > 0) {
        fail(
          `\nschema_migrations ya tiene ${already} filas: esta base ya está registrada. Nada que hacer.`,
        );
      }
      console.log("\n  schema_migrations existe pero está vacía — se completa.");
    }

    console.log(`\nSe van a registrar ${files.length} migraciones como 'baseline' (sin ejecutar SQL):`);
    console.log(`  primera: ${files[0]!.version}`);
    console.log(`  última:  ${files[files.length - 1]!.version}`);

    if (!confirm) {
      console.log("\n[dry-run] No se escribió nada. Repetí con --yes para aplicar.");
      return;
    }

    // 3. Escribir, todo o nada.
    await client.query("BEGIN");
    try {
      await client.query(BOOTSTRAP_SQL);
      for (const file of files) {
        await client.query(
          `INSERT INTO public.schema_migrations (version, checksum, duration_ms, applied_by)
           VALUES ($1, $2, 0, 'baseline')
           ON CONFLICT (version) DO NOTHING`,
          [file.version, file.checksum],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    // 4. Verificar que los datos siguen ahí (el punto de todo esto).
    const { rows: registered } = await client.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM public.schema_migrations",
    );
    console.log(`\n✅ ${registered[0]?.n} migraciones registradas como baseline.`);

    console.log("\nConteos después (deben ser idénticos a los de arriba):");
    for (const table of EXPECTED_TABLES) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.${table}`,
      );
      const after = Number(rows[0]?.n ?? 0);
      const ok = after === counts[table] ? "✓" : "✗ CAMBIÓ";
      console.log(`  ${table.padEnd(14)} ${after} filas  ${ok}`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
