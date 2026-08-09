import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CategoriesEditorModal from "./CategoriesEditorModal";
import type { DrinkCategory } from "@cocktrail/shared";

describe("CategoriesEditorModal", () => {
  const categories: DrinkCategory[] = [
    { id: "cat-1", name: "Tendencias", sortOrder: 1 },
    { id: "cat-2", name: "Tragos", sortOrder: 2 },
  ];

  it("renderiza la categoría Tendencias como Sistema e inmutable sin botón de eliminar", () => {
    render(
      <CategoriesEditorModal
        categories={categories}
        onChange={vi.fn()}
        onCreate={vi.fn()}
        onReorder={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Tendencias")).toBeInTheDocument();
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /eliminar tendencias/i })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: /eliminar tragos/i })).toBeInTheDocument();
  });

  it("reordena desde el asa, sin usar el drag nativo del navegador", () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    render(
      <CategoriesEditorModal
        categories={categories}
        onChange={vi.fn()}
        onCreate={vi.fn()}
        onReorder={onReorder}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const firstHandle = screen.getByRole("button", { name: "Arrastrar Tendencias" });
    const secondHandle = screen.getByRole("button", { name: "Arrastrar Tragos" });
    Object.defineProperty(firstHandle.parentElement, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 44, height: 44 }),
    });
    Object.defineProperty(secondHandle.parentElement, "getBoundingClientRect", {
      value: () => ({ top: 54, bottom: 98, height: 44 }),
    });

    fireEvent.pointerDown(firstHandle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(firstHandle, { pointerId: 1, clientY: 90 });
    fireEvent.pointerUp(firstHandle, { pointerId: 1, clientY: 90 });

    expect(onReorder).toHaveBeenCalledWith(["cat-2", "cat-1"]);
  });
});
