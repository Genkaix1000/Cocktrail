import { randomUUID } from "node:crypto";
import type { CashSale, NewCashSaleInput, NightEvent } from "@cocktrail/shared";
import type { CashSalesRepository } from "./cash-sales.repository.js";
import { BadRequest, Conflict } from "../../shared/errors/http-errors.js";
import { emit } from "../../shared/sse/sse-manager.js";

export class CashSalesService {
  constructor(
    private repo: CashSalesRepository,
    private getActiveEvent: () => Promise<NightEvent | null>,
  ) {}

  async addCashSale(input: NewCashSaleInput, addedBy: string): Promise<CashSale> {
    const event = await this.getActiveEvent();
    if (!event || event.status !== "activo") {
      throw new Conflict("No hay un evento activo.");
    }
    if (input.amount <= 0) throw new BadRequest("Monto inválido.");

    const cashSale: CashSale = {
      id: randomUUID(),
      amount: input.amount,
      description: input.description,
      addedBy,
      createdAt: Date.now(),
    };

    await this.repo.add(cashSale, event.id);
    emit({ type: "cash_sale.added", cashSale });
    return cashSale;
  }

  async listCashSales(): Promise<CashSale[]> {
    const event = await this.getActiveEvent();
    if (!event) return [];
    return this.repo.listForEvent(event.id);
  }
}
