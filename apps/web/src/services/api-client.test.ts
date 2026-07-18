import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api-client";
import { ACTIVE_BAR_STORAGE_KEY } from "@/lib/bar-context";

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  text?: string;
  jsonError?: boolean;
}) {
  const mockRes = {
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    text: vi.fn().mockResolvedValue(response.text ?? ""),
    json: response.jsonError
      ? vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"))
      : vi.fn().mockResolvedValue(response.text ? JSON.parse(response.text) : {}),
  };
  vi.mocked(fetch).mockResolvedValueOnce(mockRes as unknown as Response);
  return mockRes;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem(ACTIVE_BAR_STORAGE_KEY);
  });

  it("hace GET por defecto, con credentials include y Content-Type json", async () => {
    mockFetchOnce({ ok: true, text: JSON.stringify({ id: "1" }) });

    const result = await apiFetch<{ id: string }>("/api/drinks");

    expect(result).toEqual({ id: "1" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/drinks",
      expect.objectContaining({
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: undefined,
      }),
    );
  });

  it("serializa el body y agrega headers custom en POST", async () => {
    mockFetchOnce({ ok: true, text: JSON.stringify({ ok: true }) });

    await apiFetch("/api/orders", {
      method: "POST",
      body: { qty: 2 },
      headers: { "X-Custom": "1" },
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ qty: 2 }),
        headers: { "Content-Type": "application/json", "X-Custom": "1" },
      }),
    );
  });

  it("envía la caja seleccionada como contexto operativo", async () => {
    localStorage.setItem(ACTIVE_BAR_STORAGE_KEY, "bar-vip");
    mockFetchOnce({ ok: true, text: JSON.stringify({ ok: true }) });

    await apiFetch("/api/mercadopago/device/status");

    expect(fetch).toHaveBeenCalledWith(
      "/api/mercadopago/device/status",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Bar-Id": "bar-vip",
        },
      }),
    );
  });

  it("devuelve null cuando el body de la respuesta está vacío", async () => {
    mockFetchOnce({ ok: true, text: "" });

    const result = await apiFetch("/api/auth/me");

    expect(result).toBeNull();
  });

  it("lanza ApiError con el mensaje del body cuando la respuesta no es ok", async () => {
    mockFetchOnce({ ok: false, status: 401, text: JSON.stringify({ error: "No autorizado" }) });

    await expect(apiFetch("/api/auth/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("incluye el status y el mensaje del body en el ApiError lanzado", async () => {
    mockFetchOnce({ ok: false, status: 401, text: JSON.stringify({ error: "No autorizado" }) });

    await expect(apiFetch("/api/auth/me")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "No autorizado",
    });
  });

  it("usa fallback 'Error desconocido' cuando el body de error no es JSON parseable", async () => {
    mockFetchOnce({ ok: false, status: 500, jsonError: true });

    await expect(apiFetch("/api/config")).rejects.toMatchObject({
      status: 500,
      message: "Error desconocido",
    });
  });

  it("usa fallback HTTP {status} cuando el JSON de error no trae campo error", async () => {
    mockFetchOnce({ ok: false, status: 404, text: JSON.stringify({}) });

    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 404,
      message: "HTTP 404",
    });
  });

  it("propaga el AbortSignal a fetch", async () => {
    mockFetchOnce({ ok: true, text: "" });
    const controller = new AbortController();

    await apiFetch("/api/x", { signal: controller.signal });

    expect(fetch).toHaveBeenCalledWith(
      "/api/x",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
