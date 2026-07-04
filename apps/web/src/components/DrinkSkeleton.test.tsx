import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import DrinkSkeleton from "./DrinkSkeleton";

describe("DrinkSkeleton", () => {
  it("renderiza la variante regular por default sin crashear", () => {
    const { container } = render(<DrinkSkeleton />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renderiza la variante hero con su layout propio", () => {
    const { container } = render(<DrinkSkeleton variant="hero" />);
    expect(container.querySelector(".min-h-\\[140px\\]")).toBeInTheDocument();
  });
});
