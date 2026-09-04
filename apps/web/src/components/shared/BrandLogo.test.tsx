import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandLogo } from "./BrandLogo";
import { useThemeSafe } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useThemeSafe: vi.fn(),
}));

const mockedUseThemeSafe = vi.mocked(useThemeSafe);

describe("BrandLogo", () => {
  it("usa el fallback 'Cocktrail' cuando no hay ThemeProvider en el árbol", () => {
    mockedUseThemeSafe.mockReturnValue(undefined);
    render(<BrandLogo />);
    expect(screen.getByText("Cocktrail")).toBeInTheDocument();
  });

  it("renderiza el texto del logo cuando useLogoUrl es false", () => {
    mockedUseThemeSafe.mockReturnValue({
      theme: "bosko",
      useLogoUrl: false,
      logoUrl: "",
      logoSize: 56,
      textLogoValue: "Bosko",
      textLogoSize: 26,
      isDark: true,
      brandingReady: true,
      toggleDark: vi.fn(),
    });
    render(<BrandLogo />);
    expect(screen.getByText("Bosko")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renderiza una imagen cuando useLogoUrl es true y hay logoUrl", () => {
    mockedUseThemeSafe.mockReturnValue({
      theme: "bosko",
      useLogoUrl: true,
      logoUrl: "/bosko.webp",
      logoSize: 56,
      textLogoValue: "Bosko",
      textLogoSize: 26,
      isDark: true,
      brandingReady: true,
      toggleDark: vi.fn(),
    });
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "Bosko" })).toHaveAttribute("src", "/bosko.webp");
  });
});
