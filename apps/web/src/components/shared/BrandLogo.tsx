import { useThemeSafe } from "@/components/ThemeProvider";

type BrandSize = "sm" | "md" | "lg" | "xl" | "hero";

const SCALE: Record<BrandSize, number> = {
  sm: 0.55,
  md: 0.8,
  lg: 0.95,
  xl: 1.2,
  hero: 1.5,
};

const MARK = "/miboliche-mark.svg";
const LOCKUP = "/miboliche-horizontal.svg";

const FALLBACK_THEME_PROPS = {
  theme: "miboliche",
  useLogoUrl: true,
  logoUrl: MARK,
  logoSize: 40,
  textLogoValue: "miBoliche",
  textLogoSize: 26,
  isDark: true,
};

type Props = {
  size?: BrandSize;
  className?: string;
  /** mark = ícono solo; lockup = wordmark horizontal miBoliche. */
  variant?: "mark" | "lockup";
};

export function BrandLogo({ size = "md", className = "", variant = "mark" }: Props) {
  const themeProps = useThemeSafe() ?? FALLBACK_THEME_PROPS;

  const { useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize, isDark } = themeProps;
  const scale = SCALE[size];
  const h = (variant === "lockup" ? Math.min(logoSize, 48) : logoSize) * scale;
  const brandColor = isDark ? "var(--text-primary)" : "var(--accent-primary)";
  const src = variant === "lockup" ? LOCKUP : logoUrl || MARK;

  if (!useLogoUrl || !src) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span
          className="font-serif-italic font-black leading-none"
          style={{ fontSize: `${textLogoSize * scale}px`, color: brandColor }}
        >
          {textLogoValue || "miBoliche"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <div
        className="relative inline-block max-w-full"
        style={{ height: h, maxWidth: variant === "lockup" ? 168 : undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={textLogoValue || "Logo"}
          className="opacity-0 object-contain block h-full w-auto max-w-full"
          style={{ height: h }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundColor: brandColor,
            WebkitMaskImage: `url(${src})`,
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "left center",
            WebkitMaskSize: "contain",
            maskImage: `url(${src})`,
            maskRepeat: "no-repeat",
            maskPosition: "left center",
            maskSize: "contain",
          }}
        />
      </div>
    </div>
  );
}
