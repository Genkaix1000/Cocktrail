import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CashSaleModal from "./CashSaleModal";
import { cashSalesService } from "@/services/cash-sales.service";

import type { CashSale } from "@cocktrail/shared";

vi.mock("@/services/cash-sales.service", () => ({
  cashSalesService: {
    add: vi.fn(),
    list: vi.fn(),
  },
}));

const mockedCashSalesService = vi.mocked(cashSalesService);

function makeCashSale(overrides: Partial<CashSale> = {}): CashSale {
  return {
    id: "cash-1",
    amount: 5500,
    description: "Venta directa en barra",
    createdAt: Date.now(),
    ...overrides,
  } as CashSale;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CashSaleModal", () => {
  it("no renderiza nada cuando open es false", () => {
    const { container } = render(<CashSaleModal open={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("registra la venta con el monto y la descripción ingresados", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const sale = makeCashSale({ amount: 3000, description: "2 Fernet" });
    mockedCashSalesService.add.mockResolvedValue(sale);

    render(<CashSaleModal open onClose={onClose} />);

    await user.type(screen.getByPlaceholderText("5500"), "3000");
    await user.type(screen.getByPlaceholderText("2 Fernet"), "2 Fernet");
    await user.click(screen.getByRole("button", { name: /Registrar venta/i }));

    await waitFor(() =>
      expect(mockedCashSalesService.add).toHaveBeenCalledWith({
        amount: 3000,
        description: "2 Fernet",
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("usa la descripción por defecto cuando se deja vacía", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockedCashSalesService.add.mockResolvedValue(makeCashSale());

    render(<CashSaleModal open onClose={onClose} />);

    await user.type(screen.getByPlaceholderText("5500"), "1000");
    await user.click(screen.getByRole("button", { name: /Registrar venta/i }));

    await waitFor(() =>
      expect(mockedCashSalesService.add).toHaveBeenCalledWith({
        amount: 1000,
        description: "Venta directa en barra",
      }),
    );
  });

  it("no permite enviar sin un monto", () => {
    render(<CashSaleModal open onClose={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: /Registrar venta/i });
    expect(submitButton).toBeDisabled();
    expect(mockedCashSalesService.add).not.toHaveBeenCalled();
  });

  it("muestra un error cuando el monto es cero o negativo", async () => {
    const user = userEvent.setup();

    render(<CashSaleModal open onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText("5500");
    await user.type(input, "-5");
    const form = input.closest("form")!;
    // fireEvent.submit evita la validación nativa del input (min="1"), que en
    // un browser real ya bloquearía el submit antes de llegar al handler;
    // así ejercitamos igual la validación explícita del componente.
    fireEvent.submit(form);

    expect(await screen.findByText("Ingresá un monto positivo")).toBeInTheDocument();
    expect(mockedCashSalesService.add).not.toHaveBeenCalled();
  });

  it("muestra el error del service cuando falla el registro", async () => {
    const user = userEvent.setup();
    mockedCashSalesService.add.mockRejectedValue(new Error("Sin conexión con la caja"));

    render(<CashSaleModal open onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("5500"), "1000");
    await user.click(screen.getByRole("button", { name: /Registrar venta/i }));

    expect(await screen.findByText("Sin conexión con la caja")).toBeInTheDocument();
  });

  it("limpia el formulario al reabrirse tras cerrarse sin enviar", async () => {
    const user = userEvent.setup();

    const { rerender } = render(<CashSaleModal open onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("5500"), "1000");

    rerender(<CashSaleModal open={false} onClose={vi.fn()} />);
    rerender(<CashSaleModal open onClose={vi.fn()} />);

    const input = (await screen.findByPlaceholderText("5500")) as HTMLInputElement;
    expect(input.value).toBe("");
  });
});
