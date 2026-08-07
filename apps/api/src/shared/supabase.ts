import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Alias histórico de `supabase` para `oauth_states`: la Edge Function `mp-auth-callback`
 * consume el state, así que backend y Edge Function tienen que escribir en el MISMO
 * proyecto. Con una sola base (Supabase Cloud) eso ya se cumple siempre.
 */
export const oauthDb = supabase;
