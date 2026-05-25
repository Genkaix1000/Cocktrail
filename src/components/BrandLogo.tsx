import Image from "next/image";

export type BrandSize = "sm" | "md" | "lg" | "xl" | "hero";

const SIZES: Record<BrandSize, { text: number; image: number }> = {
  sm: { text: 20, image: 40 },
  md: { text: 26, image: 56 },
  lg: { text: 32, image: 72 },
  xl: { text: 40, image: 96 },
  hero: { text: 48, image: 140 },
};

type Props = {
  size?: BrandSize;
  className?: string;
};

export function BrandLogo({ size = "md", className = "" }: Props) {
  const s = SIZES[size];
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="brand-text font-serif-italic font-black leading-none text-ink-50"
        style={{ fontSize: `${s.text}px` }}
      >
        Cocktrail
      </span>
      <Image
        src="/bosko.webp"
        alt="Bosko"
        width={s.image}
        height={s.image}
        priority
        className="brand-image object-contain"
        style={{ width: s.image, height: s.image }}
      />
    </div>
  );
}
