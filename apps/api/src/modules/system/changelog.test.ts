import { describe, expect, it } from "vitest";
import { parseReleaseNotes } from "./changelog.js";

const SAMPLE = `# Changelog

## [0.2.0] - 2026-09-01

### Added

- Cosa nueva grande.

## [0.1.0] - 2026-08-09

### Added

- Tours de ayuda contextuales.
- Panel de versión en Sistema.

### Changed

- Cobro en caja más claro.

## [0.0.1] - 2026-01-01

- Ignorar.
`;

describe("parseReleaseNotes", () => {
  it("saca highlights y fecha de la versión pedida", () => {
    const notes = parseReleaseNotes(SAMPLE, "0.1.0");
    expect(notes).toEqual({
      version: "0.1.0",
      date: "2026-08-09",
      highlights: [
        "Tours de ayuda contextuales.",
        "Panel de versión en Sistema.",
        "Cobro en caja más claro.",
      ],
    });
  });

  it("devuelve null si la versión no está", () => {
    expect(parseReleaseNotes(SAMPLE, "9.9.9")).toBeNull();
  });
});
