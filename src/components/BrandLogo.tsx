export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <span className="brand-text font-serif-italic text-[28px] leading-none text-ink-50">
        Cocktrail
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bosko.png" alt="Bosko Logo" className="brand-image h-[48px] object-contain" />
    </div>
  );
}
