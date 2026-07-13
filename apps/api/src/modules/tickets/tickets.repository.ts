import { supabase } from "../../shared/supabase.js";

export interface Ticket {
  id: string;
  orderId: string;
  code: string;
  createdAt: number;
  redeemedAt?: number;
  redeemedBy?: string;
  redeemedByBar?: string;
  redeemMethod?: "scan" | "manual";
}

export interface TicketsRepository {
  create(ticket: Ticket): Promise<Ticket>;
  findByCode(code: string): Promise<Ticket | undefined>;
  findByReadable(readable: string): Promise<Ticket | undefined>;
  findByOrderId(orderId: string): Promise<Ticket | undefined>;
  list(): Promise<Ticket[]>;
  /**
   * Condicionado a `redeemed_at IS NULL` — devuelve `undefined` si el ticket ya estaba
   * canjeado en el momento del UPDATE, en vez de pisarlo. Defensa en profundidad: el gate
   * real de la carrera de canje vive en `OrdersRepository.updateStatus` (ver
   * docs/specs/atomicidad-canje-ticket.md), esto no debería activarse en el flujo normal.
   */
  updateRedemption(
    code: string,
    redeemedBy: string,
    meta?: { barCode?: string; method?: "scan" | "manual" },
  ): Promise<Ticket | undefined>;
}

function mapRowToTicket(row: any): Ticket {
  return {
    id: row.id,
    orderId: row.order_id,
    code: row.code,
    createdAt: new Date(row.created_at).getTime(),
    redeemedAt: row.redeemed_at ? new Date(row.redeemed_at).getTime() : undefined,
    redeemedBy: row.redeemed_by || undefined,
    redeemedByBar: row.redeemed_by_bar || undefined,
    redeemMethod: (row.redeem_method as "scan" | "manual") || undefined,
  };
}

export class SupabaseTicketsRepository implements TicketsRepository {
  async create(ticket: Ticket): Promise<Ticket> {
    const { data, error } = await supabase
      .from("tickets")
      .insert({
        id: ticket.id,
        order_id: ticket.orderId,
        code: ticket.code,
        created_at: new Date(ticket.createdAt).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseTicketsRepository] Error creating ticket:", error);
      throw error;
    }

    return mapRowToTicket(data);
  }

  async findByCode(code: string): Promise<Ticket | undefined> {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseTicketsRepository] Error finding ticket by code:", error);
      throw error;
    }

    return data ? mapRowToTicket(data) : undefined;
  }

  async findByReadable(readable: string): Promise<Ticket | undefined> {
    const cleanReadable = readable.toUpperCase().trim();
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .like("code", `${cleanReadable}-%`)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseTicketsRepository] Error finding ticket by readable prefix:", error);
      throw error;
    }

    return data ? mapRowToTicket(data) : undefined;
  }

  async findByOrderId(orderId: string): Promise<Ticket | undefined> {
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseTicketsRepository] Error finding ticket by orderId:", error);
      throw error;
    }

    return data ? mapRowToTicket(data) : undefined;
  }

  async list(): Promise<Ticket[]> {
    const { data, error } = await supabase
      .from("tickets")
      .select("*");

    if (error) {
      console.error("[SupabaseTicketsRepository] Error listing tickets:", error);
      throw error;
    }

    return data.map(mapRowToTicket);
  }

  async updateRedemption(
    code: string,
    redeemedBy: string,
    meta?: { barCode?: string; method?: "scan" | "manual" },
  ): Promise<Ticket | undefined> {
    const { data, error } = await supabase
      .from("tickets")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_by: redeemedBy,
        redeemed_by_bar: meta?.barCode || null,
        redeem_method: meta?.method || null,
      })
      .eq("code", code)
      .is("redeemed_at", null)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[SupabaseTicketsRepository] Error updating ticket redemption:", error);
      throw error;
    }

    return data ? mapRowToTicket(data) : undefined;
  }
}
