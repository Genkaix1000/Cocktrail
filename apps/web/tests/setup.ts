import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

// vitest.config.ts tiene `globals: false`, así que @testing-library/react no
// detecta automáticamente el hook afterEach global para limpiar el DOM entre
// tests. Lo registramos acá una sola vez para toda la suite.
afterEach(() => {
  cleanup();
});
