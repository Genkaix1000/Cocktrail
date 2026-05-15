/** Skeleton para cards de la /carta — combina con DrinkCard V2. */
export default function DrinkSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[14px] bg-ink-900 border border-ink-800 animate-pulse min-h-[148px]">
      <div className="h-2 w-1/3 rounded bg-ink-800" />
      <div className="h-5 w-3/4 rounded bg-ink-800 mt-1" />
      <div className="h-4 w-2/3 rounded bg-ink-800/70" />
      <div className="mt-auto flex items-center justify-between pt-2">
        <div className="h-4 w-14 rounded bg-ink-800" />
        <div className="w-[26px] h-[26px] rounded-lg bg-ink-800" />
      </div>
    </div>
  );
}
