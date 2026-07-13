import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CajaSidebar from "./Sidebar";
import { useTheme } from "@/components/ThemeProvider";

import type { NightEvent } from "@cocktrail/shared";

// CajaSidebar renderiza BrandLogo y OSProfileFooter, que dependen de
// ThemeProvider — se mockea igual que en OSHeadbar.test.tsx.
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
  useThemeSafe: vi.fn(),
}));

const mockedUseTheme = vi.mocked(useTheme);

const adminUser = {
  role: "admin",
  username: "cajera1",
  permissions: {
    closeNight: true,
    modifyCarta: false,
    manageUsers: false,
    monitoreo: false,
    metricas: true,
    historial: true,
    general: false,
    carta: false,
    pagos: false,
    staff: false,
    cancelarTickets: false,
    openNight: true,
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
  theme: "bosko" as const,
  activeTab: "venta" as const,
  setActiveTab: vi.fn(),
  setMobileMenuOpen: vi.fn(),
  hasPermission: makeHasPermission(adminUser),
  currentUser: adminUser,
  event: makeEvent(),
  setCloseModalOpen: vi.fn(),
  printerStatus: { connected: true, message: "ok" },
  testPrint: vi.fn(),
  printerTestMessage: null as string | null,
  handleLogout: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseTheme.mockReturnValue({
    theme: "bosko",
    useLogoUrl: false,
    logoUrl: "",
    logoSize: 40,
    textLogoValue: "Cocktrail",
    textLogoSize: 26,
    isDark: true,
    toggleDark: vi.fn(),
  });
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
    const sinPermiso = { ...adminUser, role: "caja", permissions: { ...adminUser.permissions, closeNight: false } };

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

  it("muestra el estado de impresora conectada y permite testear la impresión", async () => {
    const user = userEvent.setup();
    const testPrint = vi.fn();

    render(<CajaSidebar {...baseProps} testPrint={testPrint} />);

    expect(screen.getByText("Impresora conectada")).toBeInTheDocument();

    await user.click(screen.getByText("Imprimir ticket de prueba"));
    expect(testPrint).toHaveBeenCalled();
  });

  it("muestra el estado de impresora no encontrada y el mensaje de test", () => {
    render(
      <CajaSidebar
        {...baseProps}
        printerStatus={{ connected: false, message: "sin conexión" }}
        printerTestMessage="Error al imprimir la prueba."
      />,
    );

    expect(screen.getByText("Impresora no encontrada")).toBeInTheDocument();
    expect(screen.getByText("Error al imprimir la prueba.")).toBeInTheDocument();
  });

  it("muestra el footer con OSProfileFooter (usuario y rol)", () => {
    render(<CajaSidebar {...baseProps} />);

    expect(screen.getByText("admin")).toBeInTheDocument();
  });
});
