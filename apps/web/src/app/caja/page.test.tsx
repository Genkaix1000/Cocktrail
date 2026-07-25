import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import CajaPage from "./page";
import { authService } from "@/services/auth.service";
import { barSessionsService } from "@/services/bar-sessions.service";
import { ApiError } from "@/services/api-client";

// El router tiene que ser el mismo objeto en cada render: el efecto de
// arranque lo tiene en sus deps, y uno nuevo por render lo relanzaría en loop.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push, replace: vi.fn(), refresh: vi.fn() } };
});

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("@/lib/useSSE", () => ({ useSSE: vi.fn() }));

// Los dos destinos de la página se stubean: acá se testea solo a dónde
// aterriza el arranque, no lo que renderiza cada pantalla.
vi.mock("./CajaClient", () => ({ default: () => <div>CajaClient</div> }));
vi.mock("@/components/caja/CajaSessionOnboarding", () => ({
  default: () => <div>Selector de cajas</div>,
}));

vi.mock("@/services/auth.service", () => ({
  authService: { getMe: vi.fn(), logout: vi.fn() },
}));
vi.mock("@/services/bar-sessions.service", () => ({
  barSessionsService: { listOptions: vi.fn(), join: vi.fn(), heartbeat: vi.fn() },
  setActiveBarContext: vi.fn(),
}));
vi.mock("@/services/drinks.service", () => ({ drinksService: { list: vi.fn() } }));
vi.mock("@/services/drink-categories.service", () => ({
  drinkCategoriesService: { list: vi.fn() },
}));

const mockedAuthService = vi.mocked(authService);
const mockedBarSessionsService = vi.mocked(barSessionsService);

const cajaUser = {
  role: "caja" as const,
  username: "ana",
  permissions: {
    closeNight: false,
    cancelarTickets: true,
    historial: true,
    metricas: false,
  },
};

beforeEach(() => {
  // reset (no clear): limpia también las colas de `...Once` entre tests.
  vi.resetAllMocks();
  mockedBarSessionsService.listOptions.mockResolvedValue({
    boxes: [],
    currentSession: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CajaPage", () => {
  it("un corte de red al arrancar no desloguea: reintenta y entra al selector", async () => {
    vi.useFakeTimers();
    mockedAuthService.getMe
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(cajaUser);

    render(<CajaPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(screen.getByText("Selector de cajas")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("un 401 sí manda al login", async () => {
    mockedAuthService.getMe.mockRejectedValue(new ApiError(401, "No autorizado"));

    render(<CajaPage />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
