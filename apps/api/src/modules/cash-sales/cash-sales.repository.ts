import type { CashSale } from "@cocktrail/shared";

export interface CashSalesRepository {
  add(sale: CashSale): CashSale;
  list(): CashSale[];
  clear(): void;
}

export class InMemoryCashSalesRepository implements CashSalesRepository {
  private sales = new Map<string, CashSale>();

  add(sale: CashSale): CashSale {
    this.sales.set(sale.id, sale);
    return sale;
  }

  list(): CashSale[] {
    return Array.from(this.sales.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  clear(): void {
    this.sales.clear();
  }
}
