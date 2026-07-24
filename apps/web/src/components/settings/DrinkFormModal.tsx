"use client";

import { createElement, useMemo, useState } from "react";
import { GlassWater, RefreshCw, Search, TrendingUp, X, Zap } from "lucide-react";
import type { Drink } from "@cocktrail/shared";
import { ICONS_LIST } from "./cartaConstants";

export type DrinkForm = Omit<Drink, "id"> & { id?: number };

type Props = {
  editDrink: DrinkForm;
  saving: boolean;
  onChange: (patch: Partial<DrinkForm>) => void;
  onCancel: () => void;
  onSave: () => void;
};

const labelCls = "text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5";
const inputCls =
  "w-full h-10 px-3.5 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-all";

export default function DrinkFormModal({ editDrink, saving, onChange, onCancel, onSave }: Props) {
  const [imageUrlInput, setImageUrlInput] = useState(editDrink.image || "");
  const [imgPreview, setImgPreview] = useState(editDrink.image || "");
  const [iconSearch, setIconSearch] = useState("");

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return ICONS_LIST;
    const q = iconSearch.toLowerCase();
    return ICONS_LIST.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
    );
  }, [iconSearch]);

  function handleReloadImage() {
    setImgPreview(imageUrlInput);
    onChange({ image: imageUrlInput });
  }

  return (
    <div className="w-full lg:w-[480px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200">
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
          <label className={labelCls}>Nombre *</label>
          <input
            type="text"
            value={editDrink.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputCls}
            placeholder="Fernet con Coca"
          />
        </div>

        <div>
          <label className={labelCls}>Precio *</label>
          <input
            type="number"
            value={editDrink.price || ""}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
            className={`${inputCls} font-mono`}
            placeholder="5500"
          />
          {editDrink.price > 0 && (
            <span className="text-[12px] text-[var(--text-secondary)] font-mono mt-1.5 block">
              ${editDrink.price.toLocaleString("es-AR")}
            </span>
          )}
        </div>

        <div>
          <label className={labelCls}>Imagen URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              className={`${inputCls} flex-1 text-xs font-mono`}
              placeholder="/imagen.webp o URL externa"
            />
            <button
              type="button"
              onClick={handleReloadImage}
              className="w-10 h-10 border border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer bg-[var(--bg-panel)] shrink-0"
              title="Cargar preview de imagen"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Icono</label>
          <div className="space-y-2 border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 rounded-xl">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder="Buscar icono..."
                className="w-full h-9 pl-8 pr-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div className="grid grid-cols-3 gap-1.5 max-h-[120px] overflow-y-auto pr-0.5 no-scrollbar">
              {filteredIcons.map((i) => {
                const Icon = i.icon;
                const isSelected = editDrink.iconName === i.id;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onChange({ iconName: i.id })}
                    title={i.label}
                    className={`h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer border ${
                      isSelected
                        ? "bg-[var(--accent-surface)] border-[var(--accent-primary)] text-[var(--accent-text)]"
                        : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="text-[8px] mt-1 font-medium truncate max-w-[52px] leading-tight select-none">
                      {i.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label className={labelCls}>Etiqueta</label>
          <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
            {(["generic", "promo", "trending"] as const).map((tag) => {
              const isSelected =
                tag === "promo"
                  ? !!editDrink.promo
                  : tag === "trending"
                    ? editDrink.trending
                    : !editDrink.promo && !editDrink.trending;
              const label = tag === "generic" ? "Genérico" : tag === "promo" ? "Promo" : "Tendencia";
              const Icon = tag === "generic" ? GlassWater : tag === "promo" ? Zap : TrendingUp;
              const activeClass =
                tag === "promo"
                  ? "bg-[var(--amber-soft)] text-[var(--amber-base)]"
                  : "bg-[var(--accent-surface)] text-[var(--accent-text)]";
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onChange({ promo: tag === "promo", trending: tag === "trending" })}
                  className={`h-9 rounded-full text-[12px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? activeClass
                      : "bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-1 border-t border-[var(--border-subtle)]">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] block mb-2">Vista previa</span>
          <div className="bg-[var(--bg-panel)] p-4 rounded-xl border border-[var(--border-subtle)] flex justify-center">
            {!editDrink.promo && !editDrink.trending ? (
              <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-3 flex items-center justify-between pointer-events-none shadow-card">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center bg-[var(--accent-surface)] text-[var(--accent-text)]">
                    {createElement(ICONS_LIST.find((i) => i.id === editDrink.iconName)?.icon || GlassWater, {
                      size: 20,
                    })}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[14px] text-[var(--text-primary)] leading-tight truncate">
                      {editDrink.name || "Nombre del trago"}
                    </span>
                    <span className="text-[13px] font-semibold text-[var(--accent-text)] mt-0.5">
                      ${(editDrink.price || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] flex items-center justify-center font-semibold text-lg leading-none">
                  +
                </div>
              </div>
            ) : (
              <div className="w-full max-w-sm relative flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden min-h-[140px] p-4 justify-between pointer-events-none">
                {imgPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgPreview} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
                ) : (
                  <div className="absolute inset-0 bg-[var(--bg-panel)] z-0 flex items-center justify-center opacity-50">
                    {createElement(ICONS_LIST.find((i) => i.id === editDrink.iconName)?.icon || GlassWater, {
                      size: 48,
                      className: "text-[var(--text-tertiary)]",
                    })}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-app)]/95 via-[var(--bg-app)]/40 to-transparent z-10" />
                <div className="relative z-20">
                  <span
                    className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      editDrink.promo
                        ? "text-[var(--amber-base)] bg-[var(--amber-soft)]"
                        : "text-[var(--accent-text)] bg-[var(--accent-surface)]"
                    }`}
                  >
                    {editDrink.promo ? "Promo" : "Trending"}
                  </span>
                </div>
                <div className="relative z-20 flex justify-between items-end mt-4">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-[15px] leading-tight text-[var(--text-primary)] mb-0.5 truncate">
                      {editDrink.name || "Nombre del trago"}
                    </span>
                    <span className="text-[13px] font-semibold text-[var(--accent-text)]">
                      ${(editDrink.price || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] flex items-center justify-center font-semibold text-lg leading-none shrink-0">
                    +
                  </div>
                </div>
              </div>
            )}
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
    </div>
  );
}
