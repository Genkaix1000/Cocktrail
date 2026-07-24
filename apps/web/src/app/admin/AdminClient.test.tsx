import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

// AdminClient monta varias secciones "pesadas" (fetch propio en cada una);
// se stubean para testear solo el gating de esta feature, no su contenido
// interno (cada una tiene o debería tener sus propios tests).
vi.mock("@/components/settings/CartaSection", () => ({ default: () => <div>CartaSection</div> }));
vi.mock("@/components/settings/PagosSection", () => ({ default: () => <div>PagosSection</div> }));
vi.mock("@/components/settings/UsuariosSection", () => ({ default: () => <div>UsuariosSection</div> }));
vi.mock("@/components/admin/DashboardSection", () => ({ default: () => <div>DashboardSection</div> }));
vi.mock("@/components/admin/HistorialSection", () => ({ default: () => <div>HistorialSection</div> }));
vi.mock("@/components/admin/LogsSection", () => ({ default: () => <div>LogsSection</div> }));

const mockedEventsService = vi.mocked(eventsService);
const mockedAuthService = vi.mocked(authService);

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
  mockedAuthService.getMe.mockResolvedValue(null);
  mockedEventsService.getHistory.mockResolvedValue([]);
  mockedEventsService.getPublicConfig.mockResolvedValue({} as never);
});

describe("AdminClient", () => {
  it("renderiza el panel completo (sidebar + Dashboard) cuando no hay noche activa", async () => {
    render(<AdminClient initialEvent={null} initialOrders={[]} />);

    expect(await screen.findByText("DashboardSection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Abrir noche/i })).toBeInTheDocument();
  });

  it("muestra el botón Abrir noche (no Clave de la noche/Cerrar noche) cuando no hay noche activa", async () => {
    render(<AdminClient initialEvent={null} initialOrders={[]} />);

    await screen.findByText("DashboardSection");
    expect(screen.getByRole("button", { name: /Abrir noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clave de la noche/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cerrar noche/i })).not.toBeInTheDocument();
  });

  it("muestra Clave de la noche/Cerrar noche (no Abrir noche) cuando hay noche activa", async () => {
    render(
      <AdminClient
        initialEvent={makeNightEvent()}
        initialOrders={[]}
      />,
    );

    await screen.findByText("DashboardSection");
    expect(screen.getByRole("button", { name: /Clave de la noche/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cerrar noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir noche/i })).not.toBeInTheDocument();
  });

  it("al abrir una noche desde el botón del sidebar, el panel pasa a mostrar Clave de la noche/Cerrar noche", async () => {
    const user = userEvent.setup();
    const opened = makeNightEvent({ keyword: "MEDIANOCHE" });
    mockedEventsService.openEvent.mockResolvedValue(opened);

    render(<AdminClient initialEvent={null} initialOrders={[]} />);
    await screen.findByText("DashboardSection");

    await user.click(screen.getByRole("button", { name: /Abrir noche/i }));

    const input = await screen.findByPlaceholderText("ej. TEQUILA");
    await user.type(input, "MEDIANOCHE");

    // Mientras el modal está abierto hay dos botones "Abrir noche": el del
    // sidebar (sigue detrás, event todavía null) y el submit del modal.
    const submitButton = screen
      .getAllByRole("button", { name: /Abrir noche/i })
      .find((b) => b.getAttribute("type") === "submit")!;
    await user.click(submitButton);

    await waitFor(() => expect(mockedEventsService.openEvent).toHaveBeenCalledWith("MEDIANOCHE"));
    expect(await screen.findByRole("button", { name: /Cerrar noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Abrir noche$/i })).not.toBeInTheDocument();
  });
});
