import { randomUUID, createHash } from "node:crypto";

import { env } from "@/config/env";
import { SEED_CATEGORIES, SEED_DRINKS } from "@/data/drinks";
import { supabase } from "@/shared/supabase";

/**
 * Siembra los datos maestros (usuario admin + carta inicial) en la base.
 * Uso: pnpm --filter cocktrail-api db:seed
 *
 * MANUAL a propósito: antes vivía en el boot (`SyncService.ensureLocalMasterDataSeeded`),
 * cuando la base era local y descartable. Con una sola base en la nube, un seed automático
 * escribiría el admin de las env sobre producción. Solo siembra lo que falta: si ya hay
 * usuarios no toca `users`, si ya hay tragos no toca `drinks`.
 */

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function seedAdminIfMissing(): Promise<void> {
  const { data, error } = await supabase.from("users").select("id").limit(1);
  if (error) throw new Error(`No se pudo leer "users": ${error.message}`);
  if (data && data.length > 0) {
    console.log("[db:seed] users: ya hay usuarios — no se siembra el admin.");
    return;
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: randomUUID(),
    username: env.ADMIN_USER,
    password_hash: hashPassword(env.ADMIN_PASS),
    role: "admin",
    permissions: {
      closeNight: true,
      modifyCarta: true,
      manageUsers: true,
      monitoreo: true,
      metricas: true,
      historial: true,
      general: true,
      carta: true,
      pagos: true,
      staff: true,
      cancelarTickets: true,
    },
    created_at: new Date().toISOString(),
  });
  if (insertError) throw new Error(`No se pudo sembrar el admin: ${insertError.message}`);
  console.log(`[db:seed] users: admin "${env.ADMIN_USER}" sembrado.`);
}

async function seedDrinksIfMissing(): Promise<void> {
  const { data, error } = await supabase.from("drinks").select("id").limit(1);
  if (error) throw new Error(`No se pudo leer "drinks": ${error.message}`);
  if (data && data.length > 0) {
    console.log("[db:seed] drinks: ya hay tragos — no se siembra la carta.");
    return;
  }

  // Las categorías van primero: `drinks.category_id` las referencia por FK.
  const { error: catError } = await supabase.from("drink_categories").upsert(
    SEED_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      sort_order: c.sortOrder,
      is_system: c.isSystem ?? false,
    })),
  );
  if (catError) throw new Error(`No se pudieron sembrar las categorías: ${catError.message}`);
  console.log(`[db:seed] drink_categories: ${SEED_CATEGORIES.length} categorías upserteadas.`);

  const { error: drinksError } = await supabase.from("drinks").insert(
    SEED_DRINKS.map((d) => ({
      id: d.id,
      name: d.name,
      price: d.price,
      description: d.description,
      vibe: d.vibe,
      flavors: d.flavors,
      icon_name: d.iconName,
      image: d.image || null,
      trending: d.trending,
      promo: d.promo || false,
      available: d.available,
      category_id: d.categoryId ?? null,
      sort_order: d.sortOrder ?? 0,
    })),
  );
  if (drinksError) throw new Error(`No se pudo sembrar la carta: ${drinksError.message}`);
  console.log(`[db:seed] drinks: ${SEED_DRINKS.length} tragos sembrados.`);
}

async function main() {
  console.log(`[db:seed] Base: ${env.SUPABASE_URL}`);
  await seedAdminIfMissing();
  await seedDrinksIfMissing();
  console.log("[db:seed] Listo.");
}

main().catch((err) => {
  console.error("[db:seed] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
