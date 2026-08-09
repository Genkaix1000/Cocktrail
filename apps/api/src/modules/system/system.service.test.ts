import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SystemService } from "./system.service.js";
import {
  resetMigrationsStatusForTests,
  setMigrationsStatus,
} from "../../infra/migrations/migrations-status.js";

describe("SystemService.getHealth", () => {
  beforeEach(() => {
    resetMigrationsStatusForTests();
  });

  afterEach(() => {
    resetMigrationsStatusForTests();
  });

  function makeService() {
    return new SystemService();
  }

  it("status ok cuando las migraciones están limpias", () => {
    setMigrationsStatus({
      state: "ok",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: ["20260101000000_a.sql"],
      pending: [],
      failed: null,
      drift: [],
    });

    const health = makeService().getHealth();

    expect(health.status).toBe("ok");
    expect(health.migrations.appliedNow).toEqual(["20260101000000_a.sql"]);
    expect(typeof health.serverStartedAt).toBe("number");
  });

  it("status degraded cuando una migración falló", () => {
    setMigrationsStatus({
      state: "degraded",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: [],
      pending: ["20260102000000_b.sql"],
      failed: { version: "20260101000000_a.sql", error: "syntax error" },
      drift: [],
    });

    const health = makeService().getHealth();

    expect(health.status).toBe("degraded");
    expect(health.migrations.failed?.version).toBe("20260101000000_a.sql");
  });
});
