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
