import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { useGridColumns } from "./useGridColumns";

function mockMatchMedia(matchesByQuery: Record<string, boolean>) {
  const listeners = new Map<string, Set<() => void>>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matchesByQuery[query] ?? false,
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)!.add(cb);
    },
    removeEventListener: (_: string, cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
  })) as unknown as typeof window.matchMedia;
}

describe("useGridColumns", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve 3 columnas por defecto (breakpoint lg)", () => {
    mockMatchMedia({});
    const { result } = renderHook(() => useGridColumns());

    expect(result.current).toBe(3);
  });

  it("devuelve 4 columnas en xl", () => {
    mockMatchMedia({ "(min-width: 1280px)": true });
    const { result } = renderHook(() => useGridColumns());

    expect(result.current).toBe(4);
  });

  it("devuelve 5 columnas en 2xl", () => {
    mockMatchMedia({ "(min-width: 1280px)": true, "(min-width: 1536px)": true });
    const { result } = renderHook(() => useGridColumns());

    expect(result.current).toBe(5);
  });
});
