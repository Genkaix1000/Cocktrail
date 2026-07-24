import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PagosSection from "./PagosSection";
import { useTheme } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getOAuthUrl: vi.fn(),
    getSellerStatus: vi.fn(),
    unlinkSeller: vi.fn(),
    pullSeller: vi.fn(),
  },
}));

vi.mock("@/services/pdv.service", () => ({
  pdvService: {
    getSummary: vi.fn(),
    renameStore: vi.fn(),
  },
}));

vi.mock("@/services/bar-sessions.service", () => ({
  barSessionsService: {
    listAll: vi.fn(),
    forceLogout: vi.fn(),
  },
}));

vi.mock("@/services/config.service", () => ({
  configService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

import { mercadopagoService } from "@/services/mercadopago.service";
import { pdvService } from "@/services/pdv.service";
import { configService } from "@/services/config.service";
import { barSessionsService } from "@/services/bar-sessions.service";

const mockedUseTheme = vi.mocked(useTheme);
const mockedMpService = vi.mocked(mercadopagoService);
const mockedPdvService = vi.mocked(pdvService);
const mockedConfigService = vi.mocked(configService);
const mockedBarSessions = vi.mocked(barSessionsService);

const UNLINKED_STATUS = { linked: false, status: null, nickname: null, email: null, linkedAt: null, displayName: null };

const LINKED_STATUS = {
  linked: true,
  status: "active" as const,
  nickname: "BOSKO BAR",
  displayName: "Bosko Bar",
  email: "bosko@example.com",
  linkedAt: new Date().toISOString(),
};

const SUMMARY = {
  store: { linked: true, storeId: "85068168", name: "GARCIAMANUEL", storeName: null, sellerUserId: "1517393956" },
  bars: 1,
  posnets: 1,
};

beforeEach(() => {
  mockedUseTheme.mockReturnValue({ theme: "bosko", setTheme: vi.fn(), isDark: true } as any);
  mockedMpService.getSellerStatus.mockResolvedValue(UNLINKED_STATUS);
  mockedMpService.getOAuthUrl.mockResolvedValue({ url: "https://auth.mercadopago.com/authorization?..." });
  mockedMpService.unlinkSeller.mockResolvedValue({ ok: true, cloudCleaned: true });
  mockedPdvService.getSummary.mockResolvedValue(SUMMARY);
  mockedBarSessions.listAll.mockResolvedValue([]);
  mockedBarSessions.forceLogout.mockResolvedValue({ ok: true });
  mockedConfigService.get.mockResolvedValue({
    mercadoPago: { publicKey: "", accessTokenMasked: "", sandbox: false },
  } as any);
  mockedConfigService.update.mockResolvedValue({
    mercadoPago: { publicKey: "", accessTokenMasked: "", sandbox: true },
  } as any);
});

describe("PagosSection", () => {
  it("muestra el header de Pagos", async () => {
    render(<PagosSection />);
    expect(await screen.findByText("Pagos")).toBeInTheDocument();
  });

  it("muestra 'Mercado Pago' y no 'Sin Vincular'", async () => {
    render(<PagosSection />);
    expect(await screen.findByText("Mercado Pago")).toBeInTheDocument();
    expect(screen.queryByText("Sin Vincular")).not.toBeInTheDocument();
  });

  it("muestra el botón Vincular", async () => {
    render(<PagosSection />);
    expect(await screen.findByRole("button", { name: /Vincular/i })).toBeInTheDocument();
  });

  it("llama a getOAuthUrl al clickear Vincular", async () => {
    const user = userEvent.setup();
    render(<PagosSection />);
    const btn = await screen.findByRole("button", { name: /Vincular/i });

    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      value: { href: originalHref },
      writable: true,
    });

    await user.click(btn);
    expect(mockedMpService.getOAuthUrl).toHaveBeenCalled();
  });

  it("muestra los datos de la cuenta cuando hay seller activo", async () => {
    mockedMpService.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "active",
      nickname: "BOSKO BAR",
      displayName: "Bosko Bar",
      email: "bosko@example.com",
      linkedAt: new Date().toISOString(),
    });

    render(<PagosSection />);

    expect(await screen.findByText("Bosko Bar")).toBeInTheDocument();
    expect(screen.getByText("bosko@example.com")).toBeInTheDocument();
  });

  // ── Sucursal (los PDVs/Posnets viven en la tab "PDV y Posnets" — ver PdvSection.test.tsx) ──

  it("muestra la sucursal del summary con su store_id", async () => {
    render(<PagosSection />);
    expect(await screen.findByText("GARCIAMANUEL")).toBeInTheDocument();
    expect(screen.getByText(/store_id: 85068168/)).toBeInTheDocument();
    expect(screen.getByText("Vinculada")).toBeInTheDocument();
  });

  it("renombra la sucursal: el nombre viaja a MP (rama A)", async () => {
    const user = userEvent.setup();
    mockedPdvService.renameStore.mockResolvedValue({ renamedInMp: true, name: "Boliche Nuevo" });
    mockedPdvService.getSummary
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce({ ...SUMMARY, store: { ...SUMMARY.store, name: "Boliche Nuevo" } });

    render(<PagosSection />);
    await user.click(await screen.findByRole("button", { name: /Renombrar/i }));

    const input = screen.getByLabelText("Nombre de la sucursal");
    await user.clear(input);
    await user.type(input, "Boliche Nuevo");
    await user.click(screen.getByRole("button", { name: /Guardar/i }));

    await waitFor(() =>
      expect(mockedPdvService.renameStore).toHaveBeenCalledWith("Boliche Nuevo"),
    );
    expect(await screen.findByText("Boliche Nuevo")).toBeInTheDocument();
  });

  it("si MP no acepta el rename, muestra el alias local + el nombre real de MP (rama B)", async () => {
    const user = userEvent.setup();
    mockedPdvService.renameStore.mockResolvedValue({
      renamedInMp: false,
      name: "Alias Local",
      mpName: "GARCIAMANUEL",
    });

    render(<PagosSection />);
    await user.click(await screen.findByRole("button", { name: /Renombrar/i }));

    const input = screen.getByLabelText("Nombre de la sucursal");
    await user.clear(input);
    await user.type(input, "Alias Local");
    await user.click(screen.getByRole("button", { name: /Guardar/i }));

    expect(await screen.findByText(/Mercado Pago no aceptó el cambio de nombre/)).toBeInTheDocument();
    expect(screen.getByText(/«Alias Local»/)).toBeInTheDocument();
  });

  it("ya no renderiza las secciones de Puntos de Venta ni Posnets (mudadas a PdvSection)", async () => {
    render(<PagosSection />);
    await screen.findByText("Pagos");
    expect(screen.queryByRole("heading", { name: "Puntos de Venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Posnets" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear PDV/i })).not.toBeInTheDocument();
  });

  it("muestra un error visible si el summary no se pudo cargar (sin catch silencioso)", async () => {
    mockedPdvService.getSummary.mockRejectedValue(new Error("network"));
    render(<PagosSection />);
    expect(
      await screen.findByText(/No se pudo cargar el estado de la sucursal/i),
    ).toBeInTheDocument();
  });

  it("no muestra la sección de Credenciales (public key / access token)", async () => {
    render(<PagosSection />);
    await screen.findByText("Pagos");
    expect(screen.queryByText("Credenciales")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Public Key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Access Token")).not.toBeInTheDocument();
  });

  it("muestra el badge de sesión expirada cuando el seller está expired", async () => {
    mockedMpService.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "expired",
      nickname: "BOSKO BAR",
      displayName: "Bosko Bar",
      email: null,
      linkedAt: null,
    });

    render(<PagosSection />);

    expect(await screen.findByText(/Sesión expirada/i)).toBeInTheDocument();
    // /Vincular/i también matchearía "Desvincular" (nuevo con el seller linked).
    expect(screen.getByRole("button", { name: /Re-vincular/i })).toBeInTheDocument();
  });

  it("persiste el toggle Sandbox al cambiarlo", async () => {
    const user = userEvent.setup();
    render(<PagosSection />);

    const toggle = await screen.findByRole("button", { name: "Sandbox" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    await waitFor(() =>
      expect(mockedConfigService.update).toHaveBeenCalledWith({
        mercadoPago: { sandbox: true },
      }),
    );
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  // ── Desvincular (D9 + aviso R22) ──

  /** Abre la confirmación, tipea DESVINCULAR y confirma. */
  async function confirmUnlink(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "Desvincular" }));
    await user.type(screen.getByLabelText(/escribe/i), "DESVINCULAR");
    const submit = screen
      .getAllByRole("button", { name: "Desvincular" })
      .find((b) => b.getAttribute("type") === "submit");
    expect(submit).toBeDefined();
    await user.click(submit!);
  }

  it("no muestra Desvincular cuando no hay cuenta vinculada", async () => {
    render(<PagosSection />);
    await screen.findByText("Pagos");
    expect(screen.queryByRole("button", { name: "Desvincular" })).not.toBeInTheDocument();
  });

  it("muestra Desvincular cuando hay cuenta vinculada", async () => {
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    render(<PagosSection />);
    expect(await screen.findByRole("button", { name: "Desvincular" })).toBeInTheDocument();
  });

  it("la confirmación muestra el aviso R22 (cajas huérfanas + QR que cambia + reimpresión)", async () => {
    const user = userEvent.setup();
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    render(<PagosSection />);

    await user.click(await screen.findByRole("button", { name: "Desvincular" }));

    expect(screen.getByText("Desvincular Mercado Pago")).toBeInTheDocument();
    expect(screen.getByText(/quedar huérfanas/i)).toBeInTheDocument();
    expect(screen.getByText(/el QR estático cambia/i)).toBeInTheDocument();
    expect(screen.getByText(/reimprimirlo/i)).toBeInTheDocument();
    expect(mockedMpService.unlinkSeller).not.toHaveBeenCalled();
  });

  it("llama a unlinkSeller tras confirmar tipeando DESVINCULAR y refresca el estado", async () => {
    const user = userEvent.setup();
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    render(<PagosSection />);

    const statusCallsBefore = mockedMpService.getSellerStatus.mock.calls.length;
    await confirmUnlink(user);

    await waitFor(() => expect(mockedMpService.unlinkSeller).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockedMpService.getSellerStatus.mock.calls.length).toBeGreaterThan(statusCallsBefore),
    );
    // cloudCleaned:true → sin aviso de limpieza pendiente
    expect(screen.queryByText(/limpieza pendiente en la nube/i)).not.toBeInTheDocument();
  });

  it("muestra el aviso persistente cuando cloudCleaned es false", async () => {
    const user = userEvent.setup();
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    mockedMpService.unlinkSeller.mockResolvedValue({ ok: true, cloudCleaned: false });
    render(<PagosSection />);

    await confirmUnlink(user);

    expect(await screen.findByText(/limpieza pendiente en la nube/i)).toBeInTheDocument();
  });

  // ── Sesión de caja (grid al lado de Sucursal) ──

  it("muestra la sesión de caja activa y permite cerrarla", async () => {
    const user = userEvent.setup();
    mockedBarSessions.listAll
      .mockResolvedValueOnce([
        {
          id: "session-1",
          barId: "bar-1",
          userId: "caja:ana",
          username: "ana",
          role: "caja" as const,
          connectedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([]);

    render(<PagosSection />);
    expect(await screen.findByText("ana")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cerrar sesión/i }));

    await waitFor(() => expect(mockedBarSessions.forceLogout).toHaveBeenCalledWith("bar-1"));
    expect(await screen.findByText("Sin usuario conectado")).toBeInTheDocument();
  });

  it("muestra 'Sin usuario conectado' cuando no hay sesiones", async () => {
    render(<PagosSection />);
    expect(await screen.findByText("Sin usuario conectado")).toBeInTheDocument();
  });
});
