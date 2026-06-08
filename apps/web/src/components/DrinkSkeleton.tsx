/** Skeleton adaptativo para /carta V3.4 (Botones Verticales) */
export default function DrinkSkeleton({ variant = "regular" }: { variant?: "regular" | "hero" }) {
  if (variant === "regular") {
    return (
      <div className="flex items-center justify-between p-3 rounded-[22px] bg-white/5 border border-white/10 animate-pulse">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-28 rounded bg-white/10" />
            <div className="h-3 w-14 rounded bg-white/10" />
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/10" />
      </div>
    );
  }

  return (
    <div className="flex flex-row gap-4 p-4 rounded-[24px] bg-white/5 border border-white/10 animate-pulse min-h-[140px]">
      <div className="flex flex-col flex-1">
        <div className="h-3 w-16 rounded-full bg-white/10 mb-3" />
        <div className="flex items-start gap-2.5 flex-1">
          <div className="w-5 h-5 rounded bg-white/10 mt-1" />
          <div className="h-5 w-32 rounded bg-white/10" />
        </div>
        <div className="h-5 w-20 rounded bg-white/10 mt-auto" />
      </div>
      <div className="w-10 h-24 rounded-xl bg-white/10 self-center" />
    </div>
  );
}
