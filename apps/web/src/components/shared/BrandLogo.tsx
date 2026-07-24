import { useThemeSafe } from "@/components/ThemeProvider";

type BrandSize = "sm" | "md" | "lg" | "xl" | "hero";

const SCALE: Record<BrandSize, number> = {
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
};

export function BrandLogo({ size = "md", className = "" }: Props) {
  const themeProps = useThemeSafe() ?? FALLBACK_THEME_PROPS;

  const { useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize, isDark } = themeProps;
  const scale = SCALE[size];
  const h = logoSize * scale;
  // Light: acento fuerte; dark: texto primario (claro).
  const brandColor = isDark ? "var(--text-primary)" : "var(--accent-primary)";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {useLogoUrl && logoUrl ? (
        // El <img> define siempre el mismo alto/ancho intrínseco; en light
        // se tiñe con mask (opacity-0 en la img) para no cambiar de tamaño.
        <div className="relative inline-block max-w-full" style={{ height: h }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={textLogoValue || "Logo"}
            className={`object-contain block h-full w-auto max-w-full ${isDark ? "" : "opacity-0"}`}
            style={{ height: h }}
          />
          {!isDark && (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundColor: brandColor,
                WebkitMaskImage: `url(${logoUrl})`,
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "left center",
                WebkitMaskSize: "contain",
                maskImage: `url(${logoUrl})`,
                maskRepeat: "no-repeat",
                maskPosition: "left center",
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
          {textLogoValue || "Cocktrail"}
        </span>
      )}
    </div>
  );
}
