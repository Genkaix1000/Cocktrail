import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Toast from "./Toast";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Toast", () => {
  it("renderiza el mensaje y llama a onClose al tocar cerrar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Toast message="Configuración guardada correctamente" onClose={onClose} />);

    expect(screen.getByText("Configuración guardada correctamente")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar notificación" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renderiza title y badge cuando vienen cargados", () => {
    render(<Toast message="x1 Fernet" title="Nuevo pedido" badge="#12" onClose={vi.fn()} />);
    expect(screen.getByText("Nuevo pedido")).toBeInTheDocument();
    expect(screen.getByText("#12")).toBeInTheDocument();
  });

  it("se auto-cierra después de la duración indicada", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Toast message="x" duration={2000} onClose={onClose} />);
      vi.advanceTimersByTime(1999);
      expect(onClose).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("el timer de dismiss no se reinicia si onClose cambia de identidad en un re-render", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { rerender } = render(<Toast message="x" duration={5000} onClose={onClose} />);

      vi.advanceTimersByTime(4000);
      rerender(<Toast message="x" duration={5000} onClose={(...args) => onClose(...args)} />);

      vi.advanceTimersByTime(1000);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
