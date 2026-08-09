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

});
