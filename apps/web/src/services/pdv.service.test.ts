import { afterEach, describe, expect, it, vi } from "vitest";
import { pdvService } from "./pdv.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("pdvService — gestión de Posnets (gestion-posnets T20)", () => {
  it("listMpDevices hace GET al listado crudo de MP", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      devices: [],
      token: { source: "seller", userId: "s1" },
      sellerUserId: "s1",
    });

    await pdvService.listMpDevices();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/provisioning/mp-devices");
  });

  it("setDeviceMode hace PATCH del operating-mode con el modo en el body", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      deviceId: "PAX_A910__SMARTPOS1",
      operatingMode: "PDV",
      registeredLocally: true,
    });

    await pdvService.setDeviceMode("PAX_A910__SMARTPOS1", "PDV");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/mercadopago/provisioning/device/PAX_A910__SMARTPOS1/operating-mode",
      { method: "PATCH", body: { mode: "PDV" } },
    );
  });

  it("reprovisionCaja hace POST al reprovision de la caja", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "caja-1" });

    await pdvService.reprovisionCaja("caja-1");

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/mercadopago/provisioning/pos/caja-1/reprovision",
      { method: "POST" },
    );
  });

  it("renameStore hace PUT del nombre a la sucursal", async () => {
    mockedApiFetch.mockResolvedValueOnce({ renamedInMp: true, name: "Nuevo" });

    const result = await pdvService.renameStore("Nuevo");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/provisioning/store", {
      method: "PUT",
      body: { name: "Nuevo" },
    });
    expect(result).toEqual({ renamedInMp: true, name: "Nuevo" });
  });

  it("linkDevice con deviceId null desvincula (Sin Posnet)", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true, device: null });

    await pdvService.linkDevice({ cajaId: "caja-1", deviceId: null });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/provisioning/device", {
      method: "POST",
      body: { cajaId: "caja-1", deviceId: null },
    });
  });
});
