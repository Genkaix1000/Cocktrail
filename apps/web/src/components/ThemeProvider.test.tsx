import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider, useTheme } from "./ThemeProvider";
import { useSSE } from "@/lib/useSSE";
import type { DomainEventHandlers } from "@/lib/useSSE";

vi.mock("@/lib/useSSE", () => ({
  useSSE: vi.fn(),
}));

const mockedUseSSE = vi.mocked(useSSE);

function ThemeProbe() {
  const { theme, isDark, textLogoValue, toggleDark } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="isDark">{String(isDark)}</span>
      <span data-testid="textLogoValue">{textLogoValue}</span>
      <button onClick={toggleDark}>toggle-dark</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme");
  mockedUseSSE.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ThemeProvider", () => {
  it("expone el theme por default ('bosko') a través del contexto", async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("bosko"));
  });

  it("useTheme() tira si se usa fuera de un ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThemeProbe />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
    spy.mockRestore();
  });

  it("toggleDark alterna isDark, persiste en localStorage y togglea la clase 'dark'", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("isDark")).toHaveTextContent("true"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await user.click(screen.getByText("toggle-dark"));

    expect(screen.getByTestId("isDark")).toHaveTextContent("false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("actualiza el branding al recibir el evento SSE 'theme.changed'", async () => {
    let capturedHandlers: DomainEventHandlers = {};
    mockedUseSSE.mockImplementation((handlers) => {
      capturedHandlers = handlers;
    });

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("bosko"));

    capturedHandlers["theme.changed"]?.({ theme: "bosko", textLogoValue: "Club Nuevo" });

    await waitFor(() =>
      expect(screen.getByTestId("textLogoValue")).toHaveTextContent("Club Nuevo")
    );
    expect(localStorage.getItem("cocktrail_text_logo_value")).toBe("Club Nuevo");
  });
});
