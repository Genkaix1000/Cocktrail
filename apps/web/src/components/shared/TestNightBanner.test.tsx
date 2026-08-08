import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TestNightBanner } from "./TestNightBanner";

describe("TestNightBanner", () => {
  it("avisa que es una noche de prueba y que no se guarda nada", () => {
    render(<TestNightBanner />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Noche de prueba/i);
    expect(alert).toHaveTextContent(/no se guarda|nada.*se guarda/i);
    expect(alert).toHaveTextContent(/efectivo/i);
    expect(alert).toHaveTextContent(/reinicia/i);
  });

  it("no se puede cerrar: no ofrece ningún botón (B3)", () => {
    render(<TestNightBanner />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
