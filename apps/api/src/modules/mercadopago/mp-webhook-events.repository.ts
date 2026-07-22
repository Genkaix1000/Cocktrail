import { supabase } from "../../shared/supabase.js";

export type MpWebhookEvent = {
  id: string;
  xRequestId: string;
  dataId: string | null;
  type: string | null;
  payload: unknown;
  receivedAt: string;
  processedAt: string | null;
  attempts: number;
  lastError: string | null;
};

export type NewMpWebhookEvent = {
  xRequestId: string;
  dataId?: string | null;
  type?: string | null;
  payload: unknown;
};

export type InsertMpWebhookEventResult =
  | { duplicate: false; event: MpWebhookEvent }
  | { duplicate: true };

type MpWebhookEventRow = {
  id: string;
  x_request_id: string;
  data_id: string | null;
  type: string | null;
  payload: unknown;
  received_at: string;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
};

function mapRow(row: MpWebhookEventRow): MpWebhookEvent {
  return {
    id: row.id,
    xRequestId: row.x_request_id,
    dataId: row.data_id,
    type: row.type,
    payload: row.payload,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    attempts: row.attempts,
    lastError: row.last_error,
  };
}

const SELECT_COLS =
  "id, x_request_id, data_id, type, payload, received_at, processed_at, attempts, last_error";

/** Tope de reintentos por evento: pasado esto, replayPending() lo deja de mirar. */
export const MP_WEBHOOK_MAX_ATTEMPTS = 5;

export interface MpWebhookEventsRepository {
  /**
   * Persiste el evento entrante. Si el x_request_id ya existe (reintento de MP),
   * devuelve `{ duplicate: true }` en vez de lanzar — el caller responde 200
   * sin reprocesar.
   */
  insert(event: NewMpWebhookEvent): Promise<InsertMpWebhookEventResult>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** Eventos sin procesar con attempts < MP_WEBHOOK_MAX_ATTEMPTS, más viejos primero. */
  findPending(): Promise<MpWebhookEvent[]>;
}

export class SupabaseMpWebhookEventsRepository implements MpWebhookEventsRepository {
  async insert(event: NewMpWebhookEvent): Promise<InsertMpWebhookEventResult> {
    const { data, error } = await supabase
      .from("mp_webhook_events")
      .insert({
        x_request_id: event.xRequestId,
        data_id: event.dataId ?? null,
        type: event.type ?? null,
        payload: event.payload ?? {},
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      // 23505 = unique_violation sobre x_request_id: reintento de MP ya registrado.
      if (error.code === "23505") {
        return { duplicate: true };
      }
      console.error("[SupabaseMpWebhookEventsRepository] Error inserting event:", error);
      throw error;
    }

    return { duplicate: false, event: mapRow(data as MpWebhookEventRow) };
  }

  async markProcessed(id: string): Promise<void> {
    const { error } = await supabase
      .from("mp_webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error("[SupabaseMpWebhookEventsRepository] Error marking processed:", error);
      throw error;
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    // PostgREST no soporta `attempts = attempts + 1`; leer-y-escribir alcanza
    // porque hay un solo proceso Node escribiendo (ARCHITECTURE.md §7).
    const { data, error: readError } = await supabase
      .from("mp_webhook_events")
      .select("attempts")
      .eq("id", id)
      .single();

    if (readError) {
      console.error("[SupabaseMpWebhookEventsRepository] Error reading attempts:", readError);
      throw readError;
    }

    const attempts = ((data as { attempts: number }).attempts ?? 0) + 1;
    const { error } = await supabase
      .from("mp_webhook_events")
      .update({ attempts, last_error: errorMessage.slice(0, 1000) })
      .eq("id", id);

    if (error) {
      console.error("[SupabaseMpWebhookEventsRepository] Error marking failed:", error);
      throw error;
    }
  }

  async findPending(): Promise<MpWebhookEvent[]> {
    const { data, error } = await supabase
      .from("mp_webhook_events")
      .select(SELECT_COLS)
      .is("processed_at", null)
      .lt("attempts", MP_WEBHOOK_MAX_ATTEMPTS)
      .order("received_at", { ascending: true });

    if (error) {
      console.error("[SupabaseMpWebhookEventsRepository] Error finding pending:", error);
      throw error;
    }

    return ((data ?? []) as MpWebhookEventRow[]).map(mapRow);
  }
}
