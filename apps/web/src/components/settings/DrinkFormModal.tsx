"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Flame, Images, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import type { Drink, DrinkCategory } from "@cocktrail/shared";
import { drinkIcon } from "@/lib/icons";
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

function parseTimeString(timeStr: string | null | undefined, defaultTime = "22:00") {
  const str = timeStr && /^\d{1,2}:\d{2}$/.test(timeStr) ? timeStr : defaultTime;
  const parts = str.split(":");
  const h24 = parseInt(parts[0], 10) || 0;
  const minute = parseInt(parts[1], 10) || 0;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period };
}

function to24TimeString(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (period === "PM") h24 += 12;
  const hh = String(h24).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

const HOURS_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_LIST = Array.from({ length: 60 }, (_, i) => i);

function WheelTimePicker({
  value,
  onChange,
  label,
  onClose,
}: {
  value: string;
  onChange: (time24: string) => void;
  label: string;
  onClose: () => void;
}) {
  const { hour12, minute, period } = parseTimeString(value);

  const setHour = (h: number) => {
    onChange(to24TimeString(h, minute, period));
  };
  const setMinute = (m: number) => {
    onChange(to24TimeString(hour12, m, period));
  };
  const setPeriod = (p: "AM" | "PM") => {
    onChange(to24TimeString(hour12, minute, p));
  };

  return (
    <div className="p-3 bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-subtle)] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150 shadow-lg">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Ajustar hora {label.toLowerCase()}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
        >
          Listo
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-ink-950/70 p-2.5 rounded-xl border border-white/5">
        <div className="flex flex-col items-center">
          <div className="w-full py-1.5 mb-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-on-accent)] font-bold text-[14px] text-center shadow-sm select-none">
            {String(hour12).padStart(2, "0")}
          </div>
          <div className="w-full max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 scrollbar-thin">
            {HOURS_LIST.map((h) => {
              const active = h === hour12;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHour(h)}
                  aria-label={`Hora ${h}`}
                  className={`w-full py-1 rounded-md text-[13px] font-medium transition-colors cursor-pointer text-center select-none ${
                    active
                      ? "bg-white/20 text-white font-bold"
                      : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {String(h).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </div>

        {/* Columna Minutos */}
        <div className="flex flex-col items-center">
          <div className="w-full py-1.5 mb-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-on-accent)] font-bold text-[14px] text-center shadow-sm select-none">
            {String(minute).padStart(2, "0")}
          </div>
          <div className="w-full max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 scrollbar-thin">
            {MINUTES_LIST.map((m) => {
              const active = m === minute;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinute(m)}
                  aria-label={`Minuto ${m}`}
                  className={`w-full py-1 rounded-md text-[13px] font-medium transition-colors cursor-pointer text-center select-none ${
                    active
                      ? "bg-white/20 text-white font-bold"
                      : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {String(m).padStart(2, "0")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-full py-1.5 mb-2 rounded-lg bg-[var(--accent-primary)] text-[var(--text-on-accent)] font-bold text-[14px] text-center shadow-sm select-none">
            {period}
          </div>
          <div className="w-full flex flex-col gap-1">
            {(["AM", "PM"] as const).map((p) => {
              const active = p === period;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`w-full py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer text-center select-none ${
                    active
                      ? "bg-white/20 text-white font-bold"
                      : "text-[var(--text-secondary)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
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
  const [imageBroken, setImageBroken] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [manualUrlMode, setManualUrlMode] = useState(false);
  const [openPicker, setOpenPicker] = useState<"from" | "until" | null>(null);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const flags = flagsForCategory(editDrink.categoryId);

  useEffect(() => {
    setImageBroken(false);
  }, [imgPreview]);

  function applyImage(url: string) {
    setImageUrlInput(url);
    setImgPreview(url);
    setImageBroken(false);
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
          {editDrink.id ? "Editar producto" : "Nuevo producto"}
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
            placeholder="Fernet con Coca"
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
        </div>

        <div>
          <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Categoría</label>
          <select
            value={editDrink.categoryId ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value || null)}
            className={inputCls}
          >
            <option value="">Sin categoría (general)</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5">Descripción</label>
          <textarea
            value={editDrink.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            className="w-full h-20 p-3 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] resize-none transition-all"
            placeholder="Ingredientes, notas..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[13px] font-semibold text-[var(--text-primary)]">
              Imagen del producto
            </label>
            {imgPreview && (
              <button
                type="button"
                onClick={() => setManualUrlMode(!manualUrlMode)}
                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer"
              >
                {manualUrlMode ? "Ocultar URL" : "Ingresar URL"}
              </button>
            )}
          </div>

          {imgPreview && !manualUrlMode ? (
            <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-ink-950 shrink-0">
                  <img
                    src={imgPreview}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImageBroken(true)}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                    {imgPreview.startsWith("http")
                      ? imgPreview.includes("supabase.co")
                        ? "Imagen en la nube"
                        : "Imagen externa"
                      : imgPreview.split("/").pop() || "Imagen asignada"}
                  </span>
                  <a
                    href={imgPreview}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-primary)] hover:underline w-fit"
                  >
                    <span>Abrir enlace</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  className="h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-app)] text-[11px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={() => applyImage("")}
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger-base)] hover:bg-[var(--danger-soft)] transition-colors cursor-pointer"
                  title="Quitar imagen"
                  aria-label="Quitar imagen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleReloadImage();
                    }
                  }}
                  className={`${inputCls} flex-1 text-xs`}
                  placeholder="/drinks/andes.jpg o URL"
                />
                <button
                  type="button"
                  onClick={handleReloadImage}
                  className="w-10 h-10 border border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all cursor-pointer bg-[var(--bg-panel)] shrink-0"
                  title="Cargar preview de imagen"
                  aria-label="Cargar preview de imagen"
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
              {!imgPreview && (
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  className="w-full h-9 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-panel)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Images size={14} />
                  Elegir de biblioteca o galería
                </button>
              )}
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[13px] font-semibold text-[var(--text-primary)] block">Vigencia horaria</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(editDrink.scheduleEnabled)}
              onClick={() => {
                const nextState = !editDrink.scheduleEnabled;
                if (!nextState) setOpenPicker(null);
                onChange({
                  scheduleEnabled: nextState,
                  scheduleFrom: editDrink.scheduleFrom || "22:00",
                  scheduleUntil: editDrink.scheduleUntil || "03:00",
                });
              }}
              className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold cursor-pointer transition-colors ${
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
              <div>
                <label className="text-[12px] text-[var(--text-secondary)] block mb-1.5 font-medium">
                  Rango horario
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenPicker(openPicker === "from" ? null : "from")}
                    className={`flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      openPicker === "from"
                        ? "border-[var(--accent-primary)] bg-[var(--bg-panel)] ring-2 ring-[var(--accent-primary)]/20 shadow-sm"
                        : "border-[var(--border-strong)] bg-[var(--bg-input)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-panel)]/40"
                    }`}
                    aria-label="Ajustar hora desde"
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">
                        Desde
                      </span>
                      <span className="text-[15px] font-bold text-[var(--text-primary)] font-mono tabular">
                        {editDrink.scheduleFrom || "22:00"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-white/5">
                        {parseTimeString(editDrink.scheduleFrom || "22:00").period}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${openPicker === "from" ? "rotate-180 text-[var(--accent-primary)]" : ""}`}
                      />
                    </div>
                  </button>

                  <div
                    className="w-7 h-7 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0"
                    aria-hidden
                  >
                    <ArrowRight size={13} strokeWidth={2.2} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpenPicker(openPicker === "until" ? null : "until")}
                    className={`flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      openPicker === "until"
                        ? "border-[var(--accent-primary)] bg-[var(--bg-panel)] ring-2 ring-[var(--accent-primary)]/20 shadow-sm"
                        : "border-[var(--border-strong)] bg-[var(--bg-input)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-panel)]/40"
                    }`}
                    aria-label="Ajustar hora hasta"
                  >
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-tertiary)]">
                        Hasta
                      </span>
                      <span className="text-[15px] font-bold text-[var(--text-primary)] font-mono tabular">
                        {editDrink.scheduleUntil || "03:00"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-white/5">
                        {parseTimeString(editDrink.scheduleUntil || "03:00").period}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${openPicker === "until" ? "rotate-180 text-[var(--accent-primary)]" : ""}`}
                      />
                    </div>
                  </button>
                </div>
              </div>

              {openPicker && (
                <WheelTimePicker
                  label={openPicker === "from" ? "Desde" : "Hasta"}
                  value={
                    openPicker === "from"
                      ? editDrink.scheduleFrom || "22:00"
                      : editDrink.scheduleUntil || "03:00"
                  }
                  onChange={(newTime24) => {
                    if (openPicker === "from") {
                      onChange({ scheduleFrom: newTime24 });
                    } else {
                      onChange({ scheduleUntil: newTime24 });
                    }
                  }}
                  onClose={() => setOpenPicker(null)}
                />
              )}

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
          <div className="bg-[var(--bg-panel)] p-4 rounded-xl border border-[var(--border-subtle)] flex items-center justify-center">
            <div className="w-[180px] sm:w-[200px] select-none">
              <div className="group relative bg-ink-900 border border-ink-800 rounded-xl p-3 flex flex-col gap-2.5 shadow-card">
                {flags.promo && (
                  <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-amber-soft text-amber border border-amber-line rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-sm">
                    <Sparkles size={10} /> Promo
                  </span>
                )}
                {flags.trending && !flags.promo && (
                  <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-purple-soft text-purple border border-purple-border rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider shadow-sm">
                    <Flame size={10} /> Trend
                  </span>
                )}

                <div className="aspect-square rounded-lg bg-ink-950 border border-ink-850 overflow-hidden flex items-center justify-center relative">
                  {imgPreview && !imageBroken ? (
                    <img
                      src={imgPreview}
                      alt={editDrink.name || "Vista previa"}
                      className="w-full h-full object-cover"
                      onError={() => setImageBroken(true)}
                    />
                  ) : (
                    createElement(drinkIcon(editDrink.iconName || "glass-water"), {
                      size: 36,
                      className: "text-ink-600",
                    })
                  )}
                </div>

                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-bold text-[14px] text-white truncate leading-snug">
                    {editDrink.name || "Nombre del producto"}
                  </span>
                  <span className="text-[15px] font-black text-green tabular">
                    ${(editDrink.price || 0).toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
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
