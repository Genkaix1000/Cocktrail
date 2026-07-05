"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

type Props = {
  activeScreen: string;
};

/** Badge de pantalla activa + reloj en vivo, esquina superior derecha. */
export function OSHeadbar({ activeScreen }: Props) {
  const { theme, isDark } = useTheme();
  const isBosko = theme === "bosko";

  // Real-time Clock (HH:MM p.m. / a.m.)
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Contrast text color for clock
  const clockColor = isBosko
    ? isDark
      ? "text-[#fffeb3]"
      : "text-[#013e37]"
    : isDark
      ? "text-ink-100"
      : "text-ink-200";

  // Contrast styling for badge
  const badgeClass = isBosko
    ? isDark
      ? "bg-white/10 border-white/20 text-[#fffeb3]"
      : "bg-[#013e37]/10 border-[#013e37]/20 text-[#013e37]"
    : isDark
      ? "bg-ink-900 border-ink-800 text-ink-200"
      : "bg-ink-800 border-ink-700 text-ink-200";

  return (
    <div className="flex items-center gap-4 select-none font-mono text-[11px] relative">
      {/* 1. Screen Badge / Role */}
      <div className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
        {activeScreen}
      </div>

      {/* 2. Clock */}
      <div className={`font-bold tracking-wider ${clockColor}`}>
        {time}
      </div>
    </div>
  );
}
