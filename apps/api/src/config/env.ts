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
  BARMAN_USER: z.string().default("barra"),
  BARMAN_PASS: z.string().default("barra"),
  BAR_CODE: z.string().min(1).max(20).default("BARRA-01"),
  SUPABASE_URL: z.string().url().default("http://127.0.0.1:54321"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("service-role-key-placeholder"),
  SUPABASE_CLOUD_URL: z.string().url().optional(),
  SUPABASE_CLOUD_SERVICE_ROLE_KEY: z.string().optional(),

  // Mercado Pago
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_POS_DEVICE_ID: z.string().optional(),
  // Experimental: fuerza el tipo de tarjeta en el payment-intent para intentar saltear
  // la pantalla intermedia "Tarjetas" del Posnet (ver docs/ARCHITECTURE.md §11). Sin
  // confirmar en la doc oficial de MP que efectivamente salta la pantalla — probar en
  // el dispositivo real antes de asumir que funciona. Si se deja sin setear, el body
  // no incluye "payment" y el comportamiento es el de siempre.
  MP_POINT_PAYMENT_TYPE: z.enum(["credit_card", "debit_card"]).optional(),
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
