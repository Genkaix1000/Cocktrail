import { supabase } from "../../shared/supabase.js";

export type MpOrderStatus =
  | "created"
  | "processed"
  | "canceled"
  | "refunded"
  | "expired"
  | "failed"
  | "action_required"
  | "unknown"
  | "rejected";
export type MpOrderType = "qr" | "point";
export type MpFeeStatus = "none" | "pending" | "ready" | "unavailable";

export type MpCartItem = { drinkId: number; qty: number };

export type MpOrder = {
  id: string;
  orderIdMp: string;
  externalRef: string;
  idempotencyKey: string;
  paymentTransactionId: string | null;
  paymentId: string | null;
  /** ⚠ En PESOS (la conversión a centavos vive solo en el borde de la Point API). */
  amount: number;
  status: MpOrderStatus;
  type: MpOrderType;
  barId: string | null;
  cajaId: string | null;
  eventId: string | null;
  qrData: string | null;
  expiresAt: string | null;
  deviceId: string | null;
  attemptId: string | null;
  rawState: string | null;
  paymentStatus: string | null;
  paymentStatusDetail: string | null;
  /** ⚠ En PESOS. */
  paidAmount: number | null;
  /** Neto acreditado al seller según MP (pesos). */
  netReceivedAmount: number | null;
  /** Comisión / descuento total = bruto − neto (pesos). */
  mpFeeAmount: number | null;
  feeStatus: MpFeeStatus;
  verifiedAt: string | null;
  verificationError: string | null;
  cartItems: MpCartItem[] | null;
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
  deviceId?: string | null;
  attemptId?: string | null;
  rawState?: string | null;
  paymentStatus?: string | null;
  paymentStatusDetail?: string | null;
  paidAmount?: number | null;
  netReceivedAmount?: number | null;
  mpFeeAmount?: number | null;
  feeStatus?: MpFeeStatus;
  verifiedAt?: string | null;
  cartItems?: MpCartItem[] | null;
};

export type MpOrderUpdate = {
  status?: MpOrderStatus;
  paymentId?: string | null;
  paymentTransactionId?: string | null;
  rawState?: string | null;
  paymentStatus?: string | null;
  paymentStatusDetail?: string | null;
  paidAmount?: number | null;
  netReceivedAmount?: number | null;
  mpFeeAmount?: number | null;
  feeStatus?: MpFeeStatus;
  verifiedAt?: string | null;
  verificationError?: string | null;
};

