import { afterEach, describe, expect, it } from "vitest";
import { buildAppVersionInfo } from "./app-version.js";

const ENV_KEYS = [
  "APP_VERSION",
  "APP_CHANNEL",
  "NODE_ENV",
  "KOYEB_APP_NAME",
  "KOYEB_SERVICE_ID",
  "KOYEB_SERVICE_NAME",
  "KOYEB_GIT_SHA",
  "KOYEB_GIT_BRANCH",
  "KOYEB_PUBLIC_DOMAIN",
  "RENDER",
  "RENDER_SERVICE_ID",
  "RENDER_SERVICE_NAME",
  "RENDER_GIT_COMMIT",
  "RENDER_GIT_BRANCH",
  "RENDER_EXTERNAL_URL",
  "FRONTEND_URL",
  "GIT_COMMIT",
  "COMMIT_SHA",
  "GIT_BRANCH",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (key in saved) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
      delete saved[key];
    }
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("buildAppVersionInfo", () => {
  it("arma label beta 0.1.0 y detecta Koyeb por env", () => {
    setEnv("APP_VERSION", undefined);
    setEnv("APP_CHANNEL", undefined);
    setEnv("NODE_ENV", "production");
    setEnv("KOYEB_APP_NAME", "bosko");
    setEnv("KOYEB_SERVICE_NAME", "bosko");
    setEnv("KOYEB_GIT_SHA", "abcdef0123456789");
    setEnv("KOYEB_GIT_BRANCH", "develop");
    setEnv("KOYEB_PUBLIC_DOMAIN", "bosko-cipher.koyeb.app");

    const info = buildAppVersionInfo({
      serverStartedAt: Date.now() - 65_000,
      migrations: {
        state: "ok",
        pending: [],
        appliedNow: ["20260101000000_init.sql"],
      },
    });

    expect(info.version).toBe("0.1.0");
    expect(info.channel).toBe("beta");
    expect(info.label).toBe("0.1.0-beta");
    expect(info.deploy.provider).toBe("koyeb");
    expect(info.deploy.service).toBe("bosko");
    expect(info.deploy.commitShort).toBe("abcdef0");
    expect(info.deploy.branch).toBe("develop");
    expect(info.deploy.externalUrl).toBe("https://bosko-cipher.koyeb.app");
    expect(info.runtime.uptimeSec).toBeGreaterThanOrEqual(65);
    expect(info.migrations.lastApplied).toBe("20260101000000_init.sql");
    if (info.releaseNotes) {
      expect(info.releaseNotes.version).toBe("0.1.0");
      expect(info.releaseNotes.highlights.length).toBeGreaterThan(0);
    }
  });

  it("en desarrollo sin host cloud reporta provider local", () => {
    setEnv("KOYEB_APP_NAME", undefined);
    setEnv("KOYEB_SERVICE_ID", undefined);
    setEnv("RENDER", undefined);
    setEnv("RENDER_SERVICE_ID", undefined);
    setEnv("NODE_ENV", "development");

    const info = buildAppVersionInfo({
      serverStartedAt: Date.now(),
      migrations: { state: "ok", pending: ["x.sql"], appliedNow: [] },
    });

    expect(info.deploy.provider).toBe("local");
    expect(info.migrations.pendingCount).toBe(1);
    expect(info.migrations.lastApplied).toBeNull();
  });
});
