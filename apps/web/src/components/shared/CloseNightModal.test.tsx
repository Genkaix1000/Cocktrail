import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CloseNightModal from "./CloseNightModal";
import type { EventSummary, EventTotals } from "@cocktrail/shared";

const totals: EventTotals = {
  webTotal: 0,
  webCount: 0,
  efectivoTotal: 1000,
  efectivoCount: 2,
  qrTotal: 500,
  qrCount: 1,
  debitoTotal: 250,
  debitoCount: 1,
  drinksSold: [],
  total: 1750,
};

const summary: EventSummary = {
  id: "ev-1",
  status: "cerrado",
  startedAt: Date.now() - 3 * 60 * 60 * 1000,
  closedAt: Date.now(),
  orderCounter: 4,
  totals,
  orders: [],
};

function baseProps(overrides: Partial<React.ComponentProps<typeof CloseNightModal>> = {}) {
  return {
    totals,
    pendingDeliveries: 0,
    startedAt: Date.now() - 60 * 60 * 1000,
    summary: null,
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
}

async function fillPasswordAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByPlaceholderText(/ingres.*contraseña/i);
  await user.type(input, "clave-secreta");
  const confirmButton = screen.getByRole("button", { name: /confirmar cierre/i });
  await user.click(confirmButton);
}

