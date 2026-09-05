"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { centeredSquareCrop, cropImageToWebpDataUrl, type CropRect } from "./cropDrinkImage";
import { DRINK_IMAGE_TARGET_PX } from "./staticDrinkImages";

type Props = {
  image: HTMLImageElement;
  onCancel: () => void;
  onConfirm: (webpDataUrl: string) => void;
};

/**
 * Crop 1:1 mínimo: zoom + pan sobre un viewport cuadrado.
 * Exporta siempre 512×512 WebP.
 */
export default function DrinkImageCropModal({ image, onCancel, onConfirm }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const minSide = Math.min(image.naturalWidth, image.naturalHeight);
  const maxZoom = Math.max(1, Math.min(image.naturalWidth, image.naturalHeight) / (minSide * 0.35));

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [image]);

  const computeCrop = useCallback((): CropRect => {
    const base = centeredSquareCrop(image.naturalWidth, image.naturalHeight);
    const side = base.sw / zoom;
    const cx = image.naturalWidth / 2 + offset.x;
    const cy = image.naturalHeight / 2 + offset.y;
    let sx = cx - side / 2;
    let sy = cy - side / 2;
    sx = Math.max(0, Math.min(sx, image.naturalWidth - side));
    sy = Math.max(0, Math.min(sy, image.naturalHeight - side));
    return { sx, sy, sw: side, sh: side };
  }, [image, zoom, offset]);

  async function handleConfirm() {
    setBusy(true);
    try {
      const dataUrl = await cropImageToWebpDataUrl(image, computeCrop());
      onConfirm(dataUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Recortar imagen</h3>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Recomendado: cuadrada {DRINK_IMAGE_TARGET_PX}×{DRINK_IMAGE_TARGET_PX}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-[var(--text-tertiary)] cursor-pointer" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div
          ref={viewportRef}
          className="relative w-full aspect-square rounded-xl overflow-hidden bg-[var(--bg-panel)] border border-[var(--border-subtle)] touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current || !viewportRef.current) return;
            const box = viewportRef.current.getBoundingClientRect();
            const scale = minSide / box.width / zoom;
            setOffset({
              x: drag.current.ox - (e.clientX - drag.current.x) * scale,
              y: drag.current.oy - (e.clientY - drag.current.y) * scale,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none pointer-events-none"
            style={{
              width: `${(image.naturalWidth / minSide) * 100 * zoom}%`,
              height: `${(image.naturalHeight / minSide) * 100 * zoom}%`,
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${(-offset.x / minSide) * 100 * zoom}%), calc(-50% + ${(-offset.y / minSide) * 100 * zoom}%))`,
            }}
          />
        </div>

        <label className="block text-[12px] text-[var(--text-secondary)]">
          Zoom
          <input
            type="range"
            min={1}
            max={maxZoom}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full mt-1"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-full border border-[var(--border-strong)] text-[13px] font-semibold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="h-10 px-4 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[13px] font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Usar recorte"}
          </button>
        </div>
      </div>
    </div>
  );
}
