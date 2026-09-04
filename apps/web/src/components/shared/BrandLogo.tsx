import { useThemeSafe } from "@/components/ThemeProvider";

type BrandSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

const SCALE: Record<BrandSize, number> = {
  xs: 0.48,
  sm: 0.55,
  md: 0.8,
  lg: 0.95,
  xl: 1.2,
  hero: 1.5,
};

const FALLBACK_THEME_PROPS = {
  theme: "normal",
  useLogoUrl: false,
  logoUrl: "",
  logoSize: 40,
  textLogoValue: "Cocktrail",
  textLogoSize: 26,
  isDark: true,
};

type Props = {
  size?: BrandSize;
  className?: string;
  iconOnly?: boolean;
};

function brandMarkUrl(logoUrl: string): string {
  if (logoUrl.includes("miboliche-horizontal")) return "/miboliche-mark.svg";
  return logoUrl || "/bosko.webp";
}

export function BrandLogo({ size = "md", className = "", iconOnly = false }: Props) {
  const themeProps = useThemeSafe() ?? FALLBACK_THEME_PROPS;

  const { useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize, isDark, brandingReady } =
    themeProps as typeof themeProps & { brandingReady?: boolean };

  if (brandingReady === false) {
    const h = iconOnly ? 24 : 22;
    return (
      <div
        className={`rounded-md bg-[var(--bg-panel)] animate-pulse ${className}`}
        style={{ height: h, width: iconOnly ? h : 88 }}
        aria-hidden
      />
    );
  }

  const scale = SCALE[size];
  const h = iconOnly ? Math.min(logoSize * scale, size === "xs" ? 24 : 28) : logoSize * scale;
  const currentLogoUrl = iconOnly ? brandMarkUrl(logoUrl) : (logoUrl || "/bosko.webp");

  // Light: acento fuerte; dark: texto primario (claro).
  const brandColor = isDark ? "var(--text-primary)" : "var(--accent-primary)";

  return (
    <div className={`flex items-center gap-2 min-w-0 leading-none ${className}`}>
      {useLogoUrl || iconOnly ? (
        <div
          className={`relative inline-flex items-center justify-center max-w-full ${iconOnly ? "" : "min-w-0"}`}
          style={{ height: h, width: iconOnly ? h : "auto", maxWidth: iconOnly ? h : 120 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentLogoUrl}
            alt={textLogoValue || "Logo"}
            className={`object-contain block h-full w-auto max-w-full ${isDark ? "" : "opacity-0"}`}
            style={{ height: h, width: iconOnly ? h : "auto" }}
          />
          {!isDark && (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundColor: brandColor,
                WebkitMaskImage: `url(${currentLogoUrl})`,
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: iconOnly ? "center center" : "left center",
                WebkitMaskSize: "contain",
                maskImage: `url(${currentLogoUrl})`,
                maskRepeat: "no-repeat",
                maskPosition: iconOnly ? "center center" : "left center",
                maskSize: "contain",
              }}
            />
          )}
        </div>
      ) : (
        <span
          className="font-serif-italic font-black leading-none"
          style={{ fontSize: `${textLogoSize * scale}px`, color: brandColor }}
        >
          {textLogoValue || "Bosko"}
        </span>
      )}
    </div>
  );
}
