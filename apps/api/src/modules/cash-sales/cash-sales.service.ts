import { randomUUID } from "node:crypto";
import type { CashSale, NewCashSaleInput } from "@cocktrail/shared";
import type { CashSalesRepository } from "./cash-sales.repository.js";
import { BadRequest, Conflict } from "../../shared/errors/http-errors.js";
import { emit } from "../../shared/sse/sse-manager.js";

export class CashSalesService {
  constructor(
    private repo: CashSalesRepository,
    private getEventStatus: () => string,
  ) {}

  addCashSale(input: NewCashSaleInput, addedBy: string): CashSale {
    if (this.getEventStatus() !== "activo") {
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

    this.repo.add(cashSale);
    emit({ type: "cash_sale.added", cashSale });
    return cashSale;
  }

  listCashSales(): CashSale[] {
    return this.repo.list();
  }
}
