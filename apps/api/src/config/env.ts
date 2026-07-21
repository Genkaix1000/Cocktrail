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
  SUPABASE_CLOUD_URL: z.string().url().optional(),
  SUPABASE_CLOUD_SERVICE_ROLE_KEY: z.string().optional(),

  // Postgres directo — SOLO lo usa el runner de migraciones (infra/migrations).
  // Default = compose local: puerto host 54322, password "postgres"
  // (docker-compose.yml:38-46). Vale también para `supabase start` (CLI).
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@127.0.0.1:54322/postgres"),

  // Mercado Pago — Posnet/Point legacy (single-seller, sandbox)
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_POS_DEVICE_ID: z.string().optional(),

  // Mercado Pago — OAuth (multi-seller, Fase 1). Credenciales de la app Cocktrail.
  // Para el split prod/test, apuntar estas 3 a las credenciales del entorno activo.
  MP_APP_ID: z.string().optional(),          // = client_id (APPID de la app de MP)
  MP_CLIENT_SECRET: z.string().optional(),
  MP_REDIRECT_URI: z.string().url().optional(),
  // Días antes del vencimiento en que se refresca proactivamente el token (1–7, default 5).
  MP_REFRESH_MARGIN_DAYS: z.coerce.number().min(1).max(7).default(5),

  // Webhooks Orders API (Fase 6) — clave secreta del panel de MP.
  MP_WEBHOOK_SECRET: z.string().optional(),
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

  return result.data;
}

export const env = loadEnv();
