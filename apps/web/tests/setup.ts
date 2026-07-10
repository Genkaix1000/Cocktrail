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
