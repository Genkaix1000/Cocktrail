import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CartaSection from "./CartaSection";
import { drinksService } from "@/services/drinks.service";
import { CARTA_COLS_STORAGE_KEY } from "./cartaCrud";

import type { Drink } from "@cocktrail/shared";

vi.mock("@/services/drinks.service", () => ({
  drinksService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/drink-categories.service", () => ({
  drinkCategoriesService: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedDrinksService = vi.mocked(drinksService);

function makeDrink(overrides: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Fernet con Coca",
    price: 5500,
    description: "",
    vibe: "",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(CARTA_COLS_STORAGE_KEY);
});

describe("CartaSection", () => {
  it("lista los tragos existentes", async () => {
    mockedDrinksService.list.mockResolvedValue([
      makeDrink({ id: 1, name: "Fernet con Coca", price: 5500 }),
      makeDrink({ id: 2, name: "Gin Tonic", price: 6000 }),
    ]);

    render(<CartaSection />);

    expect(await screen.findByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.getByText("Gin Tonic")).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === "Gestioná los tragos de tu boliche. 2 tragos registrados."),
    ).toBeInTheDocument();
  });

  it("crea un trago nuevo desde el panel lateral", async () => {
    const user = userEvent.setup();
    mockedDrinksService.list.mockResolvedValue([]);
    const created = makeDrink({ id: 10, name: "Campari Spritz", price: 4800 });
    mockedDrinksService.create.mockResolvedValue(created);

    render(<CartaSection />);

    await screen.findByText("No hay tragos registrados");

    await user.click(screen.getByRole("button", { name: /Nuevo trago/i }));

    await user.type(screen.getByPlaceholderText("Fernet con Coca"), "Campari Spritz");
    await user.type(screen.getByPlaceholderText("5500"), "4800");

    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(mockedDrinksService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Campari Spritz", price: 4800 }),
      ),
    );
    expect(await screen.findByText("Campari Spritz")).toBeInTheDocument();
    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
  });

  it("edita un trago existente al hacer click en la fila", async () => {
    const user = userEvent.setup();
    const existing = makeDrink({ id: 1, name: "Fernet con Coca", price: 5500 });
    mockedDrinksService.list.mockResolvedValue([existing]);
    const updated = { ...existing, name: "Fernet Branca", price: 5800 };
    mockedDrinksService.update.mockResolvedValue(updated);

    render(<CartaSection />);

    const row = await screen.findByText("Fernet con Coca");
    await user.click(row);

    const nameInput = screen.getByPlaceholderText("Fernet con Coca");
    await user.clear(nameInput);
    await user.type(nameInput, "Fernet Branca");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockedDrinksService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: "Fernet Branca" }),
      ),
    );
    expect(await screen.findByText("Fernet Branca")).toBeInTheDocument();
  });

  it("elimina un trago con ConfirmRail y Deshacer cancela el DELETE", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const existing = makeDrink({ id: 1, name: "Fernet con Coca" });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.delete.mockResolvedValue({ ok: true });

    try {
      render(<CartaSection />);
      await screen.findByText("Fernet con Coca");

      await user.click(screen.getByTitle("Eliminar"));
      expect(await screen.findByText("¿Eliminar?")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Confirmar" }));

      await waitFor(() => expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument());
      expect(await screen.findByText("Eliminado: Fernet con Coca")).toBeInTheDocument();
      expect(mockedDrinksService.delete).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Deshacer" }));
      expect(await screen.findByText("Fernet con Coca")).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(6000);
      expect(mockedDrinksService.delete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirma el DELETE a la API cuando expira la ventana de Deshacer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const existing = makeDrink({ id: 1, name: "Fernet con Coca" });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.delete.mockResolvedValue({ ok: true });

    try {
      render(<CartaSection />);
      await screen.findByText("Fernet con Coca");

      await user.click(screen.getByTitle("Eliminar"));
      await user.click(await screen.findByRole("button", { name: "Confirmar" }));
      await waitFor(() => expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument());

      await vi.advanceTimersByTimeAsync(5000);
      await waitFor(() => expect(mockedDrinksService.delete).toHaveBeenCalledWith(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it("togglea disponibilidad de un trago sin abrir el panel de edición", async () => {
    const user = userEvent.setup();
    const existing = makeDrink({ id: 1, name: "Fernet con Coca", available: true });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.update.mockResolvedValue({ ...existing, available: false });

    render(<CartaSection />);

    await screen.findByText("Fernet con Coca");
    await user.click(screen.getByTitle("Ocultar de la carta"));

    await waitFor(() =>
      expect(mockedDrinksService.update).toHaveBeenCalledWith(1, { available: false }),
    );
    expect(screen.queryByText("Editar trago")).not.toBeInTheDocument();
  });

  it("muestra un error distinguible de 'carta vacía' si falla la carga inicial, con reintento", async () => {
    const user = userEvent.setup();
    mockedDrinksService.list.mockRejectedValueOnce(new Error("network down"));
    mockedDrinksService.list.mockResolvedValueOnce([makeDrink({ id: 1, name: "Fernet con Coca" })]);

    render(<CartaSection />);

    expect(await screen.findByText("No se pudo cargar la carta. Revisá tu conexión.")).toBeInTheDocument();
    expect(screen.queryByText("No hay tragos registrados")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Fernet con Coca")).toBeInTheDocument();
  });

  it("muestra un toast de error si falla el guardado de un trago", async () => {
    const user = userEvent.setup();
    mockedDrinksService.list.mockResolvedValue([]);
    mockedDrinksService.create.mockRejectedValue(new Error("network down"));

    render(<CartaSection />);
    await screen.findByText("No hay tragos registrados");

    await user.click(screen.getByRole("button", { name: /Nuevo trago/i }));
    await user.type(screen.getByPlaceholderText("Fernet con Coca"), "Campari Spritz");
    await user.type(screen.getByPlaceholderText("5500"), "4800");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText(/No se pudo guardar el trago/i)).toBeInTheDocument();
  });

  it("muestra un toast de error si falla la eliminación de un trago", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const existing = makeDrink({ id: 1, name: "Fernet con Coca" });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.delete.mockRejectedValue(new Error("network down"));

    try {
      render(<CartaSection />);
      await screen.findByText("Fernet con Coca");
      await user.click(screen.getByTitle("Eliminar"));
      await user.click(await screen.findByRole("button", { name: "Confirmar" }));
      await waitFor(() => expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument());

      await vi.advanceTimersByTimeAsync(5000);
      expect(await screen.findByText(/No se pudo eliminar el trago/i)).toBeInTheDocument();
      expect(await screen.findByText("Fernet con Coca")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("muestra un toast de error si falla el toggle de disponibilidad", async () => {
    const user = userEvent.setup();
    const existing = makeDrink({ id: 1, name: "Fernet con Coca", available: true });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.update.mockRejectedValue(new Error("network down"));

    render(<CartaSection />);
    await screen.findByText("Fernet con Coca");
    await user.click(screen.getByTitle("Ocultar de la carta"));

    expect(await screen.findByText(/No se pudo actualizar la disponibilidad/i)).toBeInTheDocument();
  });

  it("filtra por búsqueda de nombre y por vista En carta / Ocultos", async () => {
    const user = userEvent.setup();
    mockedDrinksService.list.mockResolvedValue([
      makeDrink({ id: 1, name: "Fernet con Coca", available: true }),
      makeDrink({ id: 2, name: "Gin Tonic", available: false }),
    ]);

    render(<CartaSection />);
    await screen.findByText("Fernet con Coca");

    await user.type(screen.getByPlaceholderText("Buscar por nombre…"), "gin");

    expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument();
    expect(screen.getByText("Gin Tonic")).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("Buscar por nombre…"));
    await user.click(screen.getByRole("button", { name: "En carta" }));
    expect(screen.getByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.queryByText("Gin Tonic")).not.toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === "Gestioná los tragos de tu boliche. 1 trago visible."),
    ).toBeInTheDocument();
  });
});
