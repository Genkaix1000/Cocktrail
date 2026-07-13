import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import UsuariosSection from "./UsuariosSection";
import { usersService, type SafeUser } from "@/services/users.service";

// UsuariosSection habla directo con usersService (list/create/update/delete),
// así que mockeamos el servicio completo, mismo patrón que LogsSection.test.tsx.
vi.mock("@/services/users.service", async () => {
  const actual = await vi.importActual<typeof import("@/services/users.service")>(
    "@/services/users.service",
  );
  return {
    ...actual,
    usersService: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// useTheme requiere su Provider; el componente solo lee `theme` para variar
// clases visuales, así que alcanza con un mock mínimo.
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

const mockedUsersService = vi.mocked(usersService);

function makeUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: "user-1",
    username: "cajera_juan",
    role: "caja",
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("UsuariosSection", () => {
  it("lista los usuarios de staff traídos del servicio", async () => {
    mockedUsersService.list.mockResolvedValue([makeUser({ username: "cajera_juan" })]);

    render(<UsuariosSection />);

    expect(await screen.findByText("cajera_juan")).toBeInTheDocument();
    expect(mockedUsersService.list).toHaveBeenCalledTimes(1);
  });

  it("crea un usuario nuevo con rol por defecto caja", async () => {
    const user = userEvent.setup();
    mockedUsersService.list.mockResolvedValue([]);
    const created = makeUser({ id: "user-new", username: "nueva_cajera" });
    mockedUsersService.create.mockResolvedValue(created);

    render(<UsuariosSection />);
    await waitFor(() => expect(mockedUsersService.list).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Agregar/i }));

    await user.type(screen.getByPlaceholderText("nombre_operador"), "  nueva_cajera  ");
    await user.type(screen.getByPlaceholderText("Mínimo 4 caracteres"), "  clave123  ");

    await user.click(screen.getByRole("button", { name: /^Crear$/i }));

    await waitFor(() =>
      expect(mockedUsersService.create).toHaveBeenCalledWith({
        username: "nueva_cajera",
        password: "clave123",
        role: "caja",
      }),
    );

    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
    expect(await screen.findByText("nueva_cajera")).toBeInTheDocument();
  });

  it("edita un usuario existente cambiando el rol", async () => {
    const user = userEvent.setup();
    const existing = makeUser({ id: "user-edit", username: "cajera_ana", role: "caja" });
    mockedUsersService.list.mockResolvedValue([existing]);
    const updated = { ...existing, role: "admin" as const };
    mockedUsersService.update.mockResolvedValue(updated);

    render(<UsuariosSection />);

    await user.click(await screen.findByText("cajera_ana"));

    expect(screen.getByText("Editar Usuario")).toBeInTheDocument();

    await user.click(screen.getByText("Administrador"));
    await user.click(screen.getByRole("button", { name: /^Guardar$/i }));

    await waitFor(() =>
      expect(mockedUsersService.update).toHaveBeenCalledWith("user-edit", {
        username: "cajera_ana",
        role: "admin",
      }),
    );
  });

  it("borra un usuario de staff vía SafeDeleteModal tras confirmar el username exacto", async () => {
    const user = userEvent.setup();
    const existing = makeUser({ id: "user-del", username: "cajera_del" });
    mockedUsersService.list.mockResolvedValue([existing]);
    mockedUsersService.delete.mockResolvedValue({ ok: true });

    render(<UsuariosSection />);

    await screen.findByText("cajera_del");

    await user.click(screen.getByTitle("Eliminar usuario"));

    const dialogInput = screen.getByPlaceholderText("cajera_del");
    await user.type(dialogInput, "cajera_del");
    await user.click(screen.getByRole("button", { name: /^Eliminar$/i }));

    await waitFor(() => expect(mockedUsersService.delete).toHaveBeenCalledWith("user-del"));
    await waitFor(() => expect(screen.queryByText("cajera_del")).not.toBeInTheDocument());
  });

  it("no permite eliminar cuentas del sistema (botón deshabilitado)", async () => {
    mockedUsersService.list.mockResolvedValue([makeUser({ id: "sys-1", username: "admin", role: "admin" })]);

    render(<UsuariosSection />);

    const disabledButton = await screen.findByTitle("Usuario del sistema (inmutable)");
    expect(disabledButton).toBeDisabled();
    expect(mockedUsersService.delete).not.toHaveBeenCalled();
  });

  it("muestra un mensaje de error si falla la creación por un error de red", async () => {
    const user = userEvent.setup();
    mockedUsersService.list.mockResolvedValue([]);
    mockedUsersService.create.mockRejectedValue(new Error("Network error"));

    render(<UsuariosSection />);
    await waitFor(() => expect(mockedUsersService.list).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Agregar/i }));
    await user.type(screen.getByPlaceholderText("nombre_operador"), "falla_user");
    await user.type(screen.getByPlaceholderText("Mínimo 4 caracteres"), "clave123");
    await user.click(screen.getByRole("button", { name: /^Crear$/i }));

    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("valida que el usuario y la contraseña sean requeridos antes de crear", async () => {
    const user = userEvent.setup();
    mockedUsersService.list.mockResolvedValue([]);

    render(<UsuariosSection />);
    await waitFor(() => expect(mockedUsersService.list).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /Agregar/i }));

    // Sin username ni password el botón "Crear" queda deshabilitado.
    const submitButton = screen.getByRole("button", { name: /^Crear$/i });
    expect(submitButton).toBeDisabled();
    expect(mockedUsersService.create).not.toHaveBeenCalled();
  });
});
