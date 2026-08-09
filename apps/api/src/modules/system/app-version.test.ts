import { afterEach, describe, expect, it } from "vitest";
import { buildAppVersionInfo } from "./app-version.js";

const ENV_KEYS = [
  "APP_VERSION",
  "APP_CHANNEL",
  "NODE_ENV",
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
  it("arma label beta 0.1.0 y detecta Render por env", () => {
    setEnv("APP_VERSION", undefined);
    setEnv("APP_CHANNEL", undefined);
    setEnv("NODE_ENV", "production");
    setEnv("RENDER", "true");
    setEnv("RENDER_SERVICE_NAME", "bosko");
    setEnv("RENDER_GIT_COMMIT", "abcdef0123456789");
    setEnv("RENDER_GIT_BRANCH", "develop");
    setEnv("RENDER_EXTERNAL_URL", "https://bosko.onrender.com");

    // Re-import would be needed if constants were cached — APP_VERSION is read
    // at module load. buildAppVersionInfo uses process.env for deploy; version
    // constants are module-level. Test deploy fields + migrations here; version
    // defaults are covered by the live module values (0.1.0/beta).
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
    expect(info.deploy.provider).toBe("render");
    expect(info.deploy.service).toBe("bosko");
    expect(info.deploy.commitShort).toBe("abcdef0");
    expect(info.deploy.branch).toBe("develop");
    expect(info.deploy.externalUrl).toBe("https://bosko.onrender.com");
    expect(info.runtime.uptimeSec).toBeGreaterThanOrEqual(65);
    expect(info.migrations.lastApplied).toBe("20260101000000_init.sql");
    // Si el runner corre desde el monorepo, el CHANGELOG de 0.1.0 se resuelve.
    if (info.releaseNotes) {
      expect(info.releaseNotes.version).toBe("0.1.0");
      expect(info.releaseNotes.highlights.length).toBeGreaterThan(0);
    }
  });

  it("en desarrollo sin Render reporta provider local", () => {
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
