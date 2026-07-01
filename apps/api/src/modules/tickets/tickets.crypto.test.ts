import { describe, it, expect } from "vitest";
import { generateTicketCode, verifyTicketIntegrity } from "./tickets.crypto.js";

const SECRET = "test-secret";

describe("generateTicketCode / verifyTicketIntegrity", () => {
  it("genera un código con formato READABLE-SIGNATURE (8+8 caracteres)", () => {
    const code = generateTicketCode("order-1", SECRET);
    const [readable, signature] = code.split("-");
    expect(readable).toHaveLength(8);
    expect(signature).toHaveLength(8);
  });

  it("un código recién generado verifica como válido contra el mismo orderId/secret", () => {
    const code = generateTicketCode("order-1", SECRET);
    expect(verifyTicketIntegrity(code, "order-1", SECRET)).toBe(true);
  });

  it("rechaza el código si se verifica contra un orderId distinto", () => {
    const code = generateTicketCode("order-1", SECRET);
    expect(verifyTicketIntegrity(code, "order-2", SECRET)).toBe(false);
  });

  it("rechaza el código si se verifica con un secret distinto", () => {
    const code = generateTicketCode("order-1", SECRET);
    expect(verifyTicketIntegrity(code, "order-1", "otro-secret")).toBe(false);
  });

  it("rechaza un código con firma manipulada", () => {
    const code = generateTicketCode("order-1", SECRET);
    const [readable] = code.split("-");
    const tampered = `${readable}-00000000`;
    expect(verifyTicketIntegrity(tampered, "order-1", SECRET)).toBe(false);
  });

  it("rechaza un código con formato inválido (sin guión, partes de largo incorrecto)", () => {
    expect(verifyTicketIntegrity("codigo-sin-formato-valido", "order-1", SECRET)).toBe(false);
    expect(verifyTicketIntegrity("ABC-12345678", "order-1", SECRET)).toBe(false);
  });
});
