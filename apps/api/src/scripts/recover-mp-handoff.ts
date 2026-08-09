/**
 * One-shot: revive tokens from an expired mercadopago_seller_handoff into
 * mercadopago_sellers (cloud-only). Does not print token values.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/recover-mp-handoff.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  decryptHandoff,
  encryptToken,
  MP_TOKEN_KEY_VERSION,
} from "../modules/mercadopago/mp-token-cipher.js";

const HANDOFF_ID = process.env.HANDOFF_ID ?? "dbb1a291-5a53-4723-9f02-897512cd8ea7";
const USER_ID = process.env.SELLER_USER_ID ?? "1985627927";

async function main() {
  const url = process.env.SUPABASE_CLOUD_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_CLOUD_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_CLOUD_URL / SERVICE_ROLE_KEY");

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: handoff, error } = await db
    .from("mercadopago_seller_handoff")
    .select("id, user_id, payload_enc, expires_at")
    .eq("id", HANDOFF_ID)
    .maybeSingle();

  if (error) throw error;
  if (!handoff) throw new Error(`Handoff ${HANDOFF_ID} no encontrado`);

  const payload = decryptHandoff(handoff.payload_enc as string);
  if (payload.user_id !== USER_ID) {
    throw new Error(`user_id mismatch: handoff=${payload.user_id} expected=${USER_ID}`);
  }

  console.log(
    JSON.stringify({
      step: "decrypted",
      user_id: payload.user_id,
      has_access: Boolean(payload.access_token),
      has_refresh: Boolean(payload.refresh_token),
      expires_at: payload.expires_at,
    }),
  );

  const me = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  });
  const meBody = me.ok ? ((await me.json()) as { id?: number | string }) : null;
  const meId = meBody?.id != null ? String(meBody.id) : null;
  console.log(
    JSON.stringify({
      step: "mp_users_me",
      status: me.status,
      id: meId,
      match: meId === USER_ID,
    }),
  );
  if (!me.ok || meId !== USER_ID) {
    throw new Error("access_token del handoff no sirve contra MP — haría falta re-OAuth");
  }

  const { error: upErr } = await db
    .from("mercadopago_sellers")
    .update({
      access_token: null,
      refresh_token: null,
      access_token_enc: encryptToken(payload.access_token),
      refresh_token_enc: payload.refresh_token ? encryptToken(payload.refresh_token) : null,
      key_version: MP_TOKEN_KEY_VERSION,
      expires_at: payload.expires_at,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", USER_ID);

  if (upErr) throw new Error(`update seller: ${upErr.message}`);

  const { error: delErr } = await db
    .from("mercadopago_seller_handoff")
    .delete()
    .eq("id", HANDOFF_ID);
  if (delErr) console.warn("WARN: no se pudo borrar handoff:", delErr.message);

  const { data: verify, error: vErr } = await db
    .from("mercadopago_sellers")
    .select(
      "user_id, status, key_version, expires_at, access_token_enc, refresh_token_enc",
    )
    .eq("user_id", USER_ID)
    .single();
  if (vErr) throw vErr;

  console.log(
    JSON.stringify({
      step: "restored",
      user_id: verify.user_id,
      status: verify.status,
      key_version: verify.key_version,
      expires_at: verify.expires_at,
      has_access_enc: Boolean(verify.access_token_enc),
      has_refresh_enc: Boolean(verify.refresh_token_enc),
    }),
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
