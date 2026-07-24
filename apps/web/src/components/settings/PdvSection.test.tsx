import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PdvSection from "./PdvSection";
import { useTheme } from "@/components/ThemeProvider";
import type { CajaRow, DeviceRow } from "@/services/pdv.service";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@/services/pdv.service", () => ({
  pdvService: {
    listCajas: vi.fn(),
    listDevices: vi.fn(),
    listMpDevices: vi.fn(),
    createCaja: vi.fn(),
    deleteCaja: vi.fn(),
    registerDevice: vi.fn(),
    linkDevice: vi.fn(),
    unlinkDevice: vi.fn(),
    refreshQr: vi.fn(),
    setDeviceMode: vi.fn(),
    reprovisionCaja: vi.fn(),
  },
}));

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    testDeviceChargeFor: vi.fn(),
    getMpHealth: vi.fn(),
  },
}));

import { pdvService } from "@/services/pdv.service";
import { mercadopagoService } from "@/services/mercadopago.service";

const mockedUseTheme = vi.mocked(useTheme);
const mockedPdvService = vi.mocked(pdvService);
const mockedMpService = vi.mocked(mercadopagoService);

const CAJA: CajaRow = {
  id: "caja-1",
  barId: "bar-1",
  storeId: "1",
  externalPosId: "COCKTRAIL-BAR-01",
  posIdMp: "1",
  qrImage: "https://mp.example/qr.png",
  qrTemplate: null,
  sellerUserId: "s1",
  storeName: null,
  isOrphan: false,
  createdAt: "2026-07-17T00:00:00Z",
  device: null,
};

const DEVICE: DeviceRow = {
  id: "dev-1",
  cajaId: null,
  deviceId: "PAX_A910__SMARTPOS1493600985",
  deviceUsername: "Caja 1",
  operatingMode: "PDV",
  operatingModeSyncedAt: "2026-07-20T00:00:00Z",
  isActive: false,
  linkedAt: null,
  deactivatedAt: null,
};

/** Listado de MP con un device disponible para el alta (no registrado). */
const MP_LISTING = {
  devices: [
    {
      id: "PAX_A910__SMARTPOS1493600985",
      model: "PAX_A910",
      operatingMode: "PDV" as const,
      storeId: "1",
      posId: "1",
      registeredLocally: false,
    },
  ],
  token: { source: "seller" as const, userId: "s1" },
  sellerUserId: "s1",
};

const HEALTH = {
  checks: {
    singleSeller: { ok: true, detail: "ok" },
    deviceOwnership: { ok: true, detail: "ok" },
    deviceMode: { ok: true, detail: "ok" },
    cajaProvisioned: { ok: true, detail: "ok" },
  },
  fallback: { status: "usable" as const, checkedAt: "2026-07-23T00:00:00Z" },
  usingEnvDevice: false,
  blocking: false,
  checkedAt: "2026-07-23T16:00:00Z",
};

beforeEach(() => {
  mockedUseTheme.mockReturnValue({ theme: "bosko", setTheme: vi.fn(), isDark: true } as any);
  mockedPdvService.listCajas.mockResolvedValue([]);
  mockedPdvService.listDevices.mockResolvedValue([]);
  mockedPdvService.listMpDevices.mockResolvedValue(MP_LISTING);
  mockedMpService.testDeviceChargeFor.mockResolvedValue({
    reachedDevice: true,
    message: "ok",
  });
  mockedMpService.getMpHealth.mockResolvedValue(HEALTH);
});

