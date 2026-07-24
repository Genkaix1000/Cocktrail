import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UsersTable from "./UsersTable";
import { STAFF_COLS_DEFAULT } from "./staffCrud";
import type { SafeUser } from "@/services/users.service";
import type { StaffColumnFilters } from "./UsersTable";

function makeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: "user-1",
    username: "cajera_juan",
    role: "caja",
    createdAt: Date.now(),
    ...overrides,
  };
}

const emptyFilters: StaffColumnFilters = { user: "", role: "all", type: "all" };

function baseProps(overrides: Partial<React.ComponentProps<typeof UsersTable>> = {}) {
  return {
    users: [makeUser()],
    hasActiveSearch: false,
    confirmingDeleteId: null,
    visibleCols: [...STAFF_COLS_DEFAULT],
    filtersOpen: false,
    columnFilters: emptyFilters,
    onSelectUser: vi.fn(),
    onAskDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
    onToggleCol: vi.fn(),
    onColumnFiltersChange: vi.fn(),
    ...overrides,
  };
}

describe("UsersTable", () => {
  it("muestra pill Sistema para admin y permite eliminar staff", () => {
    render(
      <UsersTable
        {...baseProps({
          users: [
            makeUser({ id: "sys-1", username: "admin", role: "admin" }),
            makeUser({ id: "st-1", username: "cajera_juan" }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByTitle("Usuario del sistema (inmutable)")).toBeDisabled();
    expect(screen.getByTitle("Eliminar")).not.toBeDisabled();
  });

  it("muestra el estado vacío cuando no hay usuarios en la lista filtrada", () => {
    render(<UsersTable {...baseProps({ users: [] })} />);
    expect(screen.getByText("No hay usuarios creados")).toBeInTheDocument();
  });

  it("dispara onSelectUser al tocar una fila, y onAskDelete al tocar trash sin propagar", async () => {
    const user = userEvent.setup();
    const onSelectUser = vi.fn();
    const onAskDelete = vi.fn();
    const staff = makeUser({ id: "st-1", username: "cajera_juan" });

    render(
      <UsersTable {...baseProps({ users: [staff], onSelectUser, onAskDelete })} />,
    );

    await user.click(screen.getByTitle("Eliminar"));
    expect(onAskDelete).toHaveBeenCalledWith(staff);
    expect(onSelectUser).not.toHaveBeenCalled();

    await user.click(screen.getByText("cajera_juan"));
    expect(onSelectUser).toHaveBeenCalledWith(staff);
  });
});
