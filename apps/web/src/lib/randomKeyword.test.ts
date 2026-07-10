import { describe, expect, it } from "vitest";

import { getRandomKeyword, NIGHT_KEYWORDS } from "./randomKeyword";

describe("getRandomKeyword", () => {
  it("devuelve una palabra de la lista curada", () => {
    const keyword = getRandomKeyword();

    expect(NIGHT_KEYWORDS).toContain(keyword);
  });

  it("nunca repite la palabra excluida (con suficientes intentos)", () => {
    const exclude = NIGHT_KEYWORDS[0]!;

    for (let i = 0; i < 50; i++) {
      expect(getRandomKeyword(exclude)).not.toBe(exclude);
    }
  });

  it("no crashea si exclude no está en la lista", () => {
    expect(() => getRandomKeyword("PALABRA-INEXISTENTE")).not.toThrow();
  });

  it("la lista curada tiene al menos 15 palabras (variedad mínima)", () => {
    expect(NIGHT_KEYWORDS.length).toBeGreaterThanOrEqual(15);
  });

  it("todas las palabras están en mayúsculas y sin espacios", () => {
    for (const word of NIGHT_KEYWORDS) {
      expect(word).toBe(word.toUpperCase());
      expect(word).not.toMatch(/\s/);
    }
  });
});
