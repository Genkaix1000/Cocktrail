import { Client } from "pg";

/**
 * Alinea el schema de la base en la nube con el que producen las migraciones.
 *
 * Por qué existe: esa base no fue creada por el runner de migraciones sino por
 * el sync viejo, que replicaba solo lo que necesitaba copiar. Quedó sin la
 * columna `night_events.status` (la app no puede leer ni abrir noches), con
 * `closed_at NOT NULL` (una noche activa no tiene cierre, así que no se podría
 * abrir ninguna), sin 9 constraints y sin un índice.
 *
 * El baseline dio por aplicadas las 40 migraciones, así que el runner no va a
 * corregir esto solo: hay que emparejarlo una vez, a mano.
 *
 * Uso:
 *   TARGET_DATABASE_URL=postgres://... tsx src/scripts/repair-cloud-schema.ts [--yes]
 */

type Step = { label: string; sql: string };

/** UUID de "Barra VIP" en la nube — la única barra real. */
const BAR_REAL = "ddfab230-698b-4815-b807-3cee375fa9c9";
/** Caja usada en el boliche (los 140 cobros del 25 y 26 de julio). */
const CAJA_PRODUCCION = "fd174d11-1616-438f-b748-50505e85a5cd";
/** Cajas de pruebas de desarrollo, sin cobros: una por cada instalación. */
const CAJAS_DE_PRUEBA = ["38c36457-f37a-4812-b347-7e241b45416a", "f1681f0f-a395-4e02-b89c-a951de8c5b4e"];

const STEPS: Step[] = [
  {
    // Cada instalación generó su propio UUID de barra y el sync subía las cajas
    // pero no las barras, así que las tres quedaron apuntando a la nada.
    label: "Consolidar cajas de Mercado Pago sobre la barra real",
    sql: `UPDATE public.mercadopago_cajas SET bar_id = '${BAR_REAL}' WHERE id = '${CAJA_PRODUCCION}';
          DELETE FROM public.mercadopago_cajas_devices WHERE caja_id IN (${CAJAS_DE_PRUEBA.map((c) => `'${c}'`).join(",")});
          DELETE FROM public.mercadopago_cajas WHERE id IN (${CAJAS_DE_PRUEBA.map((c) => `'${c}'`).join(",")});`,
  },
  {
    label: "night_events.status (todas las noches existentes están cerradas)",
    sql: `ALTER TABLE public.night_events ADD COLUMN IF NOT EXISTS status text;
          UPDATE public.night_events SET status = 'cerrado' WHERE status IS NULL;
          ALTER TABLE public.night_events ALTER COLUMN status SET NOT NULL;`,
  },
  {
    label: "night_events.sync_status / synced_at",
    sql: `ALTER TABLE public.night_events ADD COLUMN IF NOT EXISTS sync_status text;
          ALTER TABLE public.night_events ADD COLUMN IF NOT EXISTS synced_at timestamptz;`,
  },
  {
    label: "night_events.closed_at pasa a aceptar NULL (noche en curso)",
    sql: `ALTER TABLE public.night_events ALTER COLUMN closed_at DROP NOT NULL;`,
  },
  {
    label: "CHECKs de night_events",
    sql: `ALTER TABLE public.night_events DROP CONSTRAINT IF EXISTS night_events_status_check;
          ALTER TABLE public.night_events ADD CONSTRAINT night_events_status_check
            CHECK (status = ANY (ARRAY['activo'::text, 'cerrado'::text]));
          ALTER TABLE public.night_events DROP CONSTRAINT IF EXISTS night_events_sync_status_check;
          ALTER TABLE public.night_events ADD CONSTRAINT night_events_sync_status_check
            CHECK (sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text]));`,
  },
  {
    label: "NOT NULL faltantes (verificado: no hay nulos)",
    sql: `ALTER TABLE public.orders ALTER COLUMN payment_status SET NOT NULL;
          ALTER TABLE public.bar_sessions ALTER COLUMN connected_at SET NOT NULL;
          ALTER TABLE public.bar_sessions ALTER COLUMN last_seen_at SET NOT NULL;
          ALTER TABLE public.mercadopago_cajas_devices ALTER COLUMN created_at SET NOT NULL;`,
  },
  {
    label: "Claves foráneas faltantes",
    sql: `ALTER TABLE public.bar_sessions DROP CONSTRAINT IF EXISTS bar_sessions_bar_id_fkey;
          ALTER TABLE public.bar_sessions ADD CONSTRAINT bar_sessions_bar_id_fkey
            FOREIGN KEY (bar_id) REFERENCES public.bars(id) ON DELETE CASCADE;
          ALTER TABLE public.mercadopago_cajas DROP CONSTRAINT IF EXISTS mercadopago_cajas_bar_id_fkey;
          ALTER TABLE public.mercadopago_cajas ADD CONSTRAINT mercadopago_cajas_bar_id_fkey
            FOREIGN KEY (bar_id) REFERENCES public.bars(id);
          ALTER TABLE public.mercadopago_cajas DROP CONSTRAINT IF EXISTS mercadopago_cajas_seller_user_id_fkey;
          ALTER TABLE public.mercadopago_cajas ADD CONSTRAINT mercadopago_cajas_seller_user_id_fkey
            FOREIGN KEY (seller_user_id) REFERENCES public.mercadopago_sellers(user_id);
          ALTER TABLE public.mercadopago_cajas_devices DROP CONSTRAINT IF EXISTS mercadopago_cajas_devices_caja_id_fkey;
          ALTER TABLE public.mercadopago_cajas_devices ADD CONSTRAINT mercadopago_cajas_devices_caja_id_fkey
            FOREIGN KEY (caja_id) REFERENCES public.mercadopago_cajas(id);
          ALTER TABLE public.mp_orders DROP CONSTRAINT IF EXISTS mp_orders_caja_id_fkey;
          ALTER TABLE public.mp_orders ADD CONSTRAINT mp_orders_caja_id_fkey
            FOREIGN KEY (caja_id) REFERENCES public.mercadopago_cajas(id);
          ALTER TABLE public.mp_orders DROP CONSTRAINT IF EXISTS mp_orders_event_id_fkey;
          ALTER TABLE public.mp_orders ADD CONSTRAINT mp_orders_event_id_fkey
            FOREIGN KEY (event_id) REFERENCES public.night_events(id);
          ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_mp_order_id_fkey;
          ALTER TABLE public.orders ADD CONSTRAINT orders_mp_order_id_fkey
            FOREIGN KEY (mp_order_id) REFERENCES public.mp_orders(id);`,
  },
  {
    // Columna que dejó el sync viejo (ahí guardaba los totales de la noche) y
    // que no existe en las migraciones. Quedó NOT NULL sin default, así que
    // cualquier INSERT de una noche nueva fallaba: el código ya no la escribe.
    label: "night_events.totals deja de ser obligatoria (resto del sync viejo)",
    sql: `ALTER TABLE public.night_events ALTER COLUMN totals DROP NOT NULL;`,
  },
  {
    label: "Índice faltante",
    sql: `CREATE INDEX IF NOT EXISTS idx_bar_sessions_last_seen_at
            ON public.bar_sessions USING btree (last_seen_at);`,
  },
];

