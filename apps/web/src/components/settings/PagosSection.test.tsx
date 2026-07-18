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
    testDeviceChargeFor: vi.fn(),
  },
}));

vi.mock("@/services/pdv.service", () => ({
  pdvService: {
    listCajas: vi.fn(),
    listDevices: vi.fn(),
    createCaja: vi.fn(),
    registerDevice: vi.fn(),
    linkDevice: vi.fn(),
    unlinkDevice: vi.fn(),
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

const mockedUseTheme = vi.mocked(useTheme);
const mockedMpService = vi.mocked(mercadopagoService);
const mockedPdvService = vi.mocked(pdvService);
const mockedConfigService = vi.mocked(configService);

const UNLINKED_STATUS = { linked: false, status: null, nickname: null, email: null, linkedAt: null, displayName: null };

beforeEach(() => {
  mockedUseTheme.mockReturnValue({ theme: "bosko", setTheme: vi.fn(), isDark: true } as any);
  mockedMpService.getSellerStatus.mockResolvedValue(UNLINKED_STATUS);
  mockedMpService.getOAuthUrl.mockResolvedValue({ url: "https://auth.mercadopago.com/authorization?..." });
  mockedMpService.testDeviceChargeFor.mockResolvedValue({
    reachedDevice: true,
    message: "ok",
  });
  mockedPdvService.listCajas.mockResolvedValue([]);
  mockedPdvService.listDevices.mockResolvedValue([]);
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

  it("muestra la sección Puntos de Venta", async () => {
    render(<PagosSection />);
    expect(await screen.findByRole("heading", { name: "Puntos de Venta" })).toBeInTheDocument();
  });

  it("muestra el botón Crear Barra VIP cuando no hay PDVs", async () => {
    render(<PagosSection />);
    expect(await screen.findByRole("button", { name: /Crear Barra VIP/i })).toBeInTheDocument();
  });

  it("crea el PDV al clickear Crear Barra VIP", async () => {
    const user = userEvent.setup();
    mockedMpService.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "active",
      nickname: "BOSKO BAR",
      displayName: "Bosko Bar",
      email: null,
      linkedAt: null,
    });
    mockedPdvService.createCaja.mockResolvedValue({
      id: "caja-1",
      barId: "bar-1",
      storeId: "1",
      externalPosId: "COCKTRAIL-BAR-01",
      posIdMp: "1",
      qrImage: "https://mp.example/qr.png",
      qrTemplate: null,
      sellerUserId: "s1",
      createdAt: "2026-07-17T00:00:00Z",
    });

    render(<PagosSection />);
    const btn = await screen.findByRole("button", { name: /Crear Barra VIP/i });
    await user.click(btn);

    await waitFor(() =>
      expect(mockedPdvService.createCaja).toHaveBeenCalledWith({
        barId: "BARRA-01",
        name: "Barra VIP",
      }),
    );
    expect(await screen.findByText("Barra VIP")).toBeInTheDocument();
  });

  it("muestra Barra VIP cuando hay un PDV provisionado", async () => {
    mockedPdvService.listCajas.mockResolvedValue([
      {
        id: "caja-1",
        barId: "bar-1",
        storeId: "1",
        externalPosId: "COCKTRAILBAR01",
        posIdMp: "1",
        qrImage: "https://mp.example/qr.png",
        qrTemplate: null,
        sellerUserId: "s1",
        createdAt: "2026-07-17T00:00:00Z",
        device: null,
      },
    ]);

    render(<PagosSection />);
    expect(await screen.findByText("Barra VIP")).toBeInTheDocument();
  });

  it("muestra la sección Posnets con formulario de alta (sin 'Próximamente')", async () => {
    render(<PagosSection />);
    expect(await screen.findByRole("heading", { name: "Posnets" })).toBeInTheDocument();
    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Device ID/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar/i })).toBeInTheDocument();
  });

  it("registra un Posnet al clickear Agregar", async () => {
    const user = userEvent.setup();
    mockedPdvService.registerDevice.mockResolvedValue({
      id: "dev-1",
      cajaId: null,
      deviceId: "PAX_A910__TEST",
      deviceUsername: "Caja 1",
      operatingMode: "PDV",
    });

    render(<PagosSection />);
    await screen.findByText("Posnets");

    await user.type(screen.getByPlaceholderText(/Device ID/i), "PAX_A910__TEST");
    await user.type(screen.getByPlaceholderText(/Alias/i), "Caja 1");
    await user.click(screen.getByRole("button", { name: /Agregar/i }));

    await waitFor(() =>
      expect(mockedPdvService.registerDevice).toHaveBeenCalledWith({
        deviceId: "PAX_A910__TEST",
        deviceUsername: "Caja 1",
      }),
    );
    expect(await screen.findByText(/PAX_A910__TEST/)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Vincular/i })).toBeInTheDocument();
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
});
