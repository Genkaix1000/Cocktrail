import { describe, it, expect, beforeEach } from "vitest";

import {
  getMigrationsStatus,
  isDegraded,
  resetMigrationsStatusForTests,
  setMigrationsStatus,
  type MigrationsStatus,
} from "./migrations-status.js";

const okStatus: MigrationsStatus = {
  state: "ok",
  lastRunAt: "2026-07-21T00:00:00.000Z",
  appliedNow: [],
  pending: [],
  failed: null,
  drift: [],
};

describe("migrations-status", () => {
  beforeEach(() => {
    resetMigrationsStatusForTests();
  });

  it("arranca en unknown", () => {
    expect(getMigrationsStatus().state).toBe("unknown");
  });

  it("set/get devuelven el mismo estado", () => {
    setMigrationsStatus(okStatus);
    expect(getMigrationsStatus()).toEqual(okStatus);
  });

  it("isDegraded: false con todo limpio", () => {
    expect(isDegraded(okStatus)).toBe(false);
  });

  it("isDegraded: true con failed", () => {
    expect(isDegraded({ ...okStatus, failed: { version: "x", error: "boom" } })).toBe(true);
  });

  it("isDegraded: true con pending", () => {
    expect(isDegraded({ ...okStatus, pending: ["a.sql"] })).toBe(true);
  });

  it("isDegraded: true con drift", () => {
    expect(
      isDegraded({ ...okStatus, drift: [{ version: "a.sql", expected: "1", actual: "2" }] }),
    ).toBe(true);
  });
});
