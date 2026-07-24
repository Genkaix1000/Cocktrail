import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NightActionCard } from "./NightActionCard";

describe("NightActionCard", () => {
  it("muestra Abrir noche cuando no hay noche abierta", async () => {
    const onOpenNight = vi.fn();
    const user = userEvent.setup();
    render(
      <NightActionCard
        nightOpen={false}
        onOpenNight={onOpenNight}
        onCloseNight={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Abrir noche/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cerrar noche/i })).not.toBeInTheDocument();
    expect(screen.getByText(/palabra clave/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Abrir noche/i }));
    expect(onOpenNight).toHaveBeenCalledOnce();
  });

  it("muestra Cerrar noche + Clave cuando hay noche abierta", () => {
    render(
      <NightActionCard
        nightOpen
        onOpenNight={vi.fn()}
        onCloseNight={vi.fn()}
        onEditKeyword={vi.fn()}
        subtitle="Desde 22:00"
      />,
    );
    expect(screen.getByRole("button", { name: /Cerrar noche/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clave de la noche/i })).toBeInTheDocument();
    expect(screen.getByText("Desde 22:00")).toBeInTheDocument();
  });
});
