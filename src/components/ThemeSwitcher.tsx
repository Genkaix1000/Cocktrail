"use client";

import { Palette } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeSwitcher() {
  const { theme } = useTheme();

  const toggleTheme = async () => {
    const newTheme = theme === "normal" ? "bosko" : "normal";
    try {
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
      // La actualización de UI la maneja ThemeProvider vía SSE
    } catch (e) {
      console.error("Error toggling theme", e);
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="h-9 px-3.5 rounded-lg bg-ink-850 border border-ink-700 text-ink-100 flex items-center gap-1.5 hover:text-primary-base hover:border-primary-line transition-all"
      title="Cambiar Skin"
    >
      <Palette size={14} />
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] hidden sm:inline">
        {theme === "normal" ? "Normal" : "Bosko"}
      </span>
    </button>
  );
}
