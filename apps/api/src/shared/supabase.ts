import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const supabaseCloud = env.SUPABASE_CLOUD_URL && env.SUPABASE_CLOUD_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_CLOUD_URL, env.SUPABASE_CLOUD_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Cliente para la data de la integración MP (oauth_states + mercadopago_sellers).
 * En producción vive en Cloud — la Edge Function `mp-auth-callback` escribe ahí y
 * el backend debe leer/escribir el MISMO proyecto para que el flujo OAuth (state,
 * tokens) sea coherente. Si no hay Cloud configurado (dev), cae a la DB local, que
 * tiene las mismas tablas/RPC (migraciones de Fase 0).
 */
export const mpDb = supabaseCloud ?? supabase;
