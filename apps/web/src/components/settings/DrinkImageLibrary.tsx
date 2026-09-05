"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Search, Trash2, X } from "lucide-react";
import { drinkImagesService, type UploadedDrinkImage } from "@/services/drink-images.service";
import {
  centeredSquareCrop,
  cropImageToWebpDataUrl,
  loadImageFromFile,
  needsCropTool,
} from "./cropDrinkImage";
import { DRINK_IMAGE_TARGET_PX, STATIC_DRINK_IMAGES } from "./staticDrinkImages";
import DrinkImageCropModal from "./DrinkImageCropModal";

type LibraryItem =
  | { kind: "static"; url: string; label: string }
  | { kind: "uploaded"; url: string; label: string; id: string };

type Props = {
  open: boolean;
  selectedUrl: string;
  onClose: () => void;
  onSelect: (url: string) => void;
};

export default function DrinkImageLibrary({ open, selectedUrl, onClose, onSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [uploaded, setUploaded] = useState<UploadedDrinkImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUploaded(await drinkImagesService.list());
    } catch {
      setError("No se pudieron cargar las imágenes subidas.");
      setUploaded([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const items: LibraryItem[] = useMemo(() => {
    const statics: LibraryItem[] = STATIC_DRINK_IMAGES.map((s) => ({
      kind: "static",
      url: s.url,
      label: s.label,
    }));
    const ups: LibraryItem[] = uploaded.map((u) => ({
      kind: "uploaded",
      url: u.url,
      label: u.path.split("/").pop() ?? u.id,
      id: u.id,
    }));
    return [...ups, ...statics];
  }, [uploaded]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.url.toLowerCase().includes(q));
  }, [items, query]);

  async function finishUpload(webpDataUrl: string) {
    setBusy(true);
    setError(null);
    try {
      const row = await drinkImagesService.uploadWebp(webpDataUrl);
      setUploaded((prev) => [row, ...prev]);
      onSelect(row.url);
      onClose();
    } catch {
      setError("No se pudo subir la imagen.");
    } finally {
      setBusy(false);
      setCropImage(null);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const img = await loadImageFromFile(file);
      if (needsCropTool(img.naturalWidth, img.naturalHeight)) {
        setCropImage(img);
        return;
      }
      setBusy(true);
      const dataUrl = await cropImageToWebpDataUrl(img, centeredSquareCrop(img.naturalWidth, img.naturalHeight));
      await finishUpload(dataUrl);
    } catch {
      setError("No se pudo procesar la imagen.");
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await drinkImagesService.delete(id);
      setUploaded((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "No se pudo eliminar.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal>
        <div className="w-full sm:max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Biblioteca de imágenes</h3>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                Recomendado: cuadrada {DRINK_IMAGE_TARGET_PX}×{DRINK_IMAGE_TARGET_PX}
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] cursor-pointer" aria-label="Cerrar">
              <X size={16} />
            </button>
          </div>

          <div className="px-4 py-3 flex flex-col gap-2 border-b border-[var(--border-subtle)]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-10 rounded-xl border border-dashed border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              Subir desde galería
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleFile(f);
              }}
            />
            {error && (
              <p className="text-[12px] text-[var(--danger-base)]" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <p className="text-[12px] text-[var(--text-tertiary)] flex items-center gap-2">
                <Loader2 size={12} className="animate-spin" /> Cargando…
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-[12px] text-[var(--text-tertiary)]">Sin resultados.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {filtered.map((item) => {
                  const selected = item.url === selectedUrl;
                  return (
                    <div key={`${item.kind}-${item.url}`} className="relative group">
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(item.url);
                          onClose();
                        }}
                        className={`w-full aspect-square rounded-xl overflow-hidden border cursor-pointer ${
                          selected
                            ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/40"
                            : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                        }`}
                        title={item.label}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" className="w-full h-full object-cover" />
                      </button>
                      {item.kind === "uploaded" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(item.id)}
                          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-40"
                          aria-label={`Eliminar ${item.label}`}
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {cropImage && (
        <DrinkImageCropModal
          image={cropImage}
          onCancel={() => setCropImage(null)}
          onConfirm={(dataUrl) => void finishUpload(dataUrl)}
        />
      )}
    </>
  );
}
