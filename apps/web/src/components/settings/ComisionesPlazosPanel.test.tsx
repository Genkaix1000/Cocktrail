import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ComisionesPlazosPanel from "./ComisionesPlazosPanel";

describe("ComisionesPlazosPanel", () => {
  it("cerrado: no renderiza el dialog", () => {
    render(<ComisionesPlazosPanel open={false} onClose={() => {}} linked={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin vincular: pide vincular y no muestra el CTA a MP", () => {
    render(<ComisionesPlazosPanel open onClose={() => {}} linked={false} />);
    expect(screen.getByRole("heading", { name: /Plazos y comisiones/i })).toBeInTheDocument();
    expect(screen.getByText(/Vinculá tu cuenta de Mercado Pago/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Configurar en Mercado Pago/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Tarjeta de débito/i).length).toBeGreaterThan(0);
  });

  it("vinculado: CTA abre release-options en nueva pestaña", () => {
    render(<ComisionesPlazosPanel open onClose={() => {}} linked />);
    const link = screen.getByRole("link", { name: /Configurar en Mercado Pago/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.mercadopago.com.ar/settings/release-options",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("cierra con el botón X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ComisionesPlazosPanel open onClose={onClose} linked />);
    await user.click(screen.getByRole("button", { name: /Cerrar plazos y comisiones/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
