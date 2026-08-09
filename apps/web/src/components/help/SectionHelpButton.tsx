"use client";

import { CircleHelp } from "lucide-react";

import { useHelpSafe } from "./HelpCenterProvider";
import type { HelpCategoryId } from "./helpTours";

type Props = {
  category: HelpCategoryId;
  className?: string;
};

/** Hint "?" junto al título de una sección — dispara el tour de esa categoría. */
export function SectionHelpButton({ category, className = "" }: Props) {
  const help = useHelpSafe();
  if (!help) return null;

  return (
    <button
      type="button"
      onClick={() => void help.startTour(category)}
      title="Tour de esta sección"
      aria-label="Tour de esta sección"
      className={`w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] hover:text-[var(--accent-text)] hover:border-[var(--accent-line)] hover:bg-[var(--accent-surface)] flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 ${className}`}
    >
      <CircleHelp size={15} strokeWidth={1.8} />
    </button>
  );
}
