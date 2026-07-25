import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

// vitest.config.ts tiene `globals: false`, así que @testing-library/react no
// detecta automáticamente el hook afterEach global para limpiar el DOM entre
// tests. Lo registramos acá una sola vez para toda la suite.
afterEach(() => {
  cleanup();
});

// jsdom no implementa matchMedia — polyfill mínimo para hooks responsive
// (ej. useGridColumns). Los tests que necesiten simular breakpoints
// específicos pueden pisar window.matchMedia con su propio mock.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// polyfill localStorage for jsdom environments where it might be undefined or restricted
if (typeof window !== "undefined") {
  if (!window.localStorage) {
    const mockStorage: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = String(value); },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { Object.keys(mockStorage).forEach((key) => delete mockStorage[key]); },
      length: 0,
      key: (index: number) => Object.keys(mockStorage)[index] ?? null,
    };
    Object.defineProperty(storage, "length", {
      get: () => Object.keys(mockStorage).length,
    });
    window.localStorage = storage;
  }
  if (typeof globalThis !== "undefined" && !globalThis.localStorage) {
    Object.defineProperty(globalThis, "localStorage", {
      value: window.localStorage,
      configurable: true,
    });
  }
}
