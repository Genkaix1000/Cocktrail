import { QrCode, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";

export type BarVisualKind = "vip" | "portatil" | "other";

/** VIP → Posnet; Portátil → QR. Fallback genérico para códigos futuros. */
export function barVisualKind(codeOrPosId: string | null | undefined): BarVisualKind {
  const id = (codeOrPosId ?? "").toUpperCase();
  if (id.includes("PORTATIL")) return "portatil";
  if (
    id.includes("BAR01") ||
    id.includes("BAR-01") ||
    id.includes("BARRA-01") ||
    id.includes("VIP")
  ) {
    return "vip";
  }
  return "other";
}

/** Ícono stock de Posnet (podés reemplazar por un asset propio). */
function PosnetIcon({ size = 24, strokeWidth = 1.5, ...props }: LucideProps) {
  const s = typeof size === "number" ? size : 24;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <rect x="5" y="2" width="14" height="20" rx="2.5" />
      <rect x="8" y="5" width="8" height="5" rx="1" />
      <path d="M9 13h.01M12 13h.01M15 13h.01M9 16h.01M12 16h.01M15 16h.01" />
    </svg>
  );
}

export function barVisualIcon(kind: BarVisualKind): ComponentType<LucideProps> {
  if (kind === "portatil") return QrCode;
  return PosnetIcon;
}

export function barDisplayLabel(
  codeOrPosId: string | null | undefined,
  fallback?: string | null,
): string {
  const kind = barVisualKind(codeOrPosId);
  if (kind === "portatil") return "Portátil";
  if (kind === "vip") return "Barra VIP";
  return fallback?.trim() || codeOrPosId?.trim() || "Caja";
}
