import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    resolvePosIntent: vi.fn(),
    cancelPosIntent: vi.fn(),
    createQrOrder: vi.fn(),
    getQrOrderStatus: vi.fn(),
    cancelQrOrder: vi.fn(),
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

/** Response del create Posnet con el deadline server-side a futuro (10 min, como el backend). */
function makePosCreated(overrides: Partial<{ id: string; expiresAt: string }> = {}) {
  return {
    id: "intent-1",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

const printer = {
  reprintTicket: vi.fn(),
  printTicketData: vi.fn(),
  printError: null as string | null,
  reprinting: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function seedPendingSale(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    "cocktrail:pendingSales",
    JSON.stringify([
      {
        id: "ps-1",
        createdAt: Date.now(),
        paymentMethod: "qr",
        mpRef: "ORD01QR",
        amount: 2500,
        items: [{ drinkId: 1, qty: 1 }],
        attempts: 1,
        lastError: "network down",
        ...overrides,
      },
    ]),
  );
}

async function waitForProductsGrid() {
  // El grid tiene un skeleton simulado de 800ms antes de mostrar productos.
  await screen.findAllByText("Fernet con Coca", {}, { timeout: 3000 });
}

async function addFirstDrinkToCart() {
  const user = userEvent.setup();
  await waitForProductsGrid();
  // Click en la card (mobile + desktop se montan juntos en jsdom).
  const [name] = screen.getAllByText("Fernet con Coca");
  await user.click(name!);
  return user;
}

describe("VentaSection", () => {
  it("renderiza el grid de productos", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);

    expect((await screen.findAllByText("Fernet con Coca", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
  });

  it("filtra el grid por nombre con el buscador", async () => {
    const user = userEvent.setup();
    render(
      <VentaSection
        drinks={[makeDrink(), makeDrink({ id: 2, name: "Corona" })]}
        categories={[]}
        printer={printer}
      />,
    );
    await waitForProductsGrid();

    await user.type(screen.getByPlaceholderText("Buscar trago…"), "corona");

    expect(screen.getAllByText("Corona").length).toBeGreaterThan(0);
    expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument();
  });

  it("agrega y quita productos del carrito", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    // El carrito lateral (desktop) refleja la cantidad de items agregados.
    const cartBadge = await screen.findByText("Pedido actual");
    const badgeCount = cartBadge.closest("div")?.querySelector(".tabular");
    expect(badgeCount).toHaveTextContent("1");

    const removeButton = screen.getAllByLabelText("Restar")[0];
    await user.click(removeButton);

    // Al quitar el único item, el carrito vuelve a estar vacío.
    expect(await screen.findByText("Sin ítems")).toBeInTheDocument();
  });

  it("abre el checkout con el total del pedido actual", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
    expect(screen.getAllByText("$2.500").length).toBeGreaterThan(0);
  });

  it("abre el checkout con la tecla C cuando el carrito tiene items (atajo de teclado)", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    await addFirstDrinkToCart();

    fireEvent.keyDown(window, { key: "c" });

    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
  });

  it("Enter ya no abre el checkout (evita re-agregar sin querer con el grid resaltado)", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    await addFirstDrinkToCart();

    fireEvent.keyDown(window, { key: "Enter" });

    expect(screen.queryByText("Total a cobrar")).not.toBeInTheDocument();
  });

  it("navega el grid con flechas y agrega el producto resaltado con Enter", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    await waitForProductsGrid();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });

    const cartBadge = await screen.findByText("Pedido actual");
    const badgeCount = cartBadge.closest("div")?.querySelector(".tabular");
    expect(badgeCount).toHaveTextContent("1");
  });

  it("completa un pago en efectivo exitoso", async () => {
    const order = makeOrder();
    mockedOrdersService.create.mockResolvedValue(order);

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
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

  it("el selector de método de pago muestra Efectivo, Tarjeta y Código QR", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    expect(await screen.findByRole("button", { name: /efectivo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tarjeta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /código qr/i })).toBeInTheDocument();
  });

  it("inicia un pago QR llamando a createQrOrder", async () => {
    mockedMercadopagoService.createQrOrder.mockResolvedValue({
      orderId: "ORD01QR",
      qrImage: "https://mp.example/qr.png",
      status: "created",
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    });
    mockedMercadopagoService.getQrOrderStatus.mockResolvedValue({
      orderIdMp: "ORD01QR",
      status: "created",
      paymentId: null,
      amount: 2500,
    });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    const qrButton = await screen.findByRole("button", { name: /código qr/i });
    await user.click(qrButton);

    await waitFor(() =>
      expect(mockedMercadopagoService.createQrOrder).toHaveBeenCalledWith(
        2500,
        "Fernet con Coca x1",
        { idempotencyKey: expect.any(String) },
      ),
    );

    expect(await screen.findByText(/Esperando pago QR/i)).toBeInTheDocument();
  });

  it("inicia un pago con Posnet mandando attemptId + items del carrito", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "PENDING", rawState: "OPEN" });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);

    const tarjetaButton = await screen.findByRole("button", { name: /tarjeta/i });
    await user.click(tarjetaButton);

    await waitFor(() =>
      expect(mockedMercadopagoService.createPosIntent).toHaveBeenCalledWith(
        2500,
        "Fernet con Coca x1",
        { attemptId: expect.any(String), items: [{ drinkId: 1, qty: 1 }] },
      ),
    );

    expect(await screen.findByText(/Esperando pago con Tarjeta/i)).toBeInTheDocument();
  });

  it("un rechazo por fondos insuficientes muestra el motivo real (nunca 'cancelado')", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({
      status: "REJECTED",
      statusDetail: "cc_rejected_insufficient_amount",
      rawState: "FINISHED",
    });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);
    await user.click(await screen.findByRole("button", { name: /tarjeta/i }));

    // El polling corre cada 3s con timers reales.
    expect(
      await screen.findByText(
        /Tarjeta rechazada: fondos insuficientes — pedile al cliente otro medio de pago/i,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cobro cancelado")).not.toBeInTheDocument();
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  }, 10000);

  it("un cobro CANCELED sigue mostrándose como cancelación deliberada", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "CANCELED" });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);
    await user.click(await screen.findByRole("button", { name: /tarjeta/i }));

    expect(await screen.findByText("Cobro cancelado", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  }, 10000);

  it("un cobro EXPIRED muestra la vista de expiración con opción de reintentar", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "EXPIRED" });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);
    await user.click(await screen.findByRole("button", { name: /tarjeta/i }));

    expect(await screen.findByText("El cobro expiró", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(screen.getByText(/expiró sin confirmarse/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reintentar cobro/i })).toBeInTheDocument();
    expect(mockedOrdersService.create).not.toHaveBeenCalled();
  }, 10000);

  it("Escape sin método elegido cierra el checkout por completo", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    await addFirstDrinkToCart();

    fireEvent.keyDown(window, { key: "c" });
    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("Total a cobrar")).not.toBeInTheDocument());
  });

  it("Escape en efectivo vuelve a la selección de método (sin cerrar el checkout)", async () => {
    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);
    const efectivoButton = await screen.findByRole("button", { name: /efectivo/i });
    await user.click(efectivoButton);

    expect(await screen.findByText("Monto Recibido")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
  });

  it("Escape con un cobro Posnet en curso cancela la intención y vuelve a elegir método", async () => {
    mockedMercadopagoService.createPosIntent.mockResolvedValue(makePosCreated());
    mockedMercadopagoService.getPosIntentStatus.mockResolvedValue({ status: "PENDING", rawState: "OPEN" });
    mockedMercadopagoService.cancelPosIntent.mockResolvedValue({ status: "canceled" });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = await addFirstDrinkToCart();

    const cobrarButtons = screen.getAllByRole("button", { name: /cobrar/i });
    await user.click(cobrarButtons[0]);
    const tarjetaButton = await screen.findByRole("button", { name: /tarjeta/i });
    await user.click(tarjetaButton);

    await waitFor(() => expect(mockedMercadopagoService.createPosIntent).toHaveBeenCalled());
    expect(await screen.findByText(/Esperando pago con Tarjeta/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(mockedMercadopagoService.cancelPosIntent).toHaveBeenCalledWith("intent-1"));
    expect(await screen.findByText("Total a cobrar")).toBeInTheDocument();
  });

  it("muestra el banner de ventas cobradas sin registrar al montar", async () => {
    seedPendingSale();

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);

    const banner = await screen.findByRole("alert");
    expect(within(banner).getByText("Hay 1 venta cobrada sin registrar")).toBeInTheDocument();
    expect(within(banner).getByText("$2.500")).toBeInTheDocument();
    expect(within(banner).getByText("QR")).toBeInTheDocument();
    expect(within(banner).getByText(/network down/)).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /descartar/i })).toBeInTheDocument();
  });

  it("Reintentar registra la venta pendiente y limpia el banner", async () => {
    seedPendingSale();
    mockedOrdersService.create.mockResolvedValue(makeOrder({ paymentMethod: "qr" }));

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = userEvent.setup();

    const banner = await screen.findByRole("alert");
    await user.click(within(banner).getByRole("button", { name: /reintentar/i }));

    // La constancia vieja no tiene mpKind: el kind de la prueba se infiere del
    // paymentMethod (retrocompatibilidad) y viaja igual al registro.
    await waitFor(() =>
      expect(mockedOrdersService.create).toHaveBeenCalledWith({
        items: [{ drinkId: 1, qty: 1 }],
        paymentMethod: "qr",
        payment: { provider: "mercadopago", kind: "qr_order", id: "ORD01QR" },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("cocktrail:pendingSales")!)).toEqual([]);
  });

  it("una constancia bloqueada por rechazo no ofrece Reintentar, solo Descartar con el motivo", async () => {
    seedPendingSale({
      paymentMethod: "debito",
      mpRef: "intent-1",
      mpKind: "point_intent",
      blocked: {
        code: "PAYMENT_REJECTED",
        reason: "Cobro rechazado: el pago fue rechazado por MP. No se registró la venta.",
      },
    });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);

    const banner = await screen.findByRole("alert");
    expect(within(banner).queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    expect(
      within(banner).getByText(/El cobro fue rechazado por Mercado Pago — no es una venta por registrar/),
    ).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: /^descartar$/i })).toBeInTheDocument();
  });

  it("una constancia bloqueada por cobro sin verificar pide revisar el panel de MP", async () => {
    seedPendingSale({
      paymentMethod: "debito",
      mpRef: "intent-1",
      mpKind: "point_intent",
      blocked: {
        code: "PAYMENT_UNVERIFIED",
        reason: "No se pudo confirmar el cobro.",
      },
    });

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);

    const banner = await screen.findByRole("alert");
    expect(within(banner).queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    expect(
      within(banner).getByText(/El cobro no se pudo verificar — revisá el panel de Mercado Pago/),
    ).toBeInTheDocument();
  });

  it("si el reintento vuelve a fallar, el banner queda", async () => {
    seedPendingSale();
    mockedOrdersService.create.mockRejectedValue(new Error("sigue caído"));

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = userEvent.setup();

    const banner = await screen.findByRole("alert");
    await user.click(within(banner).getByRole("button", { name: /reintentar/i }));

    await waitFor(() => expect(mockedOrdersService.create).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(await within(screen.getByRole("alert")).findByText(/sigue caído/)).toBeInTheDocument();
  });

  it("Descartar pide confirmación explícita y recién ahí borra la constancia", async () => {
    seedPendingSale();

    render(<VentaSection drinks={[makeDrink()]} categories={[]} printer={printer} />);
    const user = userEvent.setup();

    const banner = await screen.findByRole("alert");
    await user.click(within(banner).getByRole("button", { name: /^descartar$/i }));

    // Todavía no borró nada: apareció la confirmación.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/¿Descartar la constancia\?/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("cocktrail:pendingSales")!)).toHaveLength(1);

    // "No" cancela y deja todo como estaba.
    await user.click(screen.getByRole("button", { name: /^no$/i }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/¿Descartar la constancia\?/)).not.toBeInTheDocument();

    // Descartar → "Sí, descartar" borra de verdad.
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: /^descartar$/i }));
    await user.click(screen.getByRole("button", { name: /sí, descartar/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem("cocktrail:pendingSales")!)).toEqual([]);
  });
});
