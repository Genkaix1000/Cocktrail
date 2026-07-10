import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import VentaSection from "./VentaSection";
import { mercadopagoService } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";

import type { Drink, Order } from "@cocktrail/shared";

// VentaSection instancia useCheckout (que pega contra mercadopagoService y
// ordersService) — se mockean ambos servicios para no pegarle a la API real.
vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    createPosIntent: vi.fn(),
    getPosIntentStatus: vi.fn(),
    cancelPosIntent: vi.fn(),
  },
}));

vi.mock("@/services/orders.service", () => ({
  ordersService: {
    create: vi.fn(),
  },
}));

const mockedMercadopagoService = vi.mocked(mercadopagoService);
const mockedOrdersService = vi.mocked(ordersService);

function makeDrink(overrides: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Fernet con Coca",
    price: 2500,
    description: "Clásico",
    vibe: "party",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order & { printed: boolean } {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "cajera1",
    printed: true,
    ...overrides,
  };
}

const printer = {
  reprintTicket: vi.fn(),
  printError: null as string | null,
  reprinting: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function waitForProductsGrid() {
  // El grid tiene un skeleton simulado de 800ms antes de mostrar productos.
  await screen.findAllByRole("button", { name: /agregar/i }, { timeout: 3000 });
}

async function addFirstDrinkToCart() {
  const user = userEvent.setup();
  await waitForProductsGrid();
  // El shell renderiza a la vez el grid mobile (DrinkCard) y el desktop
  // (CompactDrinkCard) — jsdom no filtra por media query, así que ambos
  // matchean "Agregar"; cualquiera de los dos llama a addToCart(d.id).
  const [addButton] = screen.getAllByRole("button", { name: /agregar/i });
  await user.click(addButton!);
  return user;
}

describe("VentaSection", () => {
  it("renderiza el grid de productos", async () => {
    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);

    expect((await screen.findAllByText("Fernet con Coca", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });

  it("agrega y quita productos del carrito", async () => {
    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    // El carrito lateral (desktop) refleja la cantidad de items agregados.
    const cartBadge = await screen.findByText("Pedido actual");
    const badgeCount = cartBadge.closest("div")?.querySelector(".tabular");
    expect(badgeCount).toHaveTextContent("1");

    const removeButton = screen.getAllByLabelText("Restar")[0];
    await user.click(removeButton);

    // Al quitar el único item, el carrito vuelve a estar vacío.
    expect(await screen.findByText("Sin items")).toBeInTheDocument();
  });

  it("abre el checkout con el total del pedido actual", async () => {
    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
    expect(screen.getAllByText("$2.500").length).toBeGreaterThan(0);
  });

  it("abre el checkout con Enter cuando el carrito tiene items (atajo de teclado)", async () => {
    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);
    await addFirstDrinkToCart();

    fireEvent.keyDown(window, { key: "Enter" });

    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
  });

  it("completa un pago en efectivo exitoso", async () => {
    const order = makeOrder();
    mockedOrdersService.create.mockResolvedValue(order);

    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    const efectivoButton = await screen.findByRole("button", { name: /efectivo/i });
    await user.click(efectivoButton);

    const amountInput = screen.getByPlaceholderText("0");
    await user.type(amountInput, "5000");

    const confirmButton = screen.getByRole("button", { name: /pedido concretado/i });
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockedOrdersService.create).toHaveBeenCalledWith({
        items: [{ drinkId: 1, qty: 1 }],
        paymentMethod: "efectivo",
      }),
    );

    expect(await screen.findByText("¡Cobro Concretado!")).toBeInTheDocument();
    expect(screen.getByText(`#${order.displayNumber}`)).toBeInTheDocument();
  });

  it("inicia un pago con Posnet llamando a createPosIntent", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue({ id: "intent-1" });
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ state: "OPEN", status: "OPEN" });

    render(<VentaSection drinks={[makeDrink()]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    const tarjetaButton = await screen.findByRole("button", { name: /tarjeta/i });
    await user.click(tarjetaButton);

    await waitFor(() =>
      expect(mockedMercadopagoService.createPosIntent).toHaveBeenCalledWith(2500, "Fernet con Coca x1"),
    );

    expect(await screen.findByText(/Esperando pago con Tarjeta/i)).toBeInTheDocument();
  });
});