describe("CloseNightModal", () => {
  it("no expone ningún control de permisos: el chequeo de rol vive en el shell que lo abre", () => {
    render(<CloseNightModal {...baseProps()} />);
    // El modal no debe renderizar nada relacionado a roles/permisos: solo
    // pide la contraseña del usuario ya autenticado por el shell.
    expect(screen.queryByText(/permiso/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rol/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/closeNight/i)).not.toBeInTheDocument();
  });

  it("renderiza los totales por método de pago y el gran total", () => {
    render(<CloseNightModal {...baseProps()} />);
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("Dinero por QR")).toBeInTheDocument();
    expect(screen.getByText("Dinero por Tarjetas")).toBeInTheDocument();
    expect(screen.getByText("$1.750")).toBeInTheDocument();
  });

  it("avisa si hay pedidos pendientes de entrega", () => {
    render(<CloseNightModal {...baseProps({ pendingDeliveries: 3 })} />);
    expect(screen.getByText(/tenés/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("deshabilita 'Confirmar cierre' hasta ingresar contraseña", async () => {
    const user = userEvent.setup();
    render(<CloseNightModal {...baseProps()} />);
    const confirmButton = screen.getByRole("button", { name: /confirmar cierre/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/ingres.*contraseña/i), "1234");
    expect(confirmButton).toBeEnabled();
  });

  it("llama a onConfirm directo con la contraseña (sin demora artificial) y muestra un spinner mientras la promesa está en vuelo", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("clave-secreta");
    // Sin mensajes de progreso inventados: el botón muestra un spinner real
    // mientras la promesa de onConfirm sigue pendiente.
    expect(screen.getByText(/cerrando…/i)).toBeInTheDocument();
    expect(screen.queryByText(/validando clave de seguridad|consolidando arqueo|archivando evento|finalizando cierre/i)).not.toBeInTheDocument();

    resolveConfirm();
  });

  it("muestra un error y vuelve a habilitar el formulario si onConfirm rechaza", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error("Contraseña incorrecta"));
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);

    expect(await screen.findByText("Contraseña incorrecta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar cierre/i })).toBeInTheDocument();
  });

  it("no permite doble submit mientras onConfirm está en curso", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);
    // El botón de cerrar (X) sigue visible pero deshabilitado mientras
    // submitting=true (ya no se oculta el header).
    expect(screen.getByLabelText("Cerrar")).toBeDisabled();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolveConfirm();
  });

  it("renderiza el resumen (comprobante) cuando summary no es null, sin volver a pedir contraseña", () => {
    render(<CloseNightModal {...baseProps({ summary })} />);
    expect(screen.getByText("Cierre de Noche Exitoso")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ingres.*contraseña/i)).not.toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /cerrar y continuar/i });
    expect(closeButton).toBeInTheDocument();
  });

  it("en una noche de prueba avisa que se descarta todo, en vez de hablar de archivar", () => {
    render(<CloseNightModal {...baseProps({ isTest: true })} />);
    expect(screen.getByText(/se descarta todo/i)).toBeInTheDocument();
    expect(screen.getByText(/se descartan los pedidos y los totales/i)).toBeInTheDocument();
    expect(screen.queryByText(/vas a archivar/i)).not.toBeInTheDocument();
  });

  it("el comprobante de una noche de prueba no dice arqueo ni cierre exitoso", () => {
    render(<CloseNightModal {...baseProps({ summary: { ...summary, isTest: true } })} />);
    expect(screen.getByText("Noche de prueba cerrada")).toBeInTheDocument();
    expect(screen.getByText(/no hay arqueo ni historial/i)).toBeInTheDocument();
    expect(screen.queryByText("Cierre de Noche Exitoso")).not.toBeInTheDocument();
    expect(screen.queryByText(/comprobante electrónico de arqueo/i)).not.toBeInTheDocument();
  });

  it("llama a onClose al confirmar el resumen final", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CloseNightModal {...baseProps({ summary, onClose })} />);

    await user.click(screen.getByRole("button", { name: /cerrar y continuar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no actualiza estado si el modal se desmonta mientras onConfirm sigue pendiente (evita error de setState post-unmount)", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    const { unmount } = render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);
    unmount();

    // No debe lanzar (React logueria un warning de setState post-unmount si
    // el guard `isMounted` faltara).
    expect(() => resolveConfirm()).not.toThrow();
  });

  // El confetti vive en un canvas colgado de document.body con z-index 9999:
  // si sobrevive al modal queda flotando sobre el Historial y por delante de
  // cualquier modal que se abra después.
  describe("confetti", () => {
    function countConfettiCanvases() {
      return document.body.querySelectorAll("canvas").length;
    }

    // jsdom no trae contexto 2D y su RAF corre solo: stubeamos ambos para
    // dejar la animación "en curso" y poder observar el ciclo de vida del
    // canvas sin depender de cuántos frames tarden en apagarse las partículas.
    function setupConfettiEnv() {
      vi.useFakeTimers();
      const ctxStub = new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D;
      const getContext = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue(ctxStub as never);
      const cancelRaf = vi.fn();
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", cancelRaf);

      return {
        cancelRaf,
        restore: () => {
          getContext.mockRestore();
          vi.unstubAllGlobals();
          vi.useRealTimers();
        },
      };
    }

    it("saca el canvas del DOM al desmontar el modal y corta la animación", () => {
      const env = setupConfettiEnv();
      try {
        const { unmount } = render(<CloseNightModal {...baseProps({ summary })} />);

        // El confetti arranca 150ms después de que aparece el resumen.
        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(countConfettiCanvases()).toBe(1);

        unmount();
        expect(countConfettiCanvases()).toBe(0);
        expect(env.cancelRaf).toHaveBeenCalled();
      } finally {
        env.restore();
      }
    });

    it("mantiene el canvas mientras el modal sigue montado (no lo corta el fin del wiggle)", () => {
      const env = setupConfettiEnv();
      try {
        render(<CloseNightModal {...baseProps({ summary })} />);

        act(() => {
          vi.advanceTimersByTime(200);
        });
        // El wiggle se apaga a los 700ms: eso no debe llevarse el confetti.
        act(() => {
          vi.advanceTimersByTime(600);
        });
        expect(countConfettiCanvases()).toBe(1);
      } finally {
        env.restore();
      }
    });

    it("no crea canvas en una noche de prueba", () => {
      const env = setupConfettiEnv();
      try {
        render(<CloseNightModal {...baseProps({ summary: { ...summary, isTest: true } })} />);
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        expect(countConfettiCanvases()).toBe(0);
      } finally {
        env.restore();
      }
    });
  });
});
