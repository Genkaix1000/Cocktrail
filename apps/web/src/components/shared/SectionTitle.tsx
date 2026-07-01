import type { ReactNode } from "react";

export default function SectionTitle({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {icon && <span className="text-ink-500">{icon}</span>}
      <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2 w-full">
        {children}
      </h3>
      <span className="flex-1 h-px bg-ink-800/80" />
    </div>
  );
}
