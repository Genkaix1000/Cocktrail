import { mpDb } from "../../shared/supabase.js";

/** Fila de `oauth_states` que se inserta al iniciar el flujo OAuth (PKCE). */
export type NewOAuthState = {
  state: string;
  codeVerifier: string;
  barId: string | null;
  expiresAt: Date;
};

/** Resultado de consumir un state: lo que se guardó al generarlo. */
export type ConsumedOAuthState = {
  codeVerifier: string;
  barId: string | null;
};

export interface OAuthStatesRepository {
  insert(state: NewOAuthState): Promise<void>;
  /** Consume el state de forma atómica (lee, valida TTL, elimina). null si inválido/expirado. */
  consume(state: string): Promise<ConsumedOAuthState | null>;
}

export class SupabaseOAuthStatesRepository implements OAuthStatesRepository {
  async insert(state: NewOAuthState): Promise<void> {
    const { error } = await mpDb.from("oauth_states").insert({
      state: state.state,
      code_verifier: state.codeVerifier,
      bar_id: state.barId,
      expires_at: state.expiresAt.toISOString(),
    });

    if (error) {
      console.error("[SupabaseOAuthStatesRepository] Error inserting state:", error);
      throw error;
    }
  }

  async consume(state: string): Promise<ConsumedOAuthState | null> {
    const { data, error } = await mpDb.rpc("consume_oauth_state", { p_state: state });

    if (error) {
      console.error("[SupabaseOAuthStatesRepository] Error consuming state:", error);
      throw error;
    }

    // La RPC devuelve TABLE(...): 0 filas si el state no existe o expiró.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      codeVerifier: row.code_verifier,
      barId: row.bar_id ?? null,
    };
  }
}
