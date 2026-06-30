import type { CashSale } from "@cocktrail/shared";
import { supabase } from "../../shared/supabase.js";

export interface CashSalesRepository {
  add(sale: CashSale, eventId: string): Promise<CashSale>;
  listForEvent(eventId: string): Promise<CashSale[]>;
  clear(): Promise<void>;
}

export class InMemoryCashSalesRepository implements CashSalesRepository {
  private sales = new Map<string, { sale: CashSale; eventId: string }>();

  async add(sale: CashSale, eventId: string): Promise<CashSale> {
    this.sales.set(sale.id, { sale, eventId });
    return sale;
  }

  async listForEvent(eventId: string): Promise<CashSale[]> {
    return Array.from(this.sales.values())
      .filter((entry) => entry.eventId === eventId)
      .map((entry) => entry.sale)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async clear(): Promise<void> {
    this.sales.clear();
  }
}

export class SupabaseCashSalesRepository implements CashSalesRepository {
  async add(sale: CashSale, eventId: string): Promise<CashSale> {
    const { data, error } = await supabase
      .from("cash_sales")
      .insert({
        id: sale.id,
        event_id: eventId,
        amount: sale.amount,
        description: sale.description,
        added_by: sale.addedBy,
        created_at: new Date(sale.createdAt).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[SupabaseCashSalesRepository] Error adding cash sale:", error);
      throw error;
    }

    return {
      id: data.id,
      amount: data.amount,
      description: data.description,
      addedBy: data.added_by,
      createdAt: new Date(data.created_at).getTime(),
    };
  }

  async listForEvent(eventId: string): Promise<CashSale[]> {
    const { data, error } = await supabase
      .from("cash_sales")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseCashSalesRepository] Error listing cash sales:", error);
      throw error;
    }

    return data.map((item: any) => ({
      id: item.id,
      amount: item.amount,
      description: item.description,
      addedBy: item.added_by,
      createdAt: new Date(item.created_at).getTime(),
    }));
  }

  async clear(): Promise<void> {
    // In SQL context, we don't clear the database table entirely to preserve history
    // if needed. But if a clear is requested, we could delete active event records.
    // However, to avoid unintended deletion, we do nothing or only delete if required.
    // For V1 local DB, we preserve records.
  }
}
