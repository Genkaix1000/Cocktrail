import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UsersTable from "./UsersTable";
import type { SafeUser } from "@/services/users.service";

function makeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: "user-1",
    username: "cajera_juan",
    role: "caja",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("UsersTable", () => {
  it("separa usuarios de sistema (admin/caja) del personal de staff", () => {
    render(
      <UsersTable
        users={[makeUser({ id: "sys-1", username: "admin", role: "admin" }), makeUser({ id: "st-1", username: "cajera_juan" })]}
        isBosko={false}
        onSelectUser={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Cuentas del Sistema (Inmutables)")).toBeInTheDocument();
    expect(screen.getByTitle("Usuario del sistema (inmutable)")).toBeDisabled();
    expect(screen.getByTitle("Eliminar usuario")).not.toBeDisabled();
  });

  it("muestra el estado vacío cuando no hay staff", () => {
    render(
      <UsersTable
        users={[makeUser({ id: "sys-1", username: "admin", role: "admin" })]}
        isBosko={false}
        onSelectUser={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
    );

    expect(screen.getByText("No hay usuarios creados")).toBeInTheDocument();
  });

  it("dispara onSelectUser al tocar una fila de staff, y onDeleteClick al tocar el ícono sin propagar", async () => {
    const user = userEvent.setup();
    const onSelectUser = vi.fn();
    const onDeleteClick = vi.fn();
    const staff = makeUser({ id: "st-1", username: "cajera_juan" });

    render(
      <UsersTable
        users={[staff]}
        isBosko={false}
        onSelectUser={onSelectUser}
        onDeleteClick={onDeleteClick}
      />,
    );

    await user.click(screen.getByTitle("Eliminar usuario"));
    expect(onDeleteClick).toHaveBeenCalledWith(staff);
    expect(onSelectUser).not.toHaveBeenCalled();

    await user.click(screen.getByText("cajera_juan"));
    expect(onSelectUser).toHaveBeenCalledWith(staff);
  });
});
