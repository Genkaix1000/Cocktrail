import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import MpDevToolsPanel from "./MpDevToolsPanel";

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getMpHealth: vi.fn(),
    getSellerStatus: vi.fn(),
    listWebhookEvents: vi.fn(),
    listRecentOrders: vi.fn(),
    getDeviceStatus: vi.fn(),
  },
}));

import { mercadopagoService, type MpRecentOrderRow } from "@/services/mercadopago.service";

const mocked = vi.mocked(mercadopagoService);

const HEALTH = {
  checks: {
    singleSeller: { ok: true as const, detail: "seller 1" },
    cajaProvisioned: { ok: true as const, detail: "caja ok" },
    deviceOwnership: { ok: true as const, detail: "device ok" },
    deviceMode: { ok: true as const, detail: "PDV" },
  },
  fallback: { status: "unknown" as const, checkedAt: null },
  usingEnvDevice: false,
  blocking: false,
  hasLinkedDevice: true,
  checkedAt: "2026-08-09T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getMpHealth.mockResolvedValue(HEALTH);
  mocked.getSellerStatus.mockResolvedValue({
    linked: true,
    status: "active",
    nickname: "BOSKO",
    email: "a@b.com",
    linkedAt: "2026-07-15T22:14:00.000Z",
    displayName: "Bosko",
    userId: "seller-1",
    expiresAt: "2026-09-01T00:00:00.000Z",
    hasAccessToken: true,
    hasRefreshToken: true,
  });
  mocked.listWebhookEvents.mockResolvedValue({
    available: true,
    events: [],
    webhookSecretConfigured: true,
  });
  mocked.listRecentOrders.mockResolvedValue({ orders: [] });
});

describe("MpDevToolsPanel", () => {
  it("arranca plegado y no pide datos hasta expandir", () => {
    render(<MpDevToolsPanel />);
    expect(screen.getByRole("button", { name: /herramientas de desarrollador/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(mocked.getMpHealth).not.toHaveBeenCalled();
    expect(screen.queryByText("Sanidad avanzada")).not.toBeInTheDocument();
  });

  it("al expandir carga y muestra los 4 chequeos aunque estén OK", async () => {
    render(<MpDevToolsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /herramientas de desarrollador/i }));

    await waitFor(() => {
      expect(mocked.getMpHealth).toHaveBeenCalled();
      expect(mocked.listWebhookEvents).toHaveBeenCalledWith(5);
      expect(mocked.listRecentOrders).toHaveBeenCalledWith(5);
    });

    expect(screen.getByText("Sanidad avanzada")).toBeInTheDocument();
    expect(screen.getByText("Cuenta de Mercado Pago")).toBeInTheDocument();
    expect(screen.getByText("Caja provisionada")).toBeInTheDocument();
    expect(screen.getByText("Posnet en la cuenta activa")).toBeInTheDocument();
    expect(screen.getByText("Modo del lector (PDV)")).toBeInTheDocument();
    expect(screen.getByText(/seller-1/)).toBeInTheDocument();
  });

  it("pide de a 5 órdenes y permite cargar más", async () => {
    const mk = (i: number): MpRecentOrderRow => ({
      id: `o-${i}`,
      orderIdMp: `ORD-${i}`,
      externalRef: `REF-${i}`,
      paymentId: null,
      type: "qr",
      amount: 1000 + i,
      status: "processed",
      barId: null,
      deviceId: null,
      rawState: null,
      paymentStatus: null,
      paymentStatusDetail: null,
      paidAmount: null,
      feeStatus: "none",
      verificationError: null,
      createdAt: "2026-08-09T12:00:00.000Z",
      updatedAt: "2026-08-09T12:00:00.000Z",
    });
    mocked.listRecentOrders
      .mockResolvedValueOnce({ orders: Array.from({ length: 5 }, (_, i) => mk(i)) })
      .mockResolvedValueOnce({ orders: Array.from({ length: 10 }, (_, i) => mk(i)) });

    render(<MpDevToolsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /herramientas de desarrollador/i }));

    await waitFor(() => expect(mocked.listRecentOrders).toHaveBeenCalledWith(5));
    expect(await screen.findByText("mostrando 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cargar 5 más/i }));
    await waitFor(() => expect(mocked.listRecentOrders).toHaveBeenCalledWith(10));
    expect(await screen.findByText("mostrando 10")).toBeInTheDocument();
  });
});
