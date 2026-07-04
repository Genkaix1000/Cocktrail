import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OSHeadbar, OSProfileFooter } from "./OSHeadbar";
import { useTheme } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

const mockedUseTheme = vi.mocked(useTheme);

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

describe("OSHeadbar", () => {
  it("muestra el badge con la pantalla activa", () => {
    render(<OSHeadbar activeScreen="Admin" />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});

describe("OSProfileFooter", () => {
  it("muestra las iniciales del usuario y el rol", () => {
    render(<OSProfileFooter onLogout={vi.fn()} username="manuel" role="admin" />);
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("usa 'Admin'/'Personal' como fallback sin username/role", () => {
    render(<OSProfileFooter onLogout={vi.fn()} />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("pide confirmación antes de cerrar sesión y permite cancelar", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<OSProfileFooter onLogout={onLogout} username="manuel" role="admin" />);

    await user.click(screen.getByTitle("Cerrar Sesión"));
    expect(screen.getByText("¿Cerrar sesión?")).toBeInTheDocument();

    await user.click(screen.getByTitle("Cancelar"));
    expect(screen.queryByText("¿Cerrar sesión?")).not.toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("llama a onLogout al confirmar", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(<OSProfileFooter onLogout={onLogout} username="manuel" role="admin" />);

    await user.click(screen.getByTitle("Cerrar Sesión"));
    await user.click(screen.getByTitle("Confirmar"));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("llama a toggleDark al tocar el ícono de tema", async () => {
    const toggleDark = vi.fn();
    mockedUseTheme.mockReturnValue({
      theme: "bosko",
      useLogoUrl: true,
      logoUrl: "/bosko.webp",
      logoSize: 56,
      textLogoValue: "Bosko",
      textLogoSize: 26,
      isDark: true,
      toggleDark,
    });
    const user = userEvent.setup();
    render(<OSProfileFooter onLogout={vi.fn()} />);
    await user.click(screen.getByTitle("Cambiar a modo día"));
    expect(toggleDark).toHaveBeenCalledTimes(1);
  });
});