describe("PdvSection", () => {
  // ── Los 6 tests migrados de PagosSection.test.tsx (D5/PR 6) ──

  it("muestra la sección Puntos de Venta", async () => {
    render(<PdvSection />);
    expect(await screen.findByRole("heading", { name: /Puntos de Venta/ })).toBeInTheDocument();
  });

  it("muestra el botón de crear barra habilitado cuando no hay PDVs", async () => {
    render(<PdvSection />);
    const btn = await screen.findByRole("button", { name: /Nueva barra/i });
    expect(btn).toBeEnabled();
  });

  it("crea el PDV desde el panel de alta", async () => {
    const user = userEvent.setup();
    mockedPdvService.createCaja.mockResolvedValue({ ...CAJA });

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: /Nueva barra/i }));

    // El panel abre pre-cargado con Barra VIP / BARRA-01.
    await user.click(await screen.findByRole("button", { name: "Crear PDV" }));

    await waitFor(() =>
      expect(mockedPdvService.createCaja).toHaveBeenCalledWith({
        barId: "BARRA-01",
        name: "Barra VIP",
      }),
    );
    expect(await screen.findByText("Barra VIP")).toBeInTheDocument();
  });

  it("muestra Barra VIP cuando hay un PDV provisionado", async () => {
    mockedPdvService.listCajas.mockResolvedValue([{ ...CAJA, externalPosId: "COCKTRAILBAR01" }]);

    render(<PdvSection />);
    expect(await screen.findByText(/COCKTRAILBAR01/)).toBeInTheDocument();
  });

  it("muestra la sección Posnets con el selector de alta desde la lista de MP", async () => {
    render(<PdvSection />);
    expect(await screen.findByRole("heading", { name: "Posnets" })).toBeInTheDocument();
    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument();
    // Ya no hay input con prefijo PAX_A910__SMARTPOS: el id se elige de la lista.
    expect(screen.queryByLabelText("PAX_A910__SMARTPOS")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Posnet reportado por Mercado Pago")).toBeInTheDocument();
    expect(screen.getByLabelText("Alias del Posnet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar/i })).toBeInTheDocument();
  });

  it("registra un Posnet eligiéndolo de la lista de MP (el id no se tipea)", async () => {
    const user = userEvent.setup();
    mockedPdvService.registerDevice.mockResolvedValue({ ...DEVICE });

    render(<PdvSection />);
    await screen.findByRole("heading", { name: "Posnets" });

    await user.selectOptions(
      screen.getByLabelText("Posnet reportado por Mercado Pago"),
      "PAX_A910__SMARTPOS1493600985",
    );
    await user.type(screen.getByLabelText("Alias del Posnet"), "Caja 1");
    await user.click(screen.getByRole("button", { name: /Agregar/i }));

    await waitFor(() =>
      expect(mockedPdvService.registerDevice).toHaveBeenCalledWith({
        deviceId: "PAX_A910__SMARTPOS1493600985",
        deviceUsername: "Caja 1",
      }),
    );
    // Exacto (no regex): el id vive en la fila del Posnet; el <option> del
    // selector de alta también lo contiene ("PAX_A910 — PDV — <id>"), así que
    // un match parcial daría dos elementos. La fila es texto EXACTO del id.
    expect(await screen.findByText("PAX_A910__SMARTPOS1493600985")).toBeInTheDocument();
  });

  it("pantalla guía: token propio sin lector reclamado (decisión 2)", async () => {
    mockedPdvService.listMpDevices.mockResolvedValue({
      devices: [],
      token: { source: "seller", userId: "s1" },
      sellerUserId: "s1",
    });

    render(<PdvSection />);
    expect(
      await screen.findByText(/Todavía no reclamaste el lector en tu cuenta de Mercado Pago/i),
    ).toBeInTheDocument();
  });

  it("pantalla guía: el token activo es de otra aplicación/cuenta (decisión 2)", async () => {
    mockedPdvService.listMpDevices.mockResolvedValue({
      devices: [],
      token: { source: "env", userId: "999" },
      sellerUserId: "s1",
    });

    render(<PdvSection />);
    expect(
      await screen.findByText(/El token activo pertenece a otra aplicación o cuenta/i),
    ).toBeInTheDocument();
  });

  it("botón 'Poner en modo PDV' aparece cuando el modo real no es PDV y lo cambia", async () => {
    const user = userEvent.setup();
    mockedPdvService.listDevices.mockResolvedValue([
      { ...DEVICE, operatingMode: "STANDALONE" },
    ]);
    mockedPdvService.setDeviceMode.mockResolvedValue({
      deviceId: DEVICE.deviceId,
      operatingMode: "PDV",
      registeredLocally: true,
    });

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: /Poner en modo PDV/i }));

    await waitFor(() =>
      expect(mockedPdvService.setDeviceMode).toHaveBeenCalledWith(DEVICE.deviceId, "PDV"),
    );
  });

  it("un Posnet histórico ofrece Reactivar y re-vincula a su caja (swap del backend)", async () => {
    const user = userEvent.setup();
    mockedPdvService.listDevices
      .mockResolvedValueOnce([{ ...DEVICE, cajaId: "caja-1", isActive: false }])
      .mockResolvedValue([{ ...DEVICE, cajaId: "caja-1", isActive: true }]);
    mockedPdvService.listCajas.mockResolvedValue([{ ...CAJA }]);
    mockedPdvService.linkDevice.mockResolvedValue({ ...DEVICE, cajaId: "caja-1", isActive: true });

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: /Reactivar/i }));

    await waitFor(() =>
      expect(mockedPdvService.linkDevice).toHaveBeenCalledWith({
        cajaId: "caja-1",
        deviceId: DEVICE.deviceId,
      }),
    );
  });

  it("re-provisionar una caja huérfana confirma primero (aviso de QR que cambia)", async () => {
    const user = userEvent.setup();
    mockedPdvService.listCajas.mockResolvedValue([{ ...CAJA, isOrphan: true }]);
    mockedPdvService.reprovisionCaja.mockResolvedValue({ ...CAJA, isOrphan: false });

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: /Re-provisionar/i }));

    // Aviso previo explícito: el QR va a cambiar y hay que reimprimir.
    expect(await screen.findByText(/El QR estático va a cambiar/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText("REPROVISIONAR");
    await user.type(input, "REPROVISIONAR");
    // Dos botones "Re-provisionar" (fila + confirm del modal): el submit es el del modal.
    const confirms = screen.getAllByRole("button", { name: "Re-provisionar" });
    await user.click(confirms[confirms.length - 1]);

    await waitFor(() =>
      expect(mockedPdvService.reprovisionCaja).toHaveBeenCalledWith("caja-1"),
    );
  });

  it("renderiza el panel de salud de la vinculación", async () => {
    render(<PdvSection />);
    expect(
      await screen.findByRole("heading", { name: /Salud de la vinculación/i }),
    ).toBeInTheDocument();
  });

  // ── Card Posnets: fixes del PR 6 ──

  it("el Test $15 viaja con el deviceId de la fila y el resultado se renderiza", async () => {
    const user = userEvent.setup();
    mockedPdvService.listDevices.mockResolvedValue([{ ...DEVICE }]);

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: "Test $15" }));

    await waitFor(() =>
      expect(mockedMpService.testDeviceChargeFor).toHaveBeenCalledWith(
        "PAX_A910__SMARTPOS1493600985",
      ),
    );
    expect(await screen.findByText("Recibido")).toBeInTheDocument();
  });

  it("un test fallido muestra el resultado y un error visible (sin catch silencioso)", async () => {
    const user = userEvent.setup();
    mockedPdvService.listDevices.mockResolvedValue([{ ...DEVICE }]);
    mockedMpService.testDeviceChargeFor.mockRejectedValue(new Error("boom"));

    render(<PdvSection />);
    await user.click(await screen.findByRole("button", { name: "Test $15" }));

    expect(await screen.findByText("Error")).toBeInTheDocument();
    expect(await screen.findByText(/El test contra el Posnet falló/i)).toBeInTheDocument();
  });

  it("un alta de Posnet fallida muestra un error visible", async () => {
    const user = userEvent.setup();
    mockedPdvService.registerDevice.mockRejectedValue(new Error("boom"));

    render(<PdvSection />);
    await screen.findByRole("heading", { name: "Posnets" });

    await user.selectOptions(
      screen.getByLabelText("Posnet reportado por Mercado Pago"),
      "PAX_A910__SMARTPOS1493600985",
    );
    await user.type(screen.getByLabelText("Alias del Posnet"), "Caja 1");
    await user.click(screen.getByRole("button", { name: /Agregar/i }));

    expect(await screen.findByText("No se pudo registrar el Posnet.")).toBeInTheDocument();
  });

  it("elimina un Posnet registrado", async () => {
    const user = userEvent.setup();
    mockedPdvService.listDevices.mockResolvedValue([{ ...DEVICE }]);
    mockedPdvService.unlinkDevice.mockResolvedValue({ ok: true });

    render(<PdvSection />);
    await user.click(
      await screen.findByRole("button", { name: /Eliminar Posnet Caja 1/i }),
    );

    await waitFor(() => expect(mockedPdvService.unlinkDevice).toHaveBeenCalledWith("dev-1"));
    // Exacto: tras borrar, la fila desaparece; el <option> del selector sigue
    // presente y contiene el id como substring — un match parcial lo tomaría.
    expect(screen.queryByText("PAX_A910__SMARTPOS1493600985")).not.toBeInTheDocument();
  });

  // ── Sesión de caja vive en PagosSection (grid con Sucursal) ──

  it("no renderiza Sesión de caja (vive en la tab Pagos)", async () => {
    render(<PdvSection />);
    await screen.findByRole("heading", { name: /Puntos de Venta/ });
    expect(screen.queryByText("Sesión de caja")).not.toBeInTheDocument();
  });

  // ── La tarjeta "Sucursal" duplicada se borró (queda solo en Pagos) ──

  it("no renderiza la tarjeta Sucursal (vive en la tab Pagos)", async () => {
    render(<PdvSection />);
    await screen.findByRole("heading", { name: /Puntos de Venta/ });
    expect(screen.queryByText("Sucursal Mercado Pago")).not.toBeInTheDocument();
  });
});
