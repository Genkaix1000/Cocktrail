import { afterEach, describe, expect, it, vi } from "vitest";
import { mercadopagoService } from "./mercadopago.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("mercadopagoService", () => {
  it("createPosIntent hace POST a /api/mercadopago/pos/intent con amount/description", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "intent-1" });

    const result = await mercadopagoService.createPosIntent(5000, "2 Fernet");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent", {
      method: "POST",
      body: { amount: 5000, description: "2 Fernet" },
    });
    expect(result).toEqual({ id: "intent-1" });
  });

  it("getPosIntentStatus hace GET a /api/mercadopago/pos/intent/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: "ON_TERMINAL" });

    await mercadopagoService.getPosIntentStatus("intent-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent/intent-1");
  });

  it("cancelPosIntent hace DELETE a /api/mercadopago/pos/intent/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: "cancelled" });

    await mercadopagoService.cancelPosIntent("intent-1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/mercadopago/pos/intent/intent-1", {
      method: "DELETE",
    });
  });
});
