export default function Stat({
  label,
  value,
  tone,
  mono = true,
}: {
  label: string;
  value: number | string;
  tone: "blue" | "amber" | "green" | "ink";
  mono?: boolean;
}) {
  const color =
    tone === "blue"
      ? "text-sky-500"
      : tone === "amber"
        ? "text-orange-500"
        : tone === "green"
          ? "text-green"
          : "text-ink-50";
  return (
    <div className="flex flex-col gap-0.5 select-none items-end">
      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-500 leading-none">
        {label}
      </span>
      <span
        className={`text-[15px] tabular leading-none ${color} ${mono ? "font-mono font-bold" : "font-semibold"}`}
      >
        {value}
      </span>
    </div>
  );
}
