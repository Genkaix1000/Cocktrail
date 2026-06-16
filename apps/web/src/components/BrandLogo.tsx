import { useTheme } from "./ThemeProvider";

export type BrandSize = "sm" | "md" | "lg" | "xl" | "hero";

const SCALE: Record<BrandSize, number> = {
  sm: 0.9,
  md: 1.25,
  lg: 1.55,
  xl: 1.85,
  hero: 2.3,
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
    };
  }

  const { useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize } = themeProps;
  const scale = SCALE[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {useLogoUrl && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt={textLogoValue || "Logo"}
          className="object-contain"
          style={{
            height: `${logoSize * scale}px`,
            width: "auto",
            maxWidth: "100%",
          }}
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
