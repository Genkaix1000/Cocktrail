import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminClient from "./AdminClient";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";

import type { NightEvent } from "@cocktrail/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/useSSE", () => ({
  useSSE: vi.fn(),
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "bosko",
    isDark: true,
    toggleDark: vi.fn(),
    useLogoUrl: true,
    logoUrl: "/bosko.webp",
    logoSize: 56,
    textLogoValue: "Bosko",
    textLogoSize: 26,
  }),
  useThemeSafe: () => null,
}));

vi.mock("@/services/events.service", () => ({
  eventsService: {
    getState: vi.fn(),
    closeEvent: vi.fn(),
    openEvent: vi.fn(),
    setKeyword: vi.fn(),
    setTheme: vi.fn(),
    getHistory: vi.fn(),
    getPublicConfig: vi.fn(),
  },
}));

vi.mock("@/services/auth.service", () => ({
  authService: {
    getMe: vi.fn(),
    logout: vi.fn(),
  },
}));

const { usePrinterStatusMock } = vi.hoisted(() => ({
  usePrinterStatusMock: vi.fn(),
}));

vi.mock("@/hooks/usePrinterStatus", () => ({
  usePrinterStatus: () => usePrinterStatusMock(),
}));

vi.mock("@/hooks/usePosnetStatus", () => ({
  usePosnetStatus: () => ({
    posnetHealth: null,
    posnetLevel: "unknown",
    posnetMessage: null,
  }),
}));

function connectedPrinterMock() {
  return {
    printerStatus: { connected: true, message: "ok" },
    testPrint: vi.fn(),
    printerTestMessage: null,
    reprintTicket: vi.fn(),
    printTicket: vi.fn(),
    pairPrinterDevice: vi.fn(async () => undefined),
    connectPrinter: vi.fn(async () => undefined),
    reconnecting: false,
    printerPaired: true,
    printError: null,
    reprinting: false,
  };
}

function disconnectedPrinterMock() {
  return {
    printerStatus: { connected: false, message: "sin impresora" },
    testPrint: vi.fn(),
    printerTestMessage: null,
    reprintTicket: vi.fn(),
    printTicket: vi.fn(),
    pairPrinterDevice: vi.fn(async () => undefined),
    connectPrinter: vi.fn(async () => undefined),
    reconnecting: false,
    printerPaired: false,
    printError: null,
    reprinting: false,
  };
}

vi.mock("@/services/drinks.service", () => ({
  drinksService: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/drink-categories.service", () => ({
  drinkCategoriesService: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/components/caja/VentaSection", () => ({
  default: () => <div>VentaSection</div>,
}));

vi.mock("@/components/settings/CartaSection", () => ({ default: () => <div>CartaSection</div> }));
vi.mock("@/components/settings/PagosSection", () => ({ default: () => <div>PagosSection</div> }));
vi.mock("@/components/settings/UsuariosSection", () => ({ default: () => <div>UsuariosSection</div> }));
vi.mock("@/components/admin/DashboardSection", () => ({ default: () => <div>DashboardSection</div> }));
vi.mock("@/components/admin/HistorialSection", () => ({ default: () => <div>HistorialSection</div> }));
vi.mock("@/components/admin/LogsSection", () => ({ default: () => <div>LogsSection</div> }));

const mockedEventsService = vi.mocked(eventsService);
const mockedAuthService = vi.mocked(authService);

const adminUser = { role: "admin" as const, username: "manuel" };

function renderAdmin(
  props: Partial<{ initialEvent: NightEvent | null; initialOrders: never[] }> = {},
) {
  return render(
    <AdminClient
      initialEvent={props.initialEvent ?? null}
      initialOrders={props.initialOrders ?? []}
      currentUser={adminUser}
    />,
  );
}

function makeNightEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "event-1",
    keyword: "TEQUILA",
    status: "activo",
    startedAt: Date.now(),
    orderCounter: 0,
    ...overrides,
  } as NightEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/admin");
  localStorage.removeItem("cocktrail:printer-prompt-seen");
  usePrinterStatusMock.mockReturnValue(connectedPrinterMock());
  mockedAuthService.logout.mockResolvedValue({ ok: true });
  mockedEventsService.getHistory.mockResolvedValue([]);
  mockedEventsService.getPublicConfig.mockResolvedValue({} as never);
});

describe("AdminClient", () => {
  it("renderiza el panel completo (sidebar + Dashboard) cuando no hay noche activa", async () => {
    renderAdmin();

    expect(await screen.findByText("DashboardSection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir noche/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Probar impresora/i })).toBeInTheDocument();
  });

  it("muestra el botón Abrir noche (no Clave de la noche/Cerrar noche) cuando no hay noche activa", async () => {
    renderAdmin();

    await screen.findByText("DashboardSection");
    expect(screen.getByRole("button", { name: /Abrir noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clave de la noche/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cerrar noche/i })).not.toBeInTheDocument();
  });

  it("muestra Clave de la noche/Cerrar noche (no Abrir noche) cuando hay noche activa", async () => {
    renderAdmin({ initialEvent: makeNightEvent() });

    await screen.findByText("DashboardSection");
    expect(screen.getByRole("button", { name: /Clave de la noche/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cerrar noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir noche/i })).not.toBeInTheDocument();
  });

  it("Nueva Venta con noche cerrada muestra Caja Cerrada", async () => {
    const user = userEvent.setup();
    usePrinterStatusMock.mockReturnValue(disconnectedPrinterMock());
    renderAdmin();
    await screen.findByText("DashboardSection");
    await user.click(screen.getByRole("button", { name: /Nueva Venta/i }));
    expect(await screen.findByText("Caja Cerrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vincular impresora/i })).toBeInTheDocument();
  });

  it("Nueva Venta con noche abierta monta el POS", async () => {
    const user = userEvent.setup();
    renderAdmin({ initialEvent: makeNightEvent() });
    await screen.findByText("DashboardSection");
    await user.click(screen.getByRole("button", { name: /Nueva Venta/i }));
    expect(await screen.findByText("VentaSection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Probar impresora/i })).toBeInTheDocument();
    expect(screen.getByText(/Clave: TEQUILA/i)).toBeInTheDocument();
  });

  it("con noche abierta y sin impresora muestra el prompt de vincular", async () => {
    usePrinterStatusMock.mockReturnValue(disconnectedPrinterMock());
    renderAdmin({ initialEvent: makeNightEvent() });
    expect(
      await screen.findByRole("dialog", { name: /No hay impresora/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog", { name: /No hay impresora/i })).getByRole(
        "button",
        { name: /Vincular impresora/i },
      ),
    ).toBeInTheDocument();
  });

  it("al abrir una noche desde el botón del sidebar, el panel pasa a mostrar Clave de la noche/Cerrar noche", async () => {
    const user = userEvent.setup();
    const opened = makeNightEvent({ keyword: "MEDIANOCHE" });
    mockedEventsService.openEvent.mockResolvedValue(opened);

    renderAdmin();
    await screen.findByText("DashboardSection");

    await user.click(screen.getByRole("button", { name: /Abrir noche/i }));

    const input = await screen.findByPlaceholderText("ej. TEQUILA");
    await user.type(input, "MEDIANOCHE");

    const submitButton = screen
      .getAllByRole("button", { name: /Abrir noche/i })
      .find((b) => b.getAttribute("type") === "submit")!;
    await user.click(submitButton);

    await waitFor(() => expect(mockedEventsService.openEvent).toHaveBeenCalledWith("MEDIANOCHE"));
    expect(await screen.findByRole("button", { name: /Cerrar noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abrir noche$/i })).not.toBeInTheDocument();
  });
});
