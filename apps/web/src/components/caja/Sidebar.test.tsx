import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CajaSidebar from "./Sidebar";

import type { NightEvent } from "@cocktrail/shared";

const adminUser = {
  role: "admin",
  username: "cajera1",
  permissions: {
    closeNight: true,
    cancelarTickets: true,
    historial: true,
    metricas: true,
  },
};

function makeEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "event-1",
    status: "activo",
    startedAt: Date.now(),
    ...overrides,
  } as NightEvent;
}

function makeHasPermission(user: typeof adminUser | null) {
  return (key: keyof typeof adminUser.permissions) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return !!user.permissions?.[key];
  };
}

const baseProps = {
  isDrawer: false as const,
  activeTab: "venta" as const,
  setActiveTab: vi.fn(),
  setMobileMenuOpen: vi.fn(),
  hasPermission: makeHasPermission(adminUser),
  currentUser: adminUser,
  event: makeEvent(),
  setCloseModalOpen: vi.fn(),
  printerStatus: { connected: true, message: "ok" },
  testPrint: vi.fn(),
  pairPrinterDevice: vi.fn(),
  connectPrinter: vi.fn(),
  printerPaired: false,
  printerTestMessage: null as string | null,
  posnetLevel: "ok" as const,
  posnetMessage: "Posnet listo.",
  handleLogout: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CajaSidebar", () => {
  it("muestra los 3 botones de navegación cuando el usuario tiene permisos", () => {
    render(<CajaSidebar {...baseProps} />);

    expect(screen.getByText("Nueva Venta")).toBeInTheDocument();
    expect(screen.getByText("Historial de Ventas")).toBeInTheDocument();
    expect(screen.getByText("Métricas")).toBeInTheDocument();
  });

  it("oculta Historial y Métricas cuando el usuario no tiene el permiso", () => {
    const cajeraSinPermiso = {
      role: "caja",
      username: "cajera2",
      permissions: { ...adminUser.permissions, historial: false, metricas: false },
    };

    render(
      <CajaSidebar
        {...baseProps}
        currentUser={cajeraSinPermiso}
        hasPermission={makeHasPermission(cajeraSinPermiso)}
      />,
    );

    expect(screen.getByText("Nueva Venta")).toBeInTheDocument();
    expect(screen.queryByText("Historial de Ventas")).not.toBeInTheDocument();
    expect(screen.queryByText("Métricas")).not.toBeInTheDocument();
  });

  it("clickear un botón de navegación llama a setActiveTab y cierra el drawer móvil", async () => {
    const user = userEvent.setup();
    const setActiveTab = vi.fn();
    const setMobileMenuOpen = vi.fn();

    render(
      <CajaSidebar
        {...baseProps}
        setActiveTab={setActiveTab}
        setMobileMenuOpen={setMobileMenuOpen}
      />,
    );

    await user.click(screen.getByText("Historial de Ventas"));

    expect(setActiveTab).toHaveBeenCalledWith("historial");
    expect(setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it("muestra el botón Cerrar noche cuando hay permiso closeNight y evento activo", () => {
    render(<CajaSidebar {...baseProps} />);

    expect(screen.getByText("Cerrar noche")).toBeInTheDocument();
  });

  it("oculta el botón Cerrar noche sin permiso closeNight", () => {
    const sinPermiso = {
      ...adminUser,
      role: "caja",
      permissions: { ...adminUser.permissions, closeNight: false },
    };

    render(<CajaSidebar {...baseProps} currentUser={sinPermiso} />);

    expect(screen.queryByText("Cerrar noche")).not.toBeInTheDocument();
  });

  it("oculta el botón Cerrar noche si no hay evento activo", () => {
    render(<CajaSidebar {...baseProps} event={makeEvent({ status: "cerrado" })} />);

    expect(screen.queryByText("Cerrar noche")).not.toBeInTheDocument();
  });

  it("clickear Cerrar noche abre el modal y cierra el drawer", async () => {
    const user = userEvent.setup();
    const setCloseModalOpen = vi.fn();
    const setMobileMenuOpen = vi.fn();

    render(
      <CajaSidebar
        {...baseProps}
        setCloseModalOpen={setCloseModalOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />,
    );

    await user.click(screen.getByText("Cerrar noche"));

    expect(setCloseModalOpen).toHaveBeenCalledWith(true);
    expect(setMobileMenuOpen).toHaveBeenCalledWith(false);
  });

  it("muestra el estado de impresora vinculada y permite testear la impresión", async () => {
    const user = userEvent.setup();
    const testPrint = vi.fn();

    render(<CajaSidebar {...baseProps} testPrint={testPrint} />);

    expect(screen.getByText("Impresora OK")).toBeInTheDocument();

    await user.click(screen.getByText("Ticket de prueba"));
    expect(testPrint).toHaveBeenCalled();
  });

  it("muestra Vincular cuando no hay vínculo y el mensaje de test", async () => {
    const user = userEvent.setup();
    const pairPrinterDevice = vi.fn();
    render(
      <CajaSidebar
        {...baseProps}
        printerStatus={{ connected: false, message: "sin conexión" }}
        pairPrinterDevice={pairPrinterDevice}
        printerTestMessage="Error al imprimir la prueba."
      />,
    );

    expect(screen.getByText("Sin impresora")).toBeInTheDocument();
    expect(screen.queryByText("sin conexión")).not.toBeInTheDocument();
    expect(screen.getByText("Error al imprimir la prueba.")).toBeInTheDocument();
    await user.click(screen.getByText("Vincular"));
    expect(pairPrinterDevice).toHaveBeenCalled();
  });

  it("muestra Cerrar sesión en el rail GENERAL", () => {
    render(<CajaSidebar {...baseProps} />);

    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
  });

  it("muestra el cartel del Posnet listo cuando el nivel es ok", () => {
    render(<CajaSidebar {...baseProps} />);
    expect(screen.getByText("Posnet listo")).toBeInTheDocument();
  });

  it("muestra aviso corto cuando el nivel es warning", () => {
    render(
      <CajaSidebar
        {...baseProps}
        posnetLevel="warning"
        posnetMessage="El lector está en modo STANDALONE: rechaza los cobros por sistema."
      />,
    );

    expect(screen.getByText("Posnet con aviso")).toBeInTheDocument();
    expect(screen.queryByText(/modo STANDALONE/)).not.toBeInTheDocument();
    expect(screen.queryByText("Posnet bloqueado")).not.toBeInTheDocument();
  });

  it("muestra el bloqueo cuando el nivel es blocked", () => {
    render(
      <CajaSidebar
        {...baseProps}
        posnetLevel="blocked"
        posnetMessage="El lector NO aparece en el listado de la cuenta activa."
      />,
    );

    expect(screen.getByText("Posnet bloqueado")).toBeInTheDocument();
  });

  it("un nivel unknown queda neutro (nunca rojo)", () => {
    render(
      <CajaSidebar {...baseProps} posnetLevel="unknown" posnetMessage="No se pudo consultar." />,
    );

    expect(screen.getByText("Posnet")).toBeInTheDocument();
    expect(screen.queryByText("Posnet bloqueado")).not.toBeInTheDocument();
  });

  it("no ofrece Probar Posnet", () => {
    render(<CajaSidebar {...baseProps} />);
    expect(screen.queryByText(/Probar Posnet/i)).not.toBeInTheDocument();
  });
});
