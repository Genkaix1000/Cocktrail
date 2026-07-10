import { describe, expect, it } from "vitest";
import { fireEvent, render, renderHook } from "@testing-library/react";

import { useProductGridNav } from "./useProductGridNav";

describe("useProductGridNav", () => {
  it("ArrowRight/ArrowDown mueven el índice hacia adelante desde null", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 3, enabled: true }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(result.current.highlightedIndex).toBe(0);

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(result.current.highlightedIndex).toBe(1);
  });

  it("ArrowLeft/ArrowUp mueven el índice hacia atrás y se clampean en 0", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 3, enabled: true }));

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(result.current.highlightedIndex).toBe(0);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(result.current.highlightedIndex).toBe(0);
  });

  it("ArrowDown/ArrowUp saltan `columns` posiciones para moverse de fila", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 10, enabled: true, columns: 3 }));

    fireEvent.keyDown(window, { key: "ArrowDown" }); // null -> 0
    expect(result.current.highlightedIndex).toBe(0);

    fireEvent.keyDown(window, { key: "ArrowDown" }); // 0 -> 3 (fila de abajo)
    expect(result.current.highlightedIndex).toBe(3);

    fireEvent.keyDown(window, { key: "ArrowDown" }); // 3 -> 6
    expect(result.current.highlightedIndex).toBe(6);

    fireEvent.keyDown(window, { key: "ArrowUp" }); // 6 -> 3
    expect(result.current.highlightedIndex).toBe(3);
  });

  it("ArrowDown se clampea en length - 1 aunque el salto de columnas se pase", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 8, enabled: true, columns: 3 }));

    fireEvent.keyDown(window, { key: "ArrowDown" }); // null -> 0
    fireEvent.keyDown(window, { key: "ArrowDown" }); // 0 -> 3
    fireEvent.keyDown(window, { key: "ArrowDown" }); // 3 -> 6
    fireEvent.keyDown(window, { key: "ArrowDown" }); // 6 -> 9, clamp a 7

    expect(result.current.highlightedIndex).toBe(7);
  });

  it("ArrowLeft/ArrowRight siguen moviendo de a uno aunque haya varias columnas", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 10, enabled: true, columns: 3 }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(result.current.highlightedIndex).toBe(1);
  });

  it("se clampea en length - 1 en el extremo derecho", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 2, enabled: true }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(result.current.highlightedIndex).toBe(1);
  });

  it("Escape limpia el índice resaltado", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 3, enabled: true }));

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(result.current.highlightedIndex).toBe(0);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(result.current.highlightedIndex).toBeNull();
  });

  it("no reacciona a las flechas cuando enabled es false", () => {
    const { result } = renderHook(() => useProductGridNav({ length: 3, enabled: false }));

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(result.current.highlightedIndex).toBeNull();
  });

  it("no reacciona a las flechas con foco en un input de texto", () => {
    let highlightedIndex: number | null = null;
    function Wrapper() {
      const nav = useProductGridNav({ length: 3, enabled: true });
      highlightedIndex = nav.highlightedIndex;
      return <input data-testid="buscador" />;
    }
    render(<Wrapper />);

    const input = document.querySelector<HTMLInputElement>('[data-testid="buscador"]')!;
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });

    expect(highlightedIndex).toBeNull();
  });

  it("vuelve a null cuando enabled pasa a false (ej. se abre el checkout)", () => {
    const { result, rerender } = renderHook(
      (props: { enabled: boolean }) => useProductGridNav({ length: 3, enabled: props.enabled }),
      { initialProps: { enabled: true } },
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(result.current.highlightedIndex).toBe(0);

    rerender({ enabled: false });
    expect(result.current.highlightedIndex).toBeNull();
  });
});
