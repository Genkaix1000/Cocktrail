import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CajaSessionOnboarding from "./CajaSessionOnboarding";
import type { BarSessionOption } from "@/services/bar-sessions.service";

const boxes: BarSessionOption[] = [
  {
    barId: "bar-vip",
    name: "Caja VIP",
    code: "BARRA-01",
    status: "available",
    session: null,
  },
  {
    barId: "bar-terraza",
    name: "Caja Terraza",
    code: "BARRA-02",
    status: "occupied",
    session: {
      username: "marina",
      connectedAt: "2026-07-17T22:30:00.000Z",
    },
  },
];

function renderOnboarding(overrides: Partial<React.ComponentProps<typeof CajaSessionOnboarding>> = {}) {
  const props: React.ComponentProps<typeof CajaSessionOnboarding> = {
    username: "caja",
    boxes,
    joiningBarId: null,
    refreshing: false,
    error: null,
    onJoin: vi.fn(),
    onRefresh: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<CajaSessionOnboarding {...props} />);
  return props;
}

describe("CajaSessionOnboarding", () => {
  it("muestra cajas libres y ocupadas con el nombre del cajero", () => {
    renderOnboarding();

    expect(screen.getByRole("heading", { name: "Elegí una caja" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Caja VIP/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Caja Terraza/ })).toBeDisabled();
    expect(screen.getByText("Sesión en uso")).toBeInTheDocument();
    expect(screen.getByText("marina")).toBeInTheDocument();
  });

  it("conecta al seleccionar una caja disponible", async () => {
    const user = userEvent.setup();
    const props = renderOnboarding();

    await user.click(screen.getByRole("button", { name: /Caja VIP/ }));

    expect(props.onJoin).toHaveBeenCalledWith("bar-vip");
  });

  it("permite cerrar la sesión desde el onboarding", async () => {
    const user = userEvent.setup();
    const props = renderOnboarding();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(props.onLogout).toHaveBeenCalledOnce();
  });

  it("muestra el estado sin cajas configuradas", () => {
    renderOnboarding({ boxes: [] });

    expect(screen.getByText("No hay cajas configuradas")).toBeInTheDocument();
  });
});
