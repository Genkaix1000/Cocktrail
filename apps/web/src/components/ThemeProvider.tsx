"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import type { Theme, CustomTheme } from "@cocktrail/shared";

type ThemeContextType = {
  theme: Theme;
  useLogoUrl: boolean;
  logoUrl: string;
  logoSize: number;
  textLogoValue: string;
  textLogoSize: number;
  isDark: boolean;
  brandingReady: boolean;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const BOSKO_BRANDING = {
  theme: "bosko" as Theme,
  useLogoUrl: true,
  logoUrl: "/bosko.webp",
  logoSize: 56,
  textLogoValue: "Bosko",
  textLogoSize: 26,
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Variante que no explota si no hay ThemeProvider en el árbol (devuelve
 * `undefined` en vez de tirar). Pensada para componentes que necesitan un
 * fallback gracioso (ej. BrandLogo fuera del layout raíz) sin violar
 * react-hooks/rules-of-hooks con un try/catch alrededor de un hook.
 */
export function useThemeSafe() {
  return useContext(ThemeContext);
}

const getIsDarkKey = () => {
  let role = "public";
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) role = "admin";
    else if (path.startsWith("/caja")) role = "caja";
  }
  return `cocktrail_is_dark_${role}`;
};

function readIsDark(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(getIsDarkKey()) !== "false";
}

function applyBrandingToStorage(data: {
  theme: Theme;
  useLogoUrl?: boolean;
  logoUrl?: string;
  logoSize?: number;
  textLogoValue?: string;
  textLogoSize?: number;
  customTheme?: CustomTheme | null;
}) {
  localStorage.setItem("cocktrail_theme", data.theme);
  localStorage.setItem("cocktrail_use_logo_url", String(data.useLogoUrl !== false));
  localStorage.setItem("cocktrail_logo_url", data.logoUrl || BOSKO_BRANDING.logoUrl);
  localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? BOSKO_BRANDING.logoSize));
  localStorage.setItem("cocktrail_text_logo_value", data.textLogoValue || BOSKO_BRANDING.textLogoValue);
  localStorage.setItem("cocktrail_text_logo_size", String(data.textLogoSize ?? BOSKO_BRANDING.textLogoSize));
  if (data.customTheme) {
    localStorage.setItem("cocktrail_custom_theme", JSON.stringify(data.customTheme));
  } else {
    localStorage.removeItem("cocktrail_custom_theme");
  }
}

function brandingFromApi(data: Record<string, unknown>) {
  return {
    theme: data.theme as Theme,
    customTheme: (data.customTheme as CustomTheme | null) || null,
    useLogoUrl: data.useLogoUrl !== false,
    logoUrl: (data.logoUrl as string) || BOSKO_BRANDING.logoUrl,
    logoSize: Number(data.logoSize ?? BOSKO_BRANDING.logoSize),
    textLogoValue: (data.textLogoValue as string) || BOSKO_BRANDING.textLogoValue,
    textLogoSize: Number(data.textLogoSize ?? BOSKO_BRANDING.textLogoSize),
  };
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(BOSKO_BRANDING.theme);
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [useLogoUrl, setUseLogoUrl] = useState<boolean>(BOSKO_BRANDING.useLogoUrl);
  const [logoUrl, setLogoUrl] = useState<string>(BOSKO_BRANDING.logoUrl);
  const [logoSize, setLogoSize] = useState<number>(BOSKO_BRANDING.logoSize);
  const [textLogoValue, setTextLogoValue] = useState<string>(BOSKO_BRANDING.textLogoValue);
  const [textLogoSize, setTextLogoSize] = useState<number>(BOSKO_BRANDING.textLogoSize);
  const [isDark, setIsDark] = useState<boolean>(readIsDark);
  const [brandingReady, setBrandingReady] = useState(false);

  const applyBranding = (data: ReturnType<typeof brandingFromApi>) => {
    setTheme(data.theme);
    setCustomTheme(data.customTheme);
    setUseLogoUrl(data.useLogoUrl);
    setLogoUrl(data.logoUrl);
    setLogoSize(data.logoSize);
    setTextLogoValue(data.textLogoValue);
    setTextLogoSize(data.textLogoSize);
    applyBrandingToStorage(data);
  };

  const toggleDark = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    const key = getIsDarkKey();
    localStorage.setItem(key, String(nextDark));
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  useEffect(() => {
    const dark = readIsDark();
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiBase}/api/theme`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch theme");
        return res.json();
      })
      .then((data) => {
        if (data?.theme) applyBranding(brandingFromApi(data));
      })
      .catch((err) => {
        console.error("Error loading theme from API:", err);
      })
      .finally(() => {
        setBrandingReady(true);
      });
  }, []);

  useSSE({
    "theme.changed": (data) => {
      applyBranding(brandingFromApi(data as Record<string, unknown>));
      setBrandingReady(true);
    },
  });

  return (
    <ThemeContext.Provider
      value={{
        theme,
        useLogoUrl,
        logoUrl,
        logoSize,
        textLogoValue,
        textLogoSize,
        isDark,
        brandingReady,
        toggleDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
