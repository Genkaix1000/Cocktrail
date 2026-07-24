import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UserFormDrawer from "./UserFormDrawer";

describe("UserFormDrawer", () => {
  it("deshabilita todos los campos y muestra el aviso cuando es un usuario de sistema", () => {
    render(
      <UserFormDrawer
        editUser={{ id: "sys-1", username: "admin", role: "admin" }}
        error=""
        saving={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Ver usuario")).toBeInTheDocument();
    expect(screen.getByText("Este usuario es de sistema y es inmutable")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("nombre_operador")).toBeDisabled();
  });

  it("dispara onRoleChange para un usuario editable", async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();

    render(
      <UserFormDrawer
        editUser={{ username: "cajera_juan", role: "admin" }}
        error=""
        saving={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={onRoleChange}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Cajero"));
    expect(onRoleChange).toHaveBeenCalledWith("caja");
  });

  it("muestra el mensaje de error y deshabilita Guardar/Crear mientras saving es true", () => {
    render(
      <UserFormDrawer
        editUser={{ username: "cajera_juan", password: "1234", role: "caja" }}
        error="Network error"
        saving
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guardando/i })).toBeDisabled();
  });
});
