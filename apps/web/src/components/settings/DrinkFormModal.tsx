"use client";

import { createElement, useMemo, useState } from "react";
import { GlassWater, RefreshCw, Search, TrendingUp, X, Zap } from "lucide-react";
import type { Drink } from "@cocktrail/shared";
import { ICONS_LIST } from "./cartaConstants";

export type DrinkForm = Omit<Drink, "id"> & { id?: number };

type Props = {
  editDrink: DrinkForm;
  isBosko: boolean;
  saving: boolean;
  onChange: (patch: Partial<DrinkForm>) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function DrinkFormModal({ editDrink, isBosko, saving, onChange, onCancel, onSave }: Props) {
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
    <div className="w-full lg:w-[560px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-5 flex flex-col gap-4 animate-in slide-in-from-right duration-200">
      <div className="flex justify-between items-center pb-2 border-b border-ink-800">
        <h2 className="text-sm font-bold text-ink-50 uppercase tracking-wider">
          {editDrink.id ? "Editar Trago" : "Nuevo Trago"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">Nombre *</label>
          <input
            type="text"
            value={editDrink.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-blue transition-all"
            placeholder="Fernet con Coca"
          />
        </div>

        {/* Price */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">Precio *</label>
          <input
            type="number"
            value={editDrink.price || ""}
            onChange={(e) => onChange({ price: Number(e.target.value) })}
            className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono focus:outline-none focus:border-blue transition-all"
            placeholder="5500"
          />
          {editDrink.price > 0 && (
            <span className="text-[10px] text-green font-mono mt-1.5 block">
              Valor formateado: ${editDrink.price.toLocaleString("es-AR")}
            </span>
          )}
        </div>

        {/* Vibe */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">
            Vibe / Categoría (se muestra en la carta del cliente)
          </label>
          <input
            type="text"
            value={editDrink.vibe}
            onChange={(e) => onChange({ vibe: e.target.value })}
            className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-blue transition-all"
            placeholder="ej. PROMO AMIGOS, FIESTA TOTAL"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">Imagen URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              className="flex-1 h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-xs text-ink-200 font-mono focus:outline-none focus:border-blue transition-all"
              placeholder="/imagen.webp o URL externa"
            />
            <button
              type="button"
              onClick={handleReloadImage}
              className="w-9 h-9 bg-ink-800 border border-ink-700 rounded-lg text-ink-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Cargar preview de imagen"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Visual Icon Search Selector */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">
            Seleccionar Icono
          </label>
          <div className="space-y-2 border border-ink-750 bg-ink-950 p-2.5 rounded-lg">
            {/* Search box */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                type="text"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder="Buscar icono..."
                className="w-full h-7 pl-7 pr-3 bg-ink-900 border border-ink-800 rounded text-xs text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-blue transition-all"
              />
            </div>

            {/* Icon buttons grid */}
            <div className="grid grid-cols-3 gap-1 max-h-[110px] overflow-y-auto pr-0.5 no-scrollbar">
              {filteredIcons.map((i) => {
                const Icon = i.icon;
                const isSelected = editDrink.iconName === i.id;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => onChange({ iconName: i.id })}
                    title={i.label}
                    className={`
                      h-9 rounded flex flex-col items-center justify-center transition-all cursor-pointer border
                      ${isSelected
                        ? isBosko ? "bg-[#4ade80]/15 border-[#4ade80] text-[#4ade80]" : "bg-blue/15 border-blue text-blue"
                        : "bg-ink-900 border-ink-850 text-ink-400 hover:bg-ink-850 hover:text-ink-200"
                      }
                    `}
                  >
                    <Icon size={14} />
                    <span className="text-[7.5px] mt-1 font-semibold truncate max-w-[45px] leading-tight select-none">
                      {i.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tag Selector Buttons */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">
            Etiqueta / Tipo de Producto
          </label>
          <div className="grid grid-cols-3 gap-2 bg-ink-950 p-1.5 rounded-xl border border-ink-800">
            {(["generic", "promo", "trending"] as const).map((tag) => {
              const isSelected = tag === "promo" ? editDrink.promo : tag === "trending" ? editDrink.trending : (!editDrink.promo && !editDrink.trending);
              const label = tag === "generic" ? "Genérico" : tag === "promo" ? "Promo" : "Tendencia";
              const Icon = tag === "generic" ? GlassWater : tag === "promo" ? Zap : TrendingUp;
              const activeClass = tag === "promo"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : tag === "trending"
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  : isBosko ? "bg-[#4ade80]/15 border-[#4ade80]/40 text-[#4ade80]" : "bg-blue/15 border-blue/40 text-blue";
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onChange({ promo: tag === "promo", trending: tag === "trending" })}
                  className={`h-8 rounded-lg text-xs font-bold transition-all border cursor-pointer flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? activeClass
                      : "bg-transparent border-transparent text-ink-400 hover:text-ink-200"
                  }`}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Mockup Preview Card */}
        <div className="pt-2 border-t border-ink-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-2">
            Vista Previa en la Carta
          </span>
          <div className="bg-ink-950 p-4 rounded-xl border border-ink-800 flex justify-center">
            {(!editDrink.promo && !editDrink.trending) ? (
              /* Regular Card Mockup */
              <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center bg-white/[0.03] border border-white/10 text-white/55 shadow-inner">
                    {createElement(ICONS_LIST.find((i) => i.id === editDrink.iconName)?.icon || GlassWater, { size: 22 })}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm text-white leading-tight truncate">
                      {editDrink.name || "Nombre del Trago"}
                    </span>
                    <span className="text-xs font-black text-blue mt-0.5">
                      ${(editDrink.price || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-green-soft border border-green-line flex items-center justify-center text-green font-bold text-lg leading-none">+</div>
              </div>
            ) : (
              /* Promo/Trending Banner Mockup */
              <div className="w-full max-w-sm relative flex flex-col rounded-2xl border border-white/10 bg-white/5 overflow-hidden min-h-[140px] p-4 justify-between pointer-events-none">
                {imgPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgPreview} alt="" className="absolute inset-0 w-full h-full object-cover z-0" />
                ) : (
                  <div className="absolute inset-0 bg-ink-800 z-0 flex items-center justify-center opacity-25">
                    {createElement(ICONS_LIST.find((i) => i.id === editDrink.iconName)?.icon || GlassWater, { size: 48, className: "text-white" })}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-10" />

                <div className="relative z-20">
                  <span className={`inline-block text-[8px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full ${
                    editDrink.promo ? "text-amber-300 bg-amber-500/25 border border-amber-500/35" : "text-rose-300 bg-rose-500/25 border border-rose-500/35"
                  }`}>
                    {editDrink.promo ? "⚡ PROMO" : "▲ TREND"}
                  </span>
                </div>

                <div className="relative z-20 flex justify-between items-end mt-4">
                   <div className="flex flex-col min-w-0 pr-2">
                     <span className="font-bold text-base leading-tight text-white mb-0.5 truncate drop-shadow-md">
                       {editDrink.name || "Nombre del Trago"}
                     </span>
                     <span className="text-sm font-black text-blue drop-shadow-md">
                       ${(editDrink.price || 0).toLocaleString("es-AR")}
                     </span>
                   </div>
                   <div className="w-8 h-8 rounded-lg bg-green flex items-center justify-center text-black font-bold text-lg leading-none shrink-0 shadow-lg">+</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-ink-800 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="h-8.5 px-3 rounded-lg bg-ink-850 border border-ink-750 text-[11px] font-medium text-ink-300 hover:text-ink-100 transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !editDrink.name || !editDrink.price}
          className={`h-8.5 px-4 rounded-lg text-ink-950 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
        >
          {saving ? "Guardando..." : editDrink.id ? "Guardar" : "Crear"}
        </button>
      </div>
    </div>
  );
}
