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
