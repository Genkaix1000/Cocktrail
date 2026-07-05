import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  cashSales: [],
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

// El flujo real hace pasar al usuario por una secuencia de "carga ficticia"
// (~3.2s de setTimeouts) antes de invocar onConfirm. Usamos fake timers para
// no pagar ese costo en cada test y para poder ejercitar los estados
// intermedios de forma determinística.
async function fillPasswordAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByPlaceholderText(/ingres.*contraseña/i);
  await user.type(input, "clave-secreta");
  const confirmButton = screen.getByRole("button", { name: /confirmar cierre/i });
  await user.click(confirmButton);
}

describe("CloseNightModal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CloseNightModal {...baseProps()} />);
    const confirmButton = screen.getByRole("button", { name: /confirmar cierre/i });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/ingres.*contraseña/i), "1234");
    expect(confirmButton).toBeEnabled();
  });

  it("llama a onConfirm con la contraseña tras la secuencia de carga y muestra el estado pendiente mientras la promesa está en vuelo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);

    // Durante la secuencia de carga ficticia todavía no se llamó a onConfirm.
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/validando clave de seguridad/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3200);

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("clave-secreta");
    // Mientras la promesa de onConfirm sigue pendiente, el modal se queda en
    // la vista de carga (submitting=true nunca se refleja en la UI: fakeLoading
    // sigue en true hasta que la promesa resuelve o rechaza — ver hallazgo
    // documentado sobre el estado "submitting" inalcanzable en ConfirmView).
    expect(screen.getByText(/finalizando cierre/i)).toBeInTheDocument();

    resolveConfirm();
    await vi.runAllTimersAsync();
  });

  it("muestra un error y vuelve a habilitar el formulario si onConfirm rechaza", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn().mockRejectedValue(new Error("Contraseña incorrecta"));
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);
    await vi.advanceTimersByTimeAsync(3200);
    // deja que el rechazo de la promesa se procese
    await vi.runOnlyPendingTimersAsync();

    expect(await screen.findByText("Contraseña incorrecta")).toBeInTheDocument();
    // Vuelve a la vista de confirmación (ya no está en fake-loading).
    expect(screen.getByRole("button", { name: /confirmar cierre/i })).toBeInTheDocument();
  });

  it("no permite doble submit mientras la secuencia de carga está en curso", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);
    // El botón de cerrar (X) desaparece durante la carga ficticia.
    expect(screen.queryByLabelText("Cerrar")).not.toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(3200);
    await vi.runAllTimersAsync();

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renderiza el resumen (comprobante) cuando summary no es null, sin volver a pedir contraseña", () => {
    render(<CloseNightModal {...baseProps({ summary })} />);
    expect(screen.getByText("Cierre de Noche Exitoso")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ingres.*contraseña/i)).not.toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: /cerrar y continuar/i });
    expect(closeButton).toBeInTheDocument();
  });

  it("llama a onClose al confirmar el resumen final", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClose = vi.fn();
    render(<CloseNightModal {...baseProps({ summary, onClose })} />);

    await user.click(screen.getByRole("button", { name: /cerrar y continuar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cancela la secuencia pendiente si el modal se desmonta antes de que termine (no dispara onConfirm post-unmount)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<CloseNightModal {...baseProps({ onConfirm })} />);

    await fillPasswordAndSubmit(user);
    unmount();

    await vi.advanceTimersByTimeAsync(4000);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