/** Una FK no se puede crear si ya hay filas que la violarían. */
const ORPHAN_CHECKS: { label: string; sql: string }[] = [
  { label: "bar_sessions.bar_id → bars", sql: `SELECT count(*)::int AS n FROM bar_sessions s WHERE s.bar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bars b WHERE b.id = s.bar_id)` },
  { label: "mercadopago_cajas.bar_id → bars", sql: `SELECT count(*)::int AS n FROM mercadopago_cajas c WHERE c.bar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bars b WHERE b.id = c.bar_id)` },
  { label: "mercadopago_cajas.seller_user_id → sellers", sql: `SELECT count(*)::int AS n FROM mercadopago_cajas c WHERE c.seller_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mercadopago_sellers s WHERE s.user_id = c.seller_user_id)` },
  { label: "mercadopago_cajas_devices.caja_id → cajas", sql: `SELECT count(*)::int AS n FROM mercadopago_cajas_devices d WHERE d.caja_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mercadopago_cajas c WHERE c.id = d.caja_id)` },
  { label: "mp_orders.caja_id → cajas", sql: `SELECT count(*)::int AS n FROM mp_orders o WHERE o.caja_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mercadopago_cajas c WHERE c.id = o.caja_id)` },
  { label: "mp_orders.event_id → night_events", sql: `SELECT count(*)::int AS n FROM mp_orders o WHERE o.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM night_events e WHERE e.id = o.event_id)` },
  { label: "orders.mp_order_id → mp_orders", sql: `SELECT count(*)::int AS n FROM orders o WHERE o.mp_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mp_orders m WHERE m.id = o.mp_order_id)` },
];

const COUNT_TABLES = ["drinks", "night_events", "orders", "tickets", "users", "mp_orders"];

async function main(): Promise<void> {
  const url = process.env.TARGET_DATABASE_URL;
  if (!url) {
    console.error("Falta TARGET_DATABASE_URL");
    process.exit(1);
  }
  const confirm = process.argv.includes("--yes");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();

  try {
    const before: Record<string, number> = {};
    for (const t of COUNT_TABLES) {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${t}`);
      before[t] = Number(rows[0]!.n);
    }
    console.log("Datos antes:", before);

    console.log("\nFilas que romperían una clave foránea:");
    let orphans = 0;
    const orphanDetail = { cajas: 0 };
    for (const check of ORPHAN_CHECKS) {
      const { rows } = await client.query<{ n: number }>(check.sql);
      const n = rows[0]?.n ?? 0;
      orphans += n;
      if (check.label.startsWith("mercadopago_cajas.bar_id")) orphanDetail.cajas = n;
      console.log(`  ${n === 0 ? "✓" : "✗"} ${check.label}: ${n}`);
    }
    // Las cajas de MP se arreglan en el primer paso; el resto de huérfanos sí aborta.
    const soloCajas = orphans === orphanDetail.cajas && orphans > 0;
    if (orphans > 0 && !soloCajas) {
      console.error(`\n❌ Hay ${orphans} filas huérfanas fuera de las cajas: resolvelas antes de crear las claves foráneas.`);
      process.exit(1);
    }
    if (soloCajas) {
      console.log(`  (las ${orphans} de mercadopago_cajas las arregla el paso 1)`);
    }

    console.log("\nPasos a aplicar:");
    STEPS.forEach((s, i) => console.log(`  ${i + 1}. ${s.label}`));

    if (!confirm) {
      console.log("\n[dry-run] No se escribió nada. Repetí con --yes para aplicar.");
      return;
    }

    await client.query("BEGIN");
    try {
      for (const step of STEPS) {
        await client.query(step.sql);
        console.log(`  ✓ ${step.label}`);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    console.log("\nDatos después (deben coincidir):");
    for (const t of COUNT_TABLES) {
      const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${t}`);
      const after = Number(rows[0]!.n);
      console.log(`  ${t.padEnd(14)} ${after}  ${after === before[t] ? "✓" : "✗ CAMBIÓ"}`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
