import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OpenNightModal from "./OpenNightModal";
import { eventsService } from "@/services/events.service";
import { NIGHT_KEYWORDS } from "@/lib/randomKeyword";

import type { NightEvent } from "@cocktrail/shared";

vi.mock("@/services/events.service", () => ({
  eventsService: {
    openEvent: vi.fn(),
    setKeyword: vi.fn(),
  },
}));

const mockedEventsService = vi.mocked(eventsService);

function makeNightEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "event-1",
    keyword: "TEQUILA",
    startedAt: Date.now(),
    ...overrides,
  } as NightEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpenNightModal", () => {
  describe("modo open", () => {
    it("abre la noche con la palabra clave ingresada", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const event = makeNightEvent({ keyword: "MOJITO" });
      mockedEventsService.openEvent.mockResolvedValue(event);

      render(<OpenNightModal mode="open" onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText("ej. TEQUILA");
      await user.type(input, "MOJITO");

      const submitButton = screen.getByRole("button", { name: /Abrir noche/i });
      await user.click(submitButton);

      await waitFor(() => expect(mockedEventsService.openEvent).toHaveBeenCalledWith("MOJITO"));
      expect(mockedEventsService.setKeyword).not.toHaveBeenCalled();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event));
    });

    it("no permite enviar con la palabra clave vacía", async () => {
      const onSubmit = vi.fn();

      render(<OpenNightModal mode="open" onSubmit={onSubmit} />);

      const submitButton = screen.getByRole("button", { name: /Abrir noche/i });
      expect(submitButton).toBeDisabled();
      expect(mockedEventsService.openEvent).not.toHaveBeenCalled();
    });

    it("muestra un error si la palabra clave es solo espacios", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(<OpenNightModal mode="open" onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText("ej. TEQUILA");
      await user.type(input, "   ");

      // El input tiene contenido (no está disabled), pero el submit debe
      // rechazar la clave vacía tras el trim().
      const form = input.closest("form")!;
      form.requestSubmit();

      expect(
        await screen.findByText("Ingresá una palabra clave para la noche."),
      ).toBeInTheDocument();
      expect(mockedEventsService.openEvent).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("muestra el error del service cuando falla la apertura", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      mockedEventsService.openEvent.mockRejectedValue(new Error("Ya hay una noche abierta"));

      render(<OpenNightModal mode="open" onSubmit={onSubmit} />);

      const input = screen.getByPlaceholderText("ej. TEQUILA");
      await user.type(input, "MOJITO");
      await user.click(screen.getByRole("button", { name: /Abrir noche/i }));

      expect(await screen.findByText("Ya hay una noche abierta")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("el botón Generar palabra completa el input con una palabra de la lista curada", async () => {
      const user = userEvent.setup();
      render(<OpenNightModal mode="open" onSubmit={vi.fn()} />);

      const input = screen.getByPlaceholderText("ej. TEQUILA") as HTMLInputElement;
      expect(input.value).toBe("");

      await user.click(screen.getByRole("button", { name: /Generar palabra/i }));

      expect(NIGHT_KEYWORDS).toContain(input.value);
    });

    it("después de generar una palabra, el submit sigue funcionando igual", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const event = makeNightEvent({ keyword: "TEQUILA" });
      mockedEventsService.openEvent.mockResolvedValue(event);

      render(<OpenNightModal mode="open" onSubmit={onSubmit} />);

      await user.click(screen.getByRole("button", { name: /Generar palabra/i }));
      const input = screen.getByPlaceholderText("ej. TEQUILA") as HTMLInputElement;
      const generated = input.value;

      await user.click(screen.getByRole("button", { name: /Abrir noche/i }));

      await waitFor(() => expect(mockedEventsService.openEvent).toHaveBeenCalledWith(generated));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(event));
    });
  });

  describe("modo edit", () => {
    it("no muestra el botón Generar palabra (solo tiene sentido al abrir, no al editar)", () => {
      render(
        <OpenNightModal mode="edit" onClose={vi.fn()} onSubmit={vi.fn()} currentKeyword="TEQUILA" />,
      );

      expect(screen.queryByRole("button", { name: /Generar palabra/i })).not.toBeInTheDocument();
    });

    it("precarga la palabra clave actual y guarda la nueva", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const onClose = vi.fn();
      const updatedEvent = makeNightEvent({ keyword: "RON" });
      mockedEventsService.setKeyword.mockResolvedValue(updatedEvent);

      render(
        <OpenNightModal
          mode="edit"
          onClose={onClose}
          onSubmit={onSubmit}
          currentKeyword="TEQUILA"
        />,
      );

      const input = screen.getByPlaceholderText("ej. TEQUILA") as HTMLInputElement;
      expect(input.value).toBe("TEQUILA");

      await user.clear(input);
      await user.type(input, "RON");
      await user.click(screen.getByRole("button", { name: /Guardar clave/i }));

      await waitFor(() => expect(mockedEventsService.setKeyword).toHaveBeenCalledWith("RON"));
      expect(mockedEventsService.openEvent).not.toHaveBeenCalled();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(updatedEvent));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("cada apertura nueva muestra la keyword vigente (el padre monta el modal de cero)", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      const { unmount } = render(
        <OpenNightModal mode="edit" onClose={onClose} onSubmit={onSubmit} currentKeyword="TEQUILA" />,
      );
      unmount();

      // La palabra clave cambió por fuera (ej: otra pestaña) mientras el modal
      // estaba cerrado (desmontado) -- la próxima apertura debe traer la vigente.
      render(
        <OpenNightModal mode="edit" onClose={onClose} onSubmit={onSubmit} currentKeyword="VODKA" />,
      );

      const input = screen.getByPlaceholderText("ej. TEQUILA") as HTMLInputElement;
      expect(input.value).toBe("VODKA");
    });
  });
});
