import { useTheme } from "./ThemeProvider";

export type BrandSize = "sm" | "md" | "lg" | "xl" | "hero";

const SCALE: Record<BrandSize, number> = {
  sm: 0.7,
  md: 0.95,
  lg: 1.2,
  xl: 1.45,
  hero: 1.8,
};

type Props = {
  size?: BrandSize;
  className?: string;
};

export function BrandLogo({ size = "md", className = "" }: Props) {
  let themeProps;
  try {
    themeProps = useTheme();
  } catch (e) {
    themeProps = {
      theme: "normal",
      useLogoUrl: false,
      logoUrl: "",
      logoSize: 40,
      textLogoValue: "Cocktrail",
      textLogoSize: 26,
      isDark: true,
    };
  }

  const { useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize } = themeProps;
  const scale = SCALE[size];
  
  const logoStyle: React.CSSProperties = {
    height: `${logoSize * scale}px`,
    width: "auto",
    maxWidth: "100%",
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {useLogoUrl && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={textLogoValue || "Logo"}
          className="object-contain"
          style={logoStyle}
        />
      ) : (
        <span
          className="font-serif-italic font-black leading-none text-ink-50"
          style={{ fontSize: `${textLogoSize * scale}px` }}
        >
          {textLogoValue || "Cocktrail"}
        </span>
      )}
    </div>
  );
}
