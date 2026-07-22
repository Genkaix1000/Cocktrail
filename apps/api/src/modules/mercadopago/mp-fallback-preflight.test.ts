import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../config/env.js";
import {
  getMpFallbackStatus,
  markMpFallbackDegraded,
  resetMpFallbackStatusForTests,
  runMpFallbackPreflight,
} from "./mp-fallback-preflight.js";

const TOKEN = "APP_USR-super-secreto-que-jamas-debe-loguearse";
const DEVICE = "PAX_A910__SMARTPOS123";

function mockFetchOnce(response: { ok: boolean; status?: number; body?: unknown }) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: vi.fn().mockResolvedValue(response.body ?? {}),
  } as unknown as Response);
}

describe("runMpFallbackPreflight", () => {
  let savedToken: string | undefined;
  let savedDevice: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    resetMpFallbackStatusForTests();
    savedToken = env.MP_ACCESS_TOKEN;
    savedDevice = env.MP_POS_DEVICE_ID;
    env.MP_ACCESS_TOKEN = TOKEN;
    env.MP_POS_DEVICE_ID = DEVICE;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    env.MP_ACCESS_TOKEN = savedToken;
    env.MP_POS_DEVICE_ID = savedDevice;
    resetMpFallbackStatusForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function assertTokenNeverLeaked(status: ReturnType<typeof getMpFallbackStatus>) {
    const logged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(logged).not.toContain(TOKEN);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
  }

  it("estado inicial: unknown con checkedAt null (todavía no corrió)", () => {
    expect(getMpFallbackStatus()).toMatchObject({ status: "unknown", checkedAt: null });
  });

  it("sin MP_ACCESS_TOKEN → unknown y lo dice", async () => {
    env.MP_ACCESS_TOKEN = undefined;
    const result = await runMpFallbackPreflight();
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("MP_ACCESS_TOKEN");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("usable: /users/me ok y el device figura en el listado (con operating_mode)", async () => {
    mockFetchOnce({ ok: true, body: { id: 1517393956 } });
    mockFetchOnce({ ok: true, body: { devices: [{ id: DEVICE, operating_mode: "PDV" }] } });

    const result = await runMpFallbackPreflight();

    expect(result).toMatchObject({
      status: "usable",
      tokenUserId: "1517393956",
      deviceSeen: true,
      operatingMode: "PDV",
    });
    expect(result.checkedAt).toBeTruthy();
    expect(getMpFallbackStatus()).toEqual(result);
    assertTokenNeverLeaked(result);
  });

  it("unusable: el token no ve el lector configurado", async () => {
    mockFetchOnce({ ok: true, body: { id: 42 } });
    mockFetchOnce({ ok: true, body: { devices: [{ id: "OTRO_DEVICE" }] } });

    const result = await runMpFallbackPreflight();

    expect(result).toMatchObject({ status: "unusable", tokenUserId: "42", deviceSeen: false });
    expect(result.reason).toContain(DEVICE);
    assertTokenNeverLeaked(result);
  });

  it("unusable: token rechazado por MP (401 en /users/me)", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await runMpFallbackPreflight();

    expect(result.status).toBe("unusable");
    expect(result.reason).toContain("401");
    assertTokenNeverLeaked(result);
  });

  it("unknown: MP caído / sin internet — NUNCA lanza", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    const result = await runMpFallbackPreflight();

    expect(result.status).toBe("unknown");
    expect(result.reason).toBeTruthy();
    assertTokenNeverLeaked(result);
  });

  it("unknown: sin MP_POS_DEVICE_ID conserva el tokenUserId (lo usa la guarda F1.b)", async () => {
    env.MP_POS_DEVICE_ID = undefined;
    mockFetchOnce({ ok: true, body: { id: 7 } });

    const result = await runMpFallbackPreflight();

    expect(result).toMatchObject({ status: "unknown", tokenUserId: "7" });
    expect(result.reason).toContain("MP_POS_DEVICE_ID");
  });

  it("el flag de degradación (F1.a) sobrevive a una re-evaluación del preflight", async () => {
    markMpFallbackDegraded("no se pudo descifrar el token del seller seller-1");
    mockFetchOnce({ ok: true, body: { id: 1 } });
    mockFetchOnce({ ok: true, body: { devices: [{ id: DEVICE, operating_mode: "PDV" }] } });

    const result = await runMpFallbackPreflight();

    expect(result.lastDegradedReason).toContain("seller-1");
    expect(result.lastDegradedAt).toBeTruthy();
  });
});
