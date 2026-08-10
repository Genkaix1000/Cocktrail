import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PdvTable from "./PdvTable";
import type { CajaRow, DeviceRow } from "@/services/pdv.service";

const CAJA: CajaRow = {
  id: "caja-1",
  barId: "bar-1",
  storeId: "1",
  externalPosId: "COCKTRAILBAR01",
  posIdMp: "1",
  qrImage: "https://mp.example/qr.png",
  qrTemplate: null,
  sellerUserId: "s1",
  storeName: null,
  barCode: "BARRA-01",
  barEnabled: true,
  isOrphan: false,
  createdAt: "2026-07-17T00:00:00Z",
  device: null,
};

const DEVICE: DeviceRow = {
  id: "dev-1",
  cajaId: "caja-1",
  deviceId: "PAX_A910__SMARTPOS1493600985",
  deviceUsername: "Caja 1",
  operatingMode: "PDV",
  operatingModeSyncedAt: "2026-07-20T00:00:00Z",
  isActive: true,
  linkedAt: "2026-07-18T00:00:00Z",
  deactivatedAt: null,
};

function renderTable(overrides: Partial<Parameters<typeof PdvTable>[0]> = {}) {
  const props = {
    cajas: [CAJA],
    loadError: false,
    linkingCajaId: null,
    onRetry: vi.fn(),
    onLinkDevice: vi.fn().mockResolvedValue(undefined),
    onUnlinkDevice: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PdvTable {...props} />);
  return props;
}

describe("PdvTable", () => {
  it("muestra el estado vacío cuando no hay PDVs", () => {
    renderTable({ cajas: [] });
    expect(screen.getByText(/Todavía no hay puntos de venta/i)).toBeInTheDocument();
  });

  it("muestra el error de carga con botón Reintentar", async () => {
    const user = userEvent.setup();
    const props = renderTable({ loadError: true });

    expect(screen.getByText(/No se pudieron cargar los PDVs/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reintentar/i }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it("sin Posnet muestra QR dinámico como tipo de integración", () => {
    renderTable();
    expect(screen.getByText("Barra VIP")).toBeInTheDocument();
    expect(screen.getByText("QR dinámico")).toBeInTheDocument();
    expect(screen.getByText(/Cobros con código QR/i)).toBeInTheDocument();
  });

  it("permite deshabilitar la barra desde el switch", async () => {
    const user = userEvent.setup();
    const onToggleEnabled = vi.fn().mockResolvedValue(undefined);
    renderTable({ onToggleEnabled });

    await user.click(screen.getByRole("switch", { name: /Deshabilitar Barra VIP/i }));
    expect(onToggleEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "caja-1" }),
      false,
    );
  });

  it("ofrece Recuperar QR cuando la caja no tiene imagen", async () => {
    const user = userEvent.setup();
    const onRecoverQr = vi.fn();
    renderTable({ cajas: [{ ...CAJA, qrImage: null }], onRecoverQr });

    await user.click(screen.getByRole("button", { name: /Recuperar QR/i }));
    expect(onRecoverQr).toHaveBeenCalledWith(expect.objectContaining({ id: "caja-1" }));
  });

  it("vincula un Posnet eligiéndolo del selector", async () => {
    const user = userEvent.setup();
    const candidate: DeviceRow = {
      ...DEVICE,
      id: "dev-2",
      cajaId: null,
      isActive: false,
      linkedAt: null,
    };
    const props = renderTable({ cajas: [{ ...CAJA, device: null }], availableDevices: [candidate] });

    await user.click(screen.getByRole("button", { name: /Vincular Posnet/i }));
    await user.click(screen.getByLabelText("Posnet a vincular"));
    await user.click(screen.getByRole("option", { name: new RegExp(candidate.deviceId) }));
    await user.type(screen.getByLabelText("Apodo del Posnet"), "Caja 1");
    await user.click(screen.getByRole("button", { name: "Vincular" }));

    expect(props.onLinkDevice).toHaveBeenCalledWith("caja-1", candidate.deviceId, "Caja 1");
  });

  it("muestra el badge 'huérfana' y dispara la re-provisión", async () => {
    const user = userEvent.setup();
    const onReprovisionClick = vi.fn();
    renderTable({ cajas: [{ ...CAJA, isOrphan: true }], onReprovisionClick });

    expect(screen.getByText("Huérfana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Re-provisionar/i }));
    expect(onReprovisionClick).toHaveBeenCalledWith(expect.objectContaining({ id: "caja-1" }));
  });

  it("no muestra el badge 'huérfana' cuando la caja está sana", () => {
    renderTable();
    expect(screen.queryByText("Huérfana")).not.toBeInTheDocument();
  });

  it("con Posnet muestra el nombre y permite desvincular", async () => {
    const user = userEvent.setup();
    const props = renderTable({ cajas: [{ ...CAJA, device: DEVICE }] });

    expect(screen.getByText("Posnet")).toBeInTheDocument();
    expect(screen.getByText(/Terminal: Caja 1/)).toBeInTheDocument();
    expect(screen.queryByText("QR dinámico")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Desvincular Posnet/i }));
    expect(props.onUnlinkDevice).toHaveBeenCalledWith(DEVICE);
  });

  it("expone Copiar URL y Ver QR cuando hay imagen", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(screen.getByRole("button", { name: /Copiar URL/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ver QR/i }));
    expect(screen.getByRole("dialog", { name: /QR/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Código QR/i })).toHaveAttribute(
      "src",
      "https://mp.example/qr.png",
    );
    expect(screen.getByRole("button", { name: /Guardar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/i })).toBeInTheDocument();
  });
});
