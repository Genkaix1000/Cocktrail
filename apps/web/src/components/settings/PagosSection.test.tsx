import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PagosSection from "./PagosSection";
import { configService, type SafeConfig } from "@/services/config.service";
import { useTheme } from "@/components/ThemeProvider";

vi.mock("@/services/config.service", () => ({
  configService: {
    get: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getOAuthUrl: vi.fn(),
    getSellerStatus: vi.fn(),
  },
}));

import { mercadopagoService } from "@/services/mercadopago.service";

const mockedConfigService = vi.mocked(configService);
const mockedUseTheme = vi.mocked(useTheme);
const mockedMpService = vi.mocked(mercadopagoService);

const UNLINKED_STATUS = { linked: false, status: null, nickname: null, email: null, linkedAt: null, displayName: null };

function makeConfig(overrides: Partial<SafeConfig> = {}): SafeConfig {
  return {
    theme: "bosko",
    brandName: "Bosko Club",
    logoUrl: "/bosko.webp",
    customTheme: null,
    mercadoPago: { publicKey: "", accessTokenMasked: "", sandbox: true },
    clubId: "cocktrail_club_01",
    clubName: "Bosko Club",
    useLogoUrl: true,
    logoSize: 56,
    textLogoValue: "Bosko",
    textLogoSize: 26,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset la URL entre tests (algunos tests la manipulan para simular el callback OAuth).
  window.history.replaceState({}, "", "/admin?tab=pagos");
  mockedMpService.getSellerStatus.mockResolvedValue(UNLINKED_STATUS);
  mockedUseTheme.mockReturnValue({
    theme: "bosko",
    useLogoUrl: true,
    logoUrl: "/bosko.webp",
    logoSize: 56,
    textLogoValue: "Bosko",
    textLogoSize: 26,
    isDark: true,
    toggleDark: vi.fn(),
  });
});

