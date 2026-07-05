import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UserFormDrawer from "./UserFormDrawer";
import type { UserPermissions } from "@/services/users.service";

const NO_PERMISSIONS: UserPermissions = {
  closeNight: false,
  modifyCarta: false,
  manageUsers: false,
  monitoreo: false,
  metricas: false,
  historial: false,
  general: false,
  carta: false,
  pagos: false,
  staff: false,
  cancelarTickets: false,
};

describe("UserFormDrawer", () => {
  it("deshabilita todos los campos y muestra el aviso cuando es un usuario de sistema", () => {
    render(
      <UserFormDrawer
        editUser={{ id: "sys-1", username: "admin", role: "admin", permissions: NO_PERMISSIONS }}
        error=""
        saving={false}
        isBosko={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={vi.fn()}
        onTogglePermission={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Ver Usuario")).toBeInTheDocument();
    expect(screen.getByText("Este usuario es de sistema y es inmutable")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("nombre_operador")).toBeDisabled();
  });

  it("dispara onRoleChange y onTogglePermission para un usuario editable", async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();
    const onTogglePermission = vi.fn();

    render(
      <UserFormDrawer
        editUser={{ username: "barman_juan", role: "barman", permissions: NO_PERMISSIONS }}
        error=""
        saving={false}
        isBosko={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={onRoleChange}
        onTogglePermission={onTogglePermission}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByText("Cajero"));
    expect(onRoleChange).toHaveBeenCalledWith("caja");

    await user.click(screen.getByText("Cancelar tickets"));
    expect(onTogglePermission).toHaveBeenCalledWith("cancelarTickets");
  });

  it("muestra el mensaje de error y deshabilita Guardar/Crear mientras saving es true", () => {
    render(
      <UserFormDrawer
        editUser={{ username: "barman_juan", password: "1234", role: "barman", permissions: NO_PERMISSIONS }}
        error="Network error"
        saving
        isBosko={false}
        onUsernameChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onRoleChange={vi.fn()}
        onTogglePermission={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Network error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guardando/i })).toBeDisabled();
  });
});
