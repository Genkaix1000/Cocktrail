import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CartaSection from "./CartaSection";
import { drinksService } from "@/services/drinks.service";
import { useTheme } from "@/components/ThemeProvider";

import type { Drink } from "@cocktrail/shared";

vi.mock("@/services/drinks.service", () => ({
  drinksService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

const mockedDrinksService = vi.mocked(drinksService);
const mockedUseTheme = vi.mocked(useTheme);

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
  mockedUseTheme.mockReturnValue({
    theme: "bosko",
    useLogoUrl: true,
    logoUrl: "/bosko.webp",
    logoSize: 56,
    textLogoValue: "Bosko",
    textLogoSize: 26,
    isDark: true,
    toggleDark: vi.fn(),
  });
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
    // El contador está partido en varios text nodes por la interpolación JSX
    // ("... {drinks.length} tragos registrados."), por eso se matchea por
    // textContent en vez de por string exacto.
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

    await user.click(screen.getByRole("button", { name: /Nuevo Trago/i }));

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

  it("elimina un trago tras confirmar el texto exacto en SafeDeleteModal", async () => {
    const user = userEvent.setup();
    const existing = makeDrink({ id: 1, name: "Fernet con Coca" });
    mockedDrinksService.list.mockResolvedValue([existing]);
    mockedDrinksService.delete.mockResolvedValue({ ok: true });

    render(<CartaSection />);

    await screen.findByText("Fernet con Coca");

    await user.click(screen.getByTitle("Eliminar"));

    // SafeDeleteModal usa `expectedText` (el nombre del trago) como placeholder.
    const input = await screen.findByPlaceholderText("Fernet con Coca");
    await user.type(input, "Fernet con Coca");

    // Hay dos botones "Eliminar" en pantalla (el ícono de la fila y el submit
    // del modal): escopeamos al form del modal para evitar ambigüedad.
    const modalForm = input.closest("form")!;
    await user.click(within(modalForm).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(mockedDrinksService.delete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument());
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
    // El panel de edición no debe abrirse: el toggle detiene la propagación del click de fila.
    expect(screen.queryByText("Editar Trago")).not.toBeInTheDocument();
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

  it("filtra por búsqueda de nombre", async () => {
    const user = userEvent.setup();
    mockedDrinksService.list.mockResolvedValue([
      makeDrink({ id: 1, name: "Fernet con Coca" }),
      makeDrink({ id: 2, name: "Gin Tonic" }),
    ]);

    render(<CartaSection />);
    await screen.findByText("Fernet con Coca");

    await user.type(screen.getByPlaceholderText("Buscar por nombre..."), "gin");

    expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument();
    expect(screen.getByText("Gin Tonic")).toBeInTheDocument();
  });
});
