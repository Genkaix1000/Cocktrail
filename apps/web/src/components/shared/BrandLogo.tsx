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
  // useThemeSafe() no tira si no hay ThemeProvider en el árbol (a diferencia de
  // useTheme()) — evita envolver un hook en try/catch, que viola
  // react-hooks/rules-of-hooks al tratarse como una llamada condicional.
  const themeProps = useThemeSafe() ?? FALLBACK_THEME_PROPS;

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
          className="object-contain block"
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
