import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    getMpHealth: vi.fn(),
    listWebhookEvents: vi.fn(),
    listRecentOrders: vi.fn(),
    getDeviceStatus: vi.fn(),
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

const UNLINKED_STATUS = {
  linked: false,
  status: null,
  nickname: null,
  email: null,
  linkedAt: null,
  displayName: null,
  userId: null,
  expiresAt: null,
  hasAccessToken: false,
  hasRefreshToken: false,
};

const LINKED_STATUS = {
  linked: true,
  status: "active" as const,
  nickname: "BOSKO BAR",
  displayName: "Bosko Bar",
  email: "bosko@example.com",
  linkedAt: new Date().toISOString(),
  userId: "1517393956",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  hasAccessToken: true,
  hasRefreshToken: true,
};

const SUMMARY = {
  store: { linked: true, storeId: "85068168", name: "GARCIAMANUEL", storeName: null, sellerUserId: "1517393956" },
  bars: 1,
  posnets: 1,
};

beforeEach(() => {
  mockedUseTheme.mockReturnValue({
    theme: "bosko",
    useLogoUrl: false,
    logoUrl: "",
    logoSize: 0,
    textLogoValue: "",
    textLogoSize: 0,
    isDark: true,
    toggleDark: vi.fn(),
  });
  mockedMpService.getSellerStatus.mockResolvedValue(UNLINKED_STATUS);
  mockedMpService.getOAuthUrl.mockResolvedValue({ url: "https://auth.mercadopago.com/authorization?..." });
  mockedMpService.unlinkSeller.mockResolvedValue({ ok: true, cloudCleaned: true });
  mockedMpService.getMpHealth.mockResolvedValue({
    checks: {
      singleSeller: { ok: false, detail: "Sin seller" },
      deviceOwnership: { ok: null, detail: "—" },
      deviceMode: { ok: null, detail: "—" },
      cajaProvisioned: { ok: null, detail: "—" },
    },
    fallback: { status: "unknown", checkedAt: null },
    usingEnvDevice: false,
    blocking: false,
    hasLinkedDevice: false,
    checkedAt: new Date().toISOString(),
  });
  mockedMpService.listWebhookEvents.mockResolvedValue({
    available: true,
    events: [],
    webhookSecretConfigured: true,
  });
  mockedMpService.listRecentOrders.mockResolvedValue({ orders: [] });
  mockedPdvService.getSummary.mockResolvedValue(SUMMARY);
  mockedBarSessions.listAll.mockResolvedValue([]);
  mockedBarSessions.forceLogout.mockResolvedValue({ ok: true });
  mockedConfigService.get.mockResolvedValue({
    mercadoPago: { publicKey: "", accessTokenMasked: "", sandbox: false },
  } as Awaited<ReturnType<typeof configService.get>>);
  mockedConfigService.update.mockResolvedValue({
    mercadoPago: { publicKey: "", accessTokenMasked: "", sandbox: true },
  } as Awaited<ReturnType<typeof configService.update>>);
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
      ...LINKED_STATUS,
      linkedAt: new Date().toISOString(),
    });

    render(<PagosSection />);

    expect(await screen.findByText(/Bosko Bar/)).toBeInTheDocument();
    expect(screen.getByText(/bosko@example.com/)).toBeInTheDocument();
  });

  // ── Sucursal (los PDVs/Posnets viven en la tab "PDV y Posnets" — ver PdvSection.test.tsx) ──

  it("muestra la sucursal del summary sin store_id a la vista", async () => {
    render(<PagosSection />);
    expect(await screen.findByText(/GARCIAMANUEL/)).toBeInTheDocument();
    expect(screen.queryByText(/store_id/i)).not.toBeInTheDocument();
  });

  it("renombra la sucursal: el nombre viaja a MP (rama A)", async () => {
    const user = userEvent.setup();
    mockedPdvService.renameStore.mockResolvedValue({ renamedInMp: true, name: "Boliche Nuevo" });
    mockedPdvService.getSummary
      .mockResolvedValueOnce(SUMMARY)
      .mockResolvedValueOnce({ ...SUMMARY, store: { ...SUMMARY.store, name: "Boliche Nuevo" } });

    render(<PagosSection />);
    await user.click(await screen.findByRole("button", { name: /Renombrar/i }));

    const input = screen.getByLabelText(/Nombre en el comprobante MP/i);
    await user.clear(input);
    await user.type(input, "Boliche Nuevo");
    await user.click(screen.getByRole("button", { name: /Guardar/i }));

    await waitFor(() =>
      expect(mockedPdvService.renameStore).toHaveBeenCalledWith("Boliche Nuevo"),
    );
    expect(await screen.findByText(/Boliche Nuevo/)).toBeInTheDocument();
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

    const input = screen.getByLabelText(/Nombre en el comprobante MP/i);
    await user.clear(input);
    await user.type(input, "Alias Local");
    await user.click(screen.getByRole("button", { name: /Guardar/i }));

    expect(await screen.findByText(/MP no aceptó el cambio/)).toBeInTheDocument();
    expect(screen.getByText(/Alias Local/)).toBeInTheDocument();
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
      ...LINKED_STATUS,
      status: "expired",
      email: null,
      linkedAt: null,
      hasAccessToken: false,
      hasRefreshToken: false,
      expiresAt: null,
    });

    render(<PagosSection />);

    expect(await screen.findByText(/Sesión expirada/i)).toBeInTheDocument();
    // /Vincular/i también matchearía "Desvincular" (nuevo con el seller linked).
    expect(screen.getByRole("button", { name: /Re-vincular/i })).toBeInTheDocument();
  });

  it("muestra herramientas de desarrollador plegadas debajo de la sanidad", async () => {
    render(<PagosSection />);
    await screen.findByText("Pagos");
    const btn = screen.getByRole("button", { name: /herramientas de desarrollador/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  // ── Desvincular (hold-to-confirm) ──

  async function holdUnlinkConfirm() {
    const hold = await screen.findByRole("button", { name: /Desvincular\. Mantené/i });
    fireEvent.pointerDown(hold);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
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

  it("la confirmación aclara que barras/Posnets se conservan y cuándo hay que re-asociar", async () => {
    const user = userEvent.setup();
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    render(<PagosSection />);

    await user.click(await screen.findByRole("button", { name: "Desvincular" }));

    expect(screen.getByText("Desvincular Mercado Pago")).toBeInTheDocument();
    expect(screen.getByText(/barras y Posnets se conservan/i)).toBeInTheDocument();
    expect(screen.getByText(/misma cuenta MP se restauran solos/i)).toBeInTheDocument();
    expect(screen.getByText(/re-asociar el PDV/i)).toBeInTheDocument();
    expect(screen.getByText(/QR estático puede cambiar/i)).toBeInTheDocument();
    expect(screen.getByText(/Mantené presionado/i)).toBeInTheDocument();
    expect(mockedMpService.unlinkSeller).not.toHaveBeenCalled();
  });

  it("tras hold llama unlinkSeller al toque y muestra toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);

    try {
      render(<PagosSection />);
      await user.click(await screen.findByRole("button", { name: "Desvincular" }));
      await holdUnlinkConfirm();

      await waitFor(() => expect(mockedMpService.unlinkSeller).toHaveBeenCalledTimes(1));
      expect(await screen.findByText(/Cuenta de Mercado Pago desvinculada/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("muestra el aviso persistente cuando cloudCleaned es false", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mockedMpService.getSellerStatus.mockResolvedValue(LINKED_STATUS);
    mockedMpService.unlinkSeller.mockResolvedValue({ ok: true, cloudCleaned: false });

    try {
      render(<PagosSection />);
      await user.click(await screen.findByRole("button", { name: "Desvincular" }));
      await holdUnlinkConfirm();

      expect(await screen.findByText(/limpieza pendiente en la nube/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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

    await user.click(screen.getByRole("button", { name: /^Cerrar$/i }));

    await waitFor(() => expect(mockedBarSessions.forceLogout).toHaveBeenCalledWith("bar-1"));
    expect(await screen.findByText(/Nadie conectado/i)).toBeInTheDocument();
  });

  it("muestra 'Nadie conectado' cuando no hay sesiones", async () => {
    render(<PagosSection />);
    expect(await screen.findByText(/Nadie conectado/i)).toBeInTheDocument();
  });
});
