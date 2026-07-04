import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GeneralSection from "./GeneralSection";
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

const mockedConfigService = vi.mocked(configService);
const mockedUseTheme = vi.mocked(useTheme);

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

describe("GeneralSection", () => {
  it("carga la configuración inicial y la muestra en el formulario", async () => {
    mockedConfigService.get.mockResolvedValue(makeConfig());

    render(<GeneralSection />);

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(mockedConfigService.get).toHaveBeenCalledTimes(1);

    // El ID y nombre del local son de solo lectura, precargados desde la config.
    expect(screen.getByDisplayValue("cocktrail_club_01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bosko Club")).toBeInTheDocument();

    // Sin cambios: el botón de guardar debe estar deshabilitado.
    expect(screen.getByRole("button", { name: /Guardar Configuración/i })).toBeDisabled();
    expect(screen.getByText("No has realizado modificaciones para guardar.")).toBeInTheDocument();
  });

  it("guarda los cambios de branding vía configService y muestra el toast de éxito", async () => {
    const user = userEvent.setup();
    mockedConfigService.get.mockResolvedValue(makeConfig());
    mockedConfigService.update.mockResolvedValue(makeConfig({ logoUrl: "/nuevo-logo.png" }));

    render(<GeneralSection />);

    await screen.findByText("General");

    const logoUrlInput = screen.getByLabelText("Logo URL (Imagen PNG/SVG)");
    await user.clear(logoUrlInput);
    await user.type(logoUrlInput, "/nuevo-logo.png");

    const saveButton = screen.getByRole("button", { name: /Guardar Configuración/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() =>
      expect(mockedConfigService.update).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "bosko", customTheme: null, logoUrl: "/nuevo-logo.png" }),
      ),
    );

    expect(await screen.findByText("Configuración guardada correctamente")).toBeInTheDocument();
  });
});