export type MpEventFeeTotals = {
  mpFeeTotal: number;
  /** Suma de netos ready; si pending, usa paid_amount como techo hasta completar. */
  mpNetTotal: number;
  pendingFees: number;
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
  device_id: string | null;
  attempt_id: string | null;
  raw_state: string | null;
  payment_status: string | null;
  payment_status_detail: string | null;
  paid_amount: number | string | null;
  net_received_amount: number | string | null;
  mp_fee_amount: number | string | null;
  fee_status: MpFeeStatus | null;
  verified_at: string | null;
  verification_error: string | null;
  cart_items: MpCartItem[] | null;
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
    deviceId: row.device_id,
    attemptId: row.attempt_id,
    rawState: row.raw_state,
    paymentStatus: row.payment_status,
    paymentStatusDetail: row.payment_status_detail,
    paidAmount: row.paid_amount == null ? null : Number(row.paid_amount),
    netReceivedAmount: row.net_received_amount == null ? null : Number(row.net_received_amount),
    mpFeeAmount: row.mp_fee_amount == null ? null : Number(row.mp_fee_amount),
    feeStatus: row.fee_status ?? "none",
    verifiedAt: row.verified_at,
    verificationError: row.verification_error,
    cartItems: row.cart_items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS =
  "id, order_id_mp, external_ref, idempotency_key, payment_transaction_id, payment_id, amount, status, type, bar_id, caja_id, event_id, qr_data, expires_at, device_id, attempt_id, raw_state, payment_status, payment_status_detail, paid_amount, net_received_amount, mp_fee_amount, fee_status, verified_at, verification_error, cart_items, created_at, updated_at";

export interface MpOrdersRepository {
  create(order: NewMpOrder): Promise<MpOrder>;
  findByMpId(orderIdMp: string): Promise<MpOrder | null>;
  findByPaymentId(paymentId: string): Promise<MpOrder | null>;
  findByExternalRef(externalRef: string): Promise<MpOrder | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<MpOrder | null>;
  /** Puede haber varios intents por attempt (retry 2205) — devuelve el más nuevo. */
  findByAttemptId(attemptId: string): Promise<MpOrder | null>;
  findProcessedPendingFees(limit: number): Promise<MpOrder[]>;
  sumFeesForEvent(eventId: string): Promise<MpEventFeeTotals>;
  /** Diagnóstico admin: últimos N por created_at (sin qrData/cartItems). */
  listRecent(limit: number): Promise<MpOrder[]>;
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
        device_id: order.deviceId ?? null,
        attempt_id: order.attemptId ?? null,
        raw_state: order.rawState ?? null,
        payment_status: order.paymentStatus ?? null,
        payment_status_detail: order.paymentStatusDetail ?? null,
        paid_amount: order.paidAmount ?? null,
        net_received_amount: order.netReceivedAmount ?? null,
        mp_fee_amount: order.mpFeeAmount ?? null,
        fee_status: order.feeStatus ?? "none",
        verified_at: order.verifiedAt ?? null,
        cart_items: order.cartItems ?? null,
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

  async findByAttemptId(attemptId: string): Promise<MpOrder | null> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("attempt_id", attemptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error finding by attempt_id:", error);
      throw error;
    }

    return data ? mapMpOrderRow(data as MpOrderRow) : null;
  }

  async findProcessedPendingFees(limit: number): Promise<MpOrder[]> {
    // `none` = filas pre-F5A (default de migración); `pending` = cobro nuevo sin neto aún.
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .eq("status", "processed")
      .in("fee_status", ["pending", "none"])
      .not("payment_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(Math.max(1, Math.min(limit, 200)));

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error listing pending fees:", error);
      throw error;
    }
    return (data as MpOrderRow[] | null)?.map(mapMpOrderRow) ?? [];
  }

  async listRecent(limit: number): Promise<MpOrder[]> {
    const capped = Math.max(1, Math.min(Math.floor(limit) || 20, 50));
    const { data, error } = await supabase
      .from("mp_orders")
      .select(SELECT_COLS)
      .order("created_at", { ascending: false })
      .limit(capped);

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error listing recent:", error);
      throw error;
    }

    return ((data as MpOrderRow[] | null) ?? []).map((row) => ({
      ...mapMpOrderRow(row),
      qrData: null,
      cartItems: null,
    }));
  }

  async sumFeesForEvent(eventId: string): Promise<MpEventFeeTotals> {
    const { data, error } = await supabase
      .from("mp_orders")
      .select("paid_amount, net_received_amount, mp_fee_amount, fee_status, status")
      .eq("event_id", eventId)
      .eq("status", "processed");

    if (error) {
      console.error("[SupabaseMpOrdersRepository] Error summing fees for event:", error);
      throw error;
    }

    let mpFeeTotal = 0;
    let mpNetTotal = 0;
    let pendingFees = 0;
    for (const row of data ?? []) {
      const feeStatus = (row.fee_status as MpFeeStatus | null) ?? "none";
      const paid = row.paid_amount == null ? 0 : Number(row.paid_amount);
      const net = row.net_received_amount == null ? null : Number(row.net_received_amount);
      const fee = row.mp_fee_amount == null ? null : Number(row.mp_fee_amount);
      if (feeStatus === "ready" && fee != null && net != null) {
        mpFeeTotal += fee;
        mpNetTotal += net;
      } else {
        pendingFees += 1;
        mpNetTotal += paid;
      }
    }
    return { mpFeeTotal, mpNetTotal, pendingFees };
  }

  async update(orderIdMp: string, patch: MpOrderUpdate): Promise<MpOrder> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.paymentId !== undefined) payload.payment_id = patch.paymentId;
    if (patch.paymentTransactionId !== undefined) {
      payload.payment_transaction_id = patch.paymentTransactionId;
    }
    if (patch.rawState !== undefined) payload.raw_state = patch.rawState;
    if (patch.paymentStatus !== undefined) payload.payment_status = patch.paymentStatus;
    if (patch.paymentStatusDetail !== undefined) payload.payment_status_detail = patch.paymentStatusDetail;
    if (patch.paidAmount !== undefined) payload.paid_amount = patch.paidAmount;
    if (patch.netReceivedAmount !== undefined) payload.net_received_amount = patch.netReceivedAmount;
    if (patch.mpFeeAmount !== undefined) payload.mp_fee_amount = patch.mpFeeAmount;
    if (patch.feeStatus !== undefined) payload.fee_status = patch.feeStatus;
    if (patch.verifiedAt !== undefined) payload.verified_at = patch.verifiedAt;
    if (patch.verificationError !== undefined) payload.verification_error = patch.verificationError;

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