describe("PagosSection", () => {
  it("carga la configuración inicial y muestra el estado 'Sin Vincular' cuando no hay public key", async () => {
    mockedConfigService.get.mockResolvedValue(makeConfig());

    render(<PagosSection />);

    expect(await screen.findByText("Pagos")).toBeInTheDocument();
    expect(mockedConfigService.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Sin Vincular")).toBeInTheDocument();
  });

  it("muestra el estado 'Vinculado' con el token enmascarado cuando ya hay credenciales guardadas", async () => {
    mockedConfigService.get.mockResolvedValue(
      makeConfig({
        mercadoPago: {
          publicKey: "APP_USR-real-public-key",
          accessTokenMasked: "APP_USR-****-1234",
          sandbox: true,
        },
      }),
    );

    render(<PagosSection />);

    expect(await screen.findByText("Mercado Pago Vinculado")).toBeInTheDocument();
    expect(screen.getByText(/actual: APP_USR-\*\*\*\*-1234/)).toBeInTheDocument();
  });

  it("guarda las credenciales vía configService, limpia el input del token y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    mockedConfigService.get.mockResolvedValue(makeConfig());
    mockedConfigService.update.mockResolvedValue(
      makeConfig({
        mercadoPago: {
          publicKey: "APP_USR-nueva-public-key",
          accessTokenMasked: "APP_USR-****-9999",
          sandbox: true,
        },
      }),
    );

    render(<PagosSection />);
    await screen.findByText("Pagos");

    const publicKeyInput = screen.getByLabelText("Public Key");
    await user.type(publicKeyInput, "APP_USR-nueva-public-key");

    const tokenInput = screen.getByLabelText(/Access Token/i);
    await user.type(tokenInput, "TEST-ACCESS-TOKEN-SECRETO-12345");

    const saveButton = screen.getByRole("button", { name: /Guardar configuración de pagos/i });
    await user.click(saveButton);

    await waitFor(() =>
      expect(mockedConfigService.update).toHaveBeenCalledWith({
        mercadoPago: {
          publicKey: "APP_USR-nueva-public-key",
          accessToken: "TEST-ACCESS-TOKEN-SECRETO-12345",
          sandbox: true,
        },
      }),
    );

    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();

    // El input del token se limpia tras guardar, incluso al revelarlo con el ojo.
    await user.click(screen.getByRole("button", { name: "Mostrar token" }));
    expect(tokenInput).toHaveValue("");
  });

  it("nunca renderiza el access token en texto claro en el DOM, solo la versión enmascarada", async () => {
    const rawSecretToken = "TEST-1234567890-SUPER-SECRETO-NO-EXPONER";
    mockedConfigService.get.mockResolvedValue(
      makeConfig({
        mercadoPago: {
          publicKey: "APP_USR-real-public-key",
          accessTokenMasked: "APP_USR-****-1234",
          sandbox: false,
        },
      }),
    );

    const { container } = render(<PagosSection />);
    await screen.findByText("Pagos");

    // El DOM completo (incluyendo atributos como value) no debe contener el token crudo.
    expect(container.innerHTML).not.toContain(rawSecretToken);
    // Solo debe aparecer la forma enmascarada expuesta por SafeConfig.
    expect(container.innerHTML).toContain("APP_USR-****-1234");
  });

  it("muestra un toast de error si falla el guardado de las credenciales", async () => {
    const user = userEvent.setup();
    mockedConfigService.get.mockResolvedValue(makeConfig());
    mockedConfigService.update.mockRejectedValue(new Error("network down"));

    render(<PagosSection />);
    await screen.findByText("Pagos");

    await user.type(screen.getByLabelText("Public Key"), "APP_USR-x");
    await user.click(screen.getByRole("button", { name: /Guardar configuración de pagos/i }));

    expect(await screen.findByText(/No se pudo guardar la configuración de pagos/i)).toBeInTheDocument();
  });

  it("muestra el botón de vinculación OAuth y llama al service al hacer click", async () => {
    const user = userEvent.setup();
    mockedConfigService.get.mockResolvedValue(makeConfig());
    // Rechaza para evitar la navegación real (window.location.href) en jsdom.
    mockedMpService.getOAuthUrl.mockRejectedValue(new Error("boom"));

    render(<PagosSection />);
    await screen.findByText("Pagos");

    const linkButton = screen.getByRole("button", { name: /^Vincular$/i });
    await user.click(linkButton);

    await waitFor(() => expect(mockedMpService.getOAuthUrl).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No se pudo iniciar la vinculación/i)).toBeInTheDocument();
  });

  it("muestra el toast de éxito cuando vuelve del callback con ?linked=true", async () => {
    window.history.replaceState({}, "", "/admin?tab=pagos&linked=true");
    mockedConfigService.get.mockResolvedValue(makeConfig());

    render(<PagosSection />);

    expect(await screen.findByText("Cuenta de Mercado Pago vinculada")).toBeInTheDocument();
    // El param se limpia de la URL para no repetir el toast al recargar.
    expect(window.location.search).not.toContain("linked");
  });

  it("muestra un toast de error cuando vuelve del callback con ?linked=false&message=...", async () => {
    window.history.replaceState({}, "", "/admin?tab=pagos&linked=false&message=State%20inv%C3%A1lido");
    mockedConfigService.get.mockResolvedValue(makeConfig());

    render(<PagosSection />);

    expect(await screen.findByText(/No se pudo vincular Mercado Pago: State inválido/i)).toBeInTheDocument();
  });

  it("muestra los datos de la cuenta y el botón 'Vincular' cuando hay seller activo", async () => {
    mockedConfigService.get.mockResolvedValue(makeConfig());
    mockedMpService.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "active",
      nickname: "BOSKO BAR",
      displayName: "BOSKO BAR",
      email: "bosko@example.com",
      linkedAt: new Date().toISOString(),
    });

    render(<PagosSection />);

    expect(await screen.findByText("BOSKO BAR")).toBeInTheDocument();
    expect(screen.getByText("bosko@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Vincular$/i })).toBeInTheDocument();
  });

  it("muestra el badge de sesión expirada cuando el seller está expired", async () => {
    mockedConfigService.get.mockResolvedValue(makeConfig());
    mockedMpService.getSellerStatus.mockResolvedValue({
      linked: true,
      status: "expired",
      nickname: "BOSKO BAR",
      displayName: "BOSKO BAR",
      email: null,
      linkedAt: null,
    });

    render(<PagosSection />);

    expect(await screen.findByText(/Sesión expirada/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Vincular$/i })).toBeInTheDocument();
  });
});
