import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),

  // Auth — SIN DEFAULTS. Mínimo 32 caracteres.
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),

  // CORS — debe ser una URL válida
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // Credenciales staff (defaults de desarrollo)
  ADMIN_USER: z.string().default("admin"),
  ADMIN_PASS: z.string().default("admin"),
  CAJA_USER: z.string().default("caja"),
  CAJA_PASS: z.string().default("caja"),
  BAR_CODE: z.string().min(1).max(20).default("BARRA-01"),
  SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("service-role-key-placeholder"),

  // Postgres directo — SOLO lo usa el runner de migraciones (infra/migrations).
  // Default = compose local: puerto host 54322, password "postgres"
  // (docker-compose.yml:38-46). Vale también para `supabase start` (CLI).
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@127.0.0.1:54322/postgres"),

  // Mercado Pago — fallback de emergencia (nivel 3 del resolver, F1) + lector.
  // MP_ACCESS_TOKEN ya NO es la credencial principal: cobra solo si el seller
  // OAuth local falla. Su utilidad real se mide en el preflight (mp-fallback-preflight.ts).
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_POS_DEVICE_ID: z.string().optional(),

  // Mercado Pago — cifrado app-level de tokens (PR 4).
  // MP_TOKEN_SECRET: ikm del cifrado de tokens del seller (si falta, AUTH_SECRET).
  // Misma clave en la Edge Function `mp-auth-callback` (F0).
  // MP_TOKEN_SECRET_PREVIOUS: clave anterior durante una rotación (se re-cifra en boot).
  MP_TOKEN_SECRET: z.string().min(32, "MP_TOKEN_SECRET debe tener al menos 32 caracteres").optional(),
  MP_TOKEN_SECRET_PREVIOUS: z.string().min(32).optional(),

  // Mercado Pago — OAuth (multi-seller, Fase 1). Credenciales de la app Cocktrail.
  // Para el split prod/test, apuntar estas 3 a las credenciales del entorno activo.
  MP_APP_ID: z.string().optional(),          // = client_id (APPID de la app de MP)
  MP_CLIENT_SECRET: z.string().optional(),
  MP_REDIRECT_URI: z.string().url().optional(),
  // Días antes del vencimiento en que se refresca proactivamente el token (1–7, default 5).
  MP_REFRESH_MARGIN_DAYS: z.coerce.number().min(1).max(7).default(5),

  // Webhooks Orders API (Fase 6) — clave secreta del panel de MP.
  MP_WEBHOOK_SECRET: z.string().optional(),
  // Ventana de frescura del `ts` de la firma de webhooks (anti-replay), en segundos.
  MP_WEBHOOK_TS_TOLERANCE_SECONDS: z.coerce.number().positive().default(300),
});

function loadEnv() {
  if (!process.env.AUTH_SECRET && process.env.COCKTRAIL_AUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.COCKTRAIL_AUTH_SECRET;
  }
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      "❌ Error de configuración de variables de entorno:",
      result.error.flatten().fieldErrors,
    );
    process.exit(1);
  }

  // En producción, AUTH_SECRET no puede contener change-me o ser inseguro.
  if (
    result.data.NODE_ENV === "production" &&
    (result.data.AUTH_SECRET.includes("change-me") || result.data.AUTH_SECRET.includes("secret"))
  ) {
    console.error(
      "❌ AUTH_SECRET débil detectado en producción. Configuralo con un secreto fuerte (ej. openssl rand -hex 32).",
    );
    process.exit(1);
  }

  // Las credenciales tienen defaults cómodos para desarrollo; en producción
  // dejarlos sería publicar el sistema con admin/admin.
  if (result.data.NODE_ENV === "production") {
    // Los nombres de usuario pueden quedar como están: no son secretos.
    const inseguras = [
      ["ADMIN_PASS", result.data.ADMIN_PASS, "admin"],
      ["CAJA_PASS", result.data.CAJA_PASS, "caja"],
      ["SUPABASE_SERVICE_ROLE_KEY", result.data.SUPABASE_SERVICE_ROLE_KEY, "service-role-key-placeholder"],
    ].filter(([, valor, porDefecto]) => valor === porDefecto);

    const debiles = (
      [
        ["ADMIN_PASS", result.data.ADMIN_PASS],
        ["CAJA_PASS", result.data.CAJA_PASS],
      ] as const
    ).filter(([, valor]) => valor.length < 8);

    if (inseguras.length > 0 || debiles.length > 0) {
      console.error(
        "❌ Configuración insegura para producción:",
        [
          ...inseguras.map(([k]) => `${k} tiene el valor por defecto`),
          ...debiles.map(([k]) => `${k} tiene menos de 8 caracteres`),
        ].join(" · "),
      );
      process.exit(1);
    }
  }

  return result.data;
}

export const env = loadEnv();
