import { supabase } from "../../shared/supabase.js";

export type MpOrderStatus =
  | "created"
  | "processed"
  | "canceled"
  | "refunded"
  | "expired"
  | "failed"
  | "action_required"
  | "unknown";
export type MpOrderType = "qr" | "point";

export type MpOrder = {
  id: string;
  orderIdMp: string;
  externalRef: string;
  idempotencyKey: string;
  paymentTransactionId: string | null;
  paymentId: string | null;
  amount: number;
  status: MpOrderStatus;
  type: MpOrderType;
  barId: string | null;
  cajaId: string | null;
  eventId: string | null;
  qrData: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewMpOrder = {
  orderIdMp: string;
  externalRef: string;
  idempotencyKey: string;
  paymentTransactionId?: string | null;
  paymentId?: string | null;
  amount: number | string;
  status: MpOrderStatus;
  type: MpOrderType;
  barId?: string | null;
  cajaId?: string | null;
  eventId?: string | null;
  qrData?: string | null;
  expiresAt?: string | null;
};

export type MpOrderUpdate = {
  status?: MpOrderStatus;
  paymentId?: string | null;
  paymentTransactionId?: string | null;
};

type MpOrderRow = {
  id: string;
  order_id_mp: string;
  external_ref: string;
  idempotency_key: string;
  payment_transaction_id: string | null;
  payment_id: string | null;
  amount: number | string;
  status: MpOrderStatus;
  type: MpOrderType;
  bar_id: string | null;
  caja_id: string | null;
  event_id: string | null;
  qr_data: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export function mapMpOrderRow(row: MpOrderRow): MpOrder {
  return {
    id: row.id,
    orderIdMp: row.order_id_mp,
    externalRef: row.external_ref,
    idempotencyKey: row.idempotency_key,
    paymentTransactionId: row.payment_transaction_id,
    paymentId: row.payment_id,
    amount: typeof row.amount === "string" ? Number(row.amount) : row.amount,
    status: row.status,
    type: row.type,
    barId: row.bar_id,
    cajaId: row.caja_id,
    eventId: row.event_id,
    qrData: row.qr_data,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS =
  "id, order_id_mp, external_ref, idempotency_key, payment_transaction_id, payment_id, amount, status, type, bar_id, caja_id, event_id, qr_data, expires_at, created_at, updated_at";

export interface MpOrdersRepository {
  create(order: NewMpOrder): Promise<MpOrder>;
  findByMpId(orderIdMp: string): Promise<MpOrder | null>;
  findByPaymentId(paymentId: string): Promise<MpOrder | null>;
  findByExternalRef(externalRef: string): Promise<MpOrder | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<MpOrder | null>;
  update(orderIdMp: string, patch: MpOrderUpdate): Promise<MpOrder>;
  updateStatus(orderIdMp: string, status: MpOrderStatus): Promise<MpOrder>;
}

export class SupabaseMpOrdersRepository implements MpOrdersRepository {
  async create(order: NewMpOrder): Promise<MpOrder> {
    const { data, error } = await supabase
      .from("mp_orders")
      .insert({
        order_id_mp: order.orderIdMp,
        external_ref: order.externalRef,
        idempotency_key: order.idempotencyKey,
        payment_transaction_id: order.paymentTransactionId ?? null,
        payment_id: order.paymentId ?? null,
        amount: order.amount,
        status: order.status,
        type: order.type,
        bar_id: order.barId ?? null,
        caja_id: order.cajaId ?? null,
        event_id: order.eventId ?? null,
        qr_data: order.qrData ?? null,
        expires_at: order.expiresAt ?? null,
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error creating mp_order:", error);
      throw error;
    }

    return mapMpOrderRow(data as MpOrderRow);
  }

  async findByMpId(orderIdMp: string): Promise<MpOrder | null> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("order_id_mp", orderIdMp)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error finding by order_id_mp:", error);
      throw error;
    }

    return data ? mapMpOrderRow(data as MpOrderRow) : null;
  }

  async findByPaymentId(paymentId: string): Promise<MpOrder | null> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error finding by payment_id:", error);
      throw error;
    }

    return data ? mapMpOrderRow(data as MpOrderRow) : null;
  }

  async findByExternalRef(externalRef: string): Promise<MpOrder | null> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("external_ref", externalRef)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error finding by external_ref:", error);
      throw error;
    }

    return data ? mapMpOrderRow(data as MpOrderRow) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<MpOrder | null> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error finding by idempotency_key:", error);
      throw error;
    }

    return data ? mapMpOrderRow(data as MpOrderRow) : null;
  }

  async update(orderIdMp: string, patch: MpOrderUpdate): Promise<MpOrder> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.paymentId !== undefined) payload.payment_id = patch.paymentId;
    if (patch.paymentTransactionId !== undefined) {
      payload.payment_transaction_id = patch.paymentTransactionId;
    }

    const { data, error } = await supabase
      .from("mp_orders")
      .update(payload)
      .eq("order_id_mp", orderIdMp)
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error updating mp_order:", error);
      throw error;
    }

    return mapMpOrderRow(data as MpOrderRow);
  }

  async updateStatus(orderIdMp: string, status: MpOrderStatus): Promise<MpOrder> {
    return this.update(orderIdMp, { status });
  }
}
