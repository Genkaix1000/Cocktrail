import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { BrandLogo } from "./BrandLogo";
import { useThemeSafe } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useThemeSafe: vi.fn(),
}));

const mockedUseThemeSafe = vi.mocked(useThemeSafe);

describe("BrandLogo", () => {
  it("usa el logo miBoliche cuando no hay ThemeProvider en el árbol", () => {
    mockedUseThemeSafe.mockReturnValue(undefined);
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "miBoliche" })).toHaveAttribute(
      "src",
      "/miboliche-mark.svg",
    );
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
      toggleDark: vi.fn(),
    });
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "Bosko" })).toHaveAttribute("src", "/bosko.webp");
  });

  it("variant lockup usa el wordmark horizontal", () => {
    mockedUseThemeSafe.mockReturnValue({
      theme: "miboliche",
      useLogoUrl: true,
      logoUrl: "/miboliche-mark.svg",
      logoSize: 56,
      textLogoValue: "miBoliche",
      textLogoSize: 26,
      isDark: true,
      toggleDark: vi.fn(),
    });
    render(<BrandLogo variant="lockup" />);
    expect(screen.getByRole("img", { name: "miBoliche" })).toHaveAttribute(
      "src",
      "/miboliche-horizontal.svg",
    );
  });
});
