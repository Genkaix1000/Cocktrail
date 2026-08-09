import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpCenterProvider, useHelp } from "./HelpCenterProvider";
import { SectionHelpButton } from "./SectionHelpButton";
import { HELP_GENERAL_SEEN_KEY } from "./helpTours";

const runSteps = vi.fn().mockResolvedValue(undefined);

vi.mock("@/components/tour/TourProvider", async () => {
  const React = await import("react");
  return {
    TourProvider: ({
      children,
      onTourEnd,
    }: {
      children: React.ReactNode;
      onTourEnd?: (reason: string, meta?: { categoryId?: string }) => void;
    }) => {
      void onTourEnd;
      return <>{children}</>;
    },
    useTour: () => ({
      running: false,
      start: vi.fn(),
      runSteps,
      next: vi.fn(),
      prev: vi.fn(),
      end: vi.fn(),
      goto: vi.fn(),
    }),
  };
});

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getSellerStatus: vi.fn().mockResolvedValue({
      linked: true,
      status: "active",
      displayName: "Test",
    }),
  },
}));

vi.mock("@/services/pdv.service", () => ({
  pdvService: {
    listCajas: vi.fn().mockResolvedValue([]),
  },
}));

function GeneralBtn() {
  const help = useHelp();
  return (
    <button type="button" onClick={() => void help.startGeneralTour()}>
      Ayuda general
    </button>
  );
}

describe("Help contextual", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(HELP_GENERAL_SEEN_KEY, "1");
    runSteps.mockClear();
  });

  it("startGeneralTour corre el tour general", async () => {
    render(
      <HelpCenterProvider role="admin" onNavigateTab={vi.fn()}>
        <GeneralBtn />
      </HelpCenterProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /ayuda general/i }));

    await waitFor(() => expect(runSteps).toHaveBeenCalled());
    const [steps, opts] = runSteps.mock.calls[0]!;
    expect(opts).toEqual({ categoryId: "general" });
    expect(steps.some((s: { id: string }) => s.id === "general-nav")).toBe(true);
    expect(steps.some((s: { id: string }) => s.id === "general-pagos")).toBe(true);
  });

  it("SectionHelpButton dispara el tour de la categoría", async () => {
    render(
      <HelpCenterProvider role="admin" onNavigateTab={vi.fn()}>
        <SectionHelpButton category="carta" />
      </HelpCenterProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /tour de esta sección/i }));

    await waitFor(() => expect(runSteps).toHaveBeenCalled());
    expect(runSteps.mock.calls[0]![1]).toEqual({ categoryId: "carta" });
  });

  it("first-visit arranca el tour general si no hay general_seen", async () => {
    localStorage.clear();
    vi.useFakeTimers();
    render(
      <HelpCenterProvider role="admin" onNavigateTab={vi.fn()}>
        <span>app</span>
      </HelpCenterProvider>,
    );
    expect(localStorage.getItem(HELP_GENERAL_SEEN_KEY)).toBe("1");
    await vi.advanceTimersByTimeAsync(700);
    expect(runSteps).toHaveBeenCalled();
    expect(runSteps.mock.calls[0]![1]).toEqual({ categoryId: "general" });
    vi.useRealTimers();
  });
});
