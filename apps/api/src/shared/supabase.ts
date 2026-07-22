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
 * Cliente SOLO para `oauth_states`: la Edge Function `mp-auth-callback` (Cloud)
 * consume el state, así que el backend debe escribirlo en el MISMO proyecto.
 * Si no hay Cloud configurado (dev), cae a la DB local, que tiene la misma
 * tabla/RPC (migraciones de Fase 0).
 *
 * ⚠ Los SELLERS ya NO van por acá (PR 4): viven en la base local con tokens
 * cifrados; Cloud solo guarda metadata + el buzón `mercadopago_seller_handoff`.
 */
export const oauthDb = supabaseCloud ?? supabase;
