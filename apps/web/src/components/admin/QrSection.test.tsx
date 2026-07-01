import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import QrSection from "./QrSection";

describe("QrSection", () => {
  it("renderiza sin crashear y muestra el título", () => {
    render(<QrSection isBosko={false} />);
    expect(screen.getByText("QR para la Carta")).toBeInTheDocument();
  });

  it("resuelve la URL de la carta y renderiza el QR", async () => {
    render(<QrSection isBosko={false} />);
    await waitFor(() => {
      expect(screen.queryByText("Cargando URL…")).not.toBeInTheDocument();
    });
  });

  it("muestra el botón de imprimir", () => {
    render(<QrSection isBosko />);
    expect(screen.getByRole("button", { name: /imprimir qr/i })).toBeInTheDocument();
  });
});
