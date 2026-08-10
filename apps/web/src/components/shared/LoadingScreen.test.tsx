import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import LoadingScreen from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("muestra el label y marca el estado de carga", () => {
    render(<LoadingScreen label="Cargando panel…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Cargando panel…")).toBeInTheDocument();
  });
});
