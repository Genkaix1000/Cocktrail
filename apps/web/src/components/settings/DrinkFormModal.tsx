"use client";

import { useMemo, useState } from "react";
import { Images, RefreshCw, X } from "lucide-react";
import type { Drink, DrinkCategory } from "@cocktrail/shared";
import DrinkCard from "@/components/shared/DrinkCard";
import DrinkImageLibrary from "./DrinkImageLibrary";

export type DrinkForm = Omit<Drink, "id"> & { id?: number };

/** Cache visual: badges promo/tendencia se derivan de la categoría. */
export function flagsForCategory(categoryId: string | null | undefined): {
  promo: boolean;
  trending: boolean;
} {
  if (categoryId === "tendencias") return { promo: false, trending: true };
  if (categoryId === "promos-combos") return { promo: true, trending: false };
  return { promo: false, trending: false };
}

type Props = {
  editDrink: DrinkForm;
  categories: DrinkCategory[];
  saving: boolean;
  onChange: (patch: Partial<DrinkForm>) => void;
  onCancel: () => void;
  onSave: () => void;
};

const inputCls =
  "w-full h-10 px-3.5 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-all";

export default function DrinkFormModal({
  editDrink,
  categories,
  saving,
  onChange,
  onCancel,
  onSave,
}: Props) {
  const [imageUrlInput, setImageUrlInput] = useState(editDrink.image || "");
  const [imgPreview, setImgPreview] = useState(editDrink.image || "");
  const [libraryOpen, setLibraryOpen] = useState(false);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const categoryLabel = useMemo(() => {
    if (!editDrink.categoryId) return null;
    return sortedCategories.find((c) => c.id === editDrink.categoryId)?.name ?? null;
  }, [editDrink.categoryId, sortedCategories]);

  const flags = flagsForCategory(editDrink.categoryId);
  const cardVariant = flags.promo ? "promo" : flags.trending ? "trending" : "regular";

  function applyImage(url: string) {
    setImageUrlInput(url);
    setImgPreview(url);
    onChange({ image: url });
  }

  function handleReloadImage() {
    applyImage(imageUrlInput);
  }

  function handleCategoryChange(categoryId: string | null) {
    onChange({ categoryId, ...flagsForCategory(categoryId) });
  }

  return (
    <div
      data-tour="drink-form"
      className="w-full lg:w-[480px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200"
    >
      <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-tight">
          {editDrink.id ? "Editar trago" : "Nuevo trago"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Nombre *</label>
          <input
            type="text"
            value={editDrink.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputCls}
            placeholder="PROMO 2 Vodka con Speed"
          />
        </div>

        <div>
          <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Precio *</label>
          <input
            type="number"
            min={0}
            value={editDrink.price === 0 ? "" : editDrink.price}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange({ price: 0 });
              } else {
                const parsed = parseInt(raw, 10);
                if (!isNaN(parsed)) {
                  onChange({ price: parsed });
                }
              }
            }}
            className={`${inputCls} font-mono`}
            placeholder="5500"
          />
          {editDrink.price > 0 && (
            <span className="text-[12px] text-[var(--text-secondary)] font-mono mt-1.5 block">
              ${editDrink.price.toLocaleString("es-AR")}
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Categoría</label>
            <select
              value={editDrink.categoryId ?? ""}
              onChange={(e) => handleCategoryChange(e.target.value || null)}
              className={inputCls}
            >
              <option value="">Sin categoría</option>
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.sortOrder}. {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-24 shrink-0">
            <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Orden</label>
            <input
              type="number"
              min={0}
              value={editDrink.sortOrder || ""}
              onChange={(e) => onChange({ sortOrder: Number(e.target.value) || 0 })}
              className={`${inputCls} font-mono`}
              placeholder="0"
              title="Orden dentro de la categoría (menor = más arriba, 0 = al final)"
            />
          </div>
        </div>

        <div>
          <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Imagen URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              className={`${inputCls} flex-1 text-xs font-mono`}
              placeholder="/drinks/andes.jpg o URL"
            />
            <button
              type="button"
              onClick={handleReloadImage}
              className="w-10 h-10 border border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer bg-[var(--bg-panel)] shrink-0"
              title="Cargar preview de imagen"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="w-10 h-10 border border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer bg-[var(--bg-panel)] shrink-0"
              title="Biblioteca de imágenes"
              aria-label="Biblioteca de imágenes"
            >
              <Images size={14} />
            </button>
          </div>
        </div>

        <div className="pt-1 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-[var(--text-primary)] block">Vigencia horaria</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                Fuera de horario: gris + aviso (salvo que ocultes).
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(editDrink.scheduleEnabled)}
              onClick={() =>
                onChange({
                  scheduleEnabled: !editDrink.scheduleEnabled,
                  scheduleFrom: editDrink.scheduleFrom || "22:00",
                  scheduleUntil: editDrink.scheduleUntil || "03:00",
                })
              }
              className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold cursor-pointer ${
                editDrink.scheduleEnabled
                  ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                  : "border border-[var(--border-strong)] text-[var(--text-secondary)]"
              }`}
            >
              {editDrink.scheduleEnabled ? "ON" : "OFF"}
            </button>
          </div>

          {editDrink.scheduleEnabled && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[12px] text-[var(--text-secondary)] block mb-1">Desde</label>
                  <input
                    type="time"
                    value={editDrink.scheduleFrom || "22:00"}
                    onChange={(e) => onChange({ scheduleFrom: e.target.value || null })}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[12px] text-[var(--text-secondary)] block mb-1">Hasta</label>
                  <input
                    type="time"
                    value={editDrink.scheduleUntil || "03:00"}
                    onChange={(e) => onChange({ scheduleUntil: e.target.value || null })}
                    className={inputCls}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editDrink.scheduleHideWhenExpired)}
                  onChange={(e) => onChange({ scheduleHideWhenExpired: e.target.checked })}
                />
                Ocultar de la lista al vencer
              </label>

              <div>
                <label className="text-[12px] text-[var(--text-secondary)] block mb-1">
                  Mover a categoría al vencer (opcional)
                </label>
                <select
                  value={editDrink.scheduleMoveToCategoryId ?? ""}
                  onChange={(e) => onChange({ scheduleMoveToCategoryId: e.target.value || null })}
                  className={inputCls}
                >
                  <option value="">Mantener categoría</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editDrink.scheduleRepeatNextEvent)}
                  onChange={(e) => onChange({ scheduleRepeatNextEvent: e.target.checked })}
                />
                Repetir en el siguiente evento / cada noche
              </label>
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-[var(--border-subtle)]">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] block mb-2">Vista previa</span>
          <div className="bg-[var(--bg-panel)] p-4 rounded-xl border border-[var(--border-subtle)]">
            <div className="pointer-events-none max-w-sm mx-auto">
              <DrinkCard
                name={editDrink.name || "Nombre del trago"}
                price={editDrink.price || 0}
                vibe={categoryLabel ?? editDrink.vibe}
                icon={editDrink.iconName}
                image={imgPreview || undefined}
                variant={cardVariant}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-1 pt-4 border-t border-[var(--border-subtle)] shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-4 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !editDrink.name || !editDrink.price}
          className="h-10 px-4 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold transition-all disabled:opacity-45 cursor-pointer"
        >
          {saving ? "Guardando..." : editDrink.id ? "Guardar" : "Crear"}
        </button>
      </div>

      <DrinkImageLibrary
        open={libraryOpen}
        selectedUrl={imgPreview}
        onClose={() => setLibraryOpen(false)}
        onSelect={applyImage}
      />
    </div>
  );
}
