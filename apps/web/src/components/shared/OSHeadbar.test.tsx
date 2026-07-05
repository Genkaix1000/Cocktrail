import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { OSHeadbar } from "./OSHeadbar";
import { useTheme } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

const mockedUseTheme = vi.mocked(useTheme);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseTheme.mockReturnValue({
    theme: "bosko",
    useLogoUrl: true,
    logoUrl: "/bosko.webp",
    logoSize: 56,
    textLogoValue: "Bosko",
    textLogoSize: 26,
    isDark: true,
    toggleDark: vi.fn(),
  });
});

describe("OSHeadbar", () => {
  it("muestra el badge con la pantalla activa", () => {
    render(<OSHeadbar activeScreen="Admin" />);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });
});
