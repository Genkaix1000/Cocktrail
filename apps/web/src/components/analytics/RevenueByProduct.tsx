"use client";

import type { ProductRevenue } from "@/lib/analytics";
import EmptyState from "@/components/shared/EmptyState";

type Props = {
  products: ProductRevenue[];
  isBosko: boolean;
};

export default function RevenueByProduct({ products, isBosko }: Props) {
  const top8 = products.slice(0, 8);
  const maxRevenue = top8.length > 0 ? top8[0]!.subtotal : 0;
  const barColor = isBosko ? "bg-[#4ade80]" : "bg-blue";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex justify-between items-baseline">
        <span className="flex items-center gap-2.5 text-[12px] font-bold text-ink-100 uppercase tracking-widest">
          Revenue por Producto
          <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
            {products.length}
          </span>
        </span>
        <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
          Top {Math.min(8, products.length)}
        </span>
      </div>

      {/* Table header */}
      {top8.length > 0 && (
        <div className="grid grid-cols-[22px_1fr_54px_80px_44px] items-center gap-3 text-[9px] font-bold uppercase tracking-[0.18em] text-ink-500 px-0.5">
          <span>#</span>
          <span>Producto</span>
          <span className="text-left">Uds.</span>
          <span className="text-right">Revenue</span>
          <span className="text-right">%</span>
        </div>
      )}

      {/* Rows */}
      {top8.length === 0 ? (
        <EmptyState icon={<span className="text-[28px]">📊</span>} message="Aún no hay datos de productos" className="py-10" />
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] no-scrollbar">
          {top8.map((p, i) => {
            const widthPct = maxRevenue
              ? Math.max(6, (p.subtotal / maxRevenue) * 100)
              : 0;
            return (
              <div
                key={p.drinkId}
                className="grid grid-cols-[22px_1fr_54px_80px_44px] items-center gap-3 py-2 border-t border-ink-850 first:border-t-0"
              >
                {/* Rank */}
                <span className="font-mono text-[11px] text-ink-500 tabular">
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Name + progress bar */}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-[14px] font-medium text-ink-50 leading-tight truncate">
                    {p.name}
                  </span>
                  <div className="h-1 rounded bg-ink-800 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-500`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>

                {/* Qty */}
                <span className="font-mono text-[12px] text-ink-300 text-left tabular">
                  ×{p.qty}
                </span>

                {/* Revenue */}
                <span className="font-mono text-[13px] text-ink-100 text-right tabular">
                  ${p.subtotal.toLocaleString("es-AR")}
                </span>

                {/* Pct */}
                <span className="font-mono text-[12px] text-ink-400 text-right tabular">
                  {p.pctRevenue}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
