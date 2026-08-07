import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import SistemaSection from "./SistemaSection";

describe("SistemaSection", () => {
  it("muestra el título y la descarga del APK", () => {
    render(<SistemaSection />);
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descargar app/i })).toHaveAttribute(
      "href",
      "/miboliche-caja.apk",
    );
  });

  // La dirección que la app pide a mano es el origen real del server, no una IP fija.
  it("muestra como dirección del servidor el origen desde el que se sirve la página", async () => {
    render(<SistemaSection />);
    expect(await screen.findByText(window.location.origin)).toBeInTheDocument();
  });
});
