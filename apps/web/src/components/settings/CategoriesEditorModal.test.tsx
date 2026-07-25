import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
