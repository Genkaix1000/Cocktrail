import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppTopbar } from "./AppTopbar";
import { useTheme } from "@/components/ThemeProvider";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

const mockedUseTheme = vi.mocked(useTheme);
const toggleDark = vi.fn();

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
    toggleDark,
  });
});

describe("AppTopbar", () => {
  it("muestra el breadcrumb y el usuario (nombre + rol)", () => {
    render(
      <AppTopbar
        breadcrumbs={["Administración", "Dashboard"]}
        username="manuel"
        role="admin"
      />,
    );
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getByText("manuel")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("sin username no inventa 'Admin'", () => {
    render(<AppTopbar breadcrumbs={["Caja"]} role="caja" />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("caja")).toBeInTheDocument();
  });

  it("el toggle día/noche llama toggleDark", async () => {
    const user = userEvent.setup();
    render(<AppTopbar breadcrumbs={["Admin"]} username="manuel" role="admin" />);
    await user.click(screen.getByRole("button", { name: /modo día/i }));
    expect(toggleDark).toHaveBeenCalledOnce();
  });
});
