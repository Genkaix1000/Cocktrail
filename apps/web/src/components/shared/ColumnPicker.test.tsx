import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ColumnPicker from "./ColumnPicker";

type Col = "hora" | "detalle" | "total" | "token";

const labels: Record<Col, string> = {
  hora: "Hora",
  detalle: "Detalle",
  total: "Total",
  token: "Token",
};

const cols: Col[] = ["hora", "detalle", "total", "token"];

/**
 * jsdom devuelve 0 en todos los `getBoundingClientRect`, así que el clamping
 * no se puede observar sin fijar geometría a mano: se mockea el rect del botón
 * (pegado al borde derecho, como el ⚙ de la columna ACCIONES) y el del menú.
 */
function mockGeometry({ botonLeft, botonTop }: { botonLeft: number; botonTop: number }) {
  const ANCHO_MENU = 176; // w-44
  const ALTO_MENU = 200;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const esMenu = this.tagName === "DIV";
    return esMenu
      ? ({ width: ANCHO_MENU, height: ALTO_MENU, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
      : ({
          width: 28,
          height: 28,
          top: botonTop,
          bottom: botonTop + 28,
          left: botonLeft,
          right: botonLeft + 28,
          x: botonLeft,
          y: botonTop,
          toJSON: () => ({}),
        } as DOMRect);
  };
}

function estilo() {
  // El menú es el único `div` con position fixed.
  const menu = document.querySelector("div.fixed") as HTMLElement;
  return { left: parseFloat(menu.style.left), top: parseFloat(menu.style.top), menu };
}

describe("ColumnPicker", () => {
  const rectOriginal = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    Element.prototype.getBoundingClientRect = rectOriginal;
    window.innerWidth = 820; // tablet en horizontal
    window.innerHeight = 600;
  });

  it("no se sale de la pantalla cuando el ⚙ está pegado al borde derecho", async () => {
    const user = userEvent.setup();
    // El caso real: el ⚙ vive en la última columna de la tabla de auditoría.
    mockGeometry({ botonLeft: 780, botonTop: 100 });
    render(<ColumnPicker cols={cols} labels={labels} visible={cols} onToggle={vi.fn()} />);

    await user.click(screen.getByLabelText("Configurar columnas"));

    const { left } = estilo();
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 176).toBeLessThanOrEqual(window.innerWidth - 8);
  });

  it("se abre hacia arriba si abajo no entra", async () => {
    const user = userEvent.setup();
    mockGeometry({ botonLeft: 100, botonTop: 500 });
    render(<ColumnPicker cols={cols} labels={labels} visible={cols} onToggle={vi.fn()} />);

    await user.click(screen.getByLabelText("Configurar columnas"));

    const { top } = estilo();
    expect(top + 200).toBeLessThanOrEqual(window.innerHeight - 8);
  });

  it("se ancla normalmente abajo a la izquierda cuando hay lugar", async () => {
    const user = userEvent.setup();
    mockGeometry({ botonLeft: 100, botonTop: 100 });
    render(<ColumnPicker cols={cols} labels={labels} visible={cols} onToggle={vi.fn()} />);

    await user.click(screen.getByLabelText("Configurar columnas"));

    const { left, top } = estilo();
    expect(left).toBe(100);
    expect(top).toBe(132); // bottom (128) + 4
  });

  it("lista las columnas y avisa cuál se tocó", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    mockGeometry({ botonLeft: 100, botonTop: 100 });
    render(<ColumnPicker cols={cols} labels={labels} visible={["hora", "total"]} onToggle={onToggle} />);

    await user.click(screen.getByLabelText("Configurar columnas"));

    expect(screen.getByLabelText("Token")).not.toBeChecked();
    expect(screen.getByLabelText("Hora")).toBeChecked();

    await user.click(screen.getByLabelText("Token"));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("token");
  });
});
