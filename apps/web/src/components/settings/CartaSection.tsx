"use client";

import { useCallback, useEffect, useMemo, useState, createElement } from "react";
import {
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  GlassWater,
  Beer,
  Zap,
  Droplet,
  Wine,
  Martini,
  Citrus,
  CupSoda,
  BottleWine,
} from "lucide-react";
import { drinksService } from "@/services/drinks.service";
import type { Drink } from "@cocktrail/shared";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/SafeDeleteModal";

type DrinkForm = Omit<Drink, "id"> & { id?: number };

const EMPTY_FORM: DrinkForm = {
  name: "",
  price: 0,
  description: "",
  vibe: "",
  flavors: [],
  iconName: "glass-water",
  trending: false,
  promo: false,
  available: true,
};

const ICONS_LIST = [
  { id: "glass-water", label: "Trago", icon: GlassWater },
  { id: "beer", label: "Cerveza", icon: Beer },
  { id: "zap", label: "Energía", icon: Zap },
  { id: "droplet", label: "Agua", icon: Droplet },
  { id: "wine", label: "Vino", icon: Wine },
  { id: "martini", label: "Coctel", icon: Martini },
  { id: "citrus", label: "Cítrico", icon: Citrus },
  { id: "cup-soda", label: "Refresco", icon: CupSoda },
  { id: "bottle-wine", label: "Botella", icon: BottleWine },
];

export default function CartaSection() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false); // Controls side-drawer visibility
  const [editDrink, setEditDrink] = useState<DrinkForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Drink | null>(null);
  const [saved, setSaved] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imgPreview, setImgPreview] = useState("");
  const { theme } = useTheme();

  const loadDrinks = useCallback(async () => {
    try {
      const data = await drinksService.list();
      setDrinks(data);
    } catch (err) {
      console.error("Error loading drinks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDrinks();
  }, [loadDrinks]);

  const filtered = useMemo(() => {
    if (!search.trim()) return drinks;
    const q = search.toLowerCase();
    return drinks.filter(
      (d) =>
        d.name.toLowerCase().includes(q)
    );
  }, [drinks, search]);

  const openCreate = useCallback(() => {
    setEditDrink({ ...EMPTY_FORM });
    setImageUrlInput("");
    setImgPreview("");
    setIconSearch("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((drink: Drink) => {
    setEditDrink({ ...drink });
    setImageUrlInput(drink.image || "");
    setImgPreview(drink.image || "");
    setIconSearch("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditDrink(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editDrink || saving) return;
    setSaving(true);
    try {
      if (editDrink.id) {
        // Update
        const { id, ...rest } = editDrink;
        const updated = await drinksService.update(id, rest);
        setDrinks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      } else {
        // Create
        const created = await drinksService.create(editDrink);
        setDrinks((prev) => [...prev, created]);
      }
      closeModal();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving trago:", err);
    } finally {
      setSaving(false);
    }
  }, [editDrink, saving, closeModal]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await drinksService.delete(id);
      setDrinks((prev) => prev.filter((d) => d.id !== id));
      setDeleteConfirm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error deleting trago:", err);
    }
  }, []);

  const toggleAvailable = useCallback(async (drink: Drink, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await drinksService.update(drink.id, { available: !drink.available });
      setDrinks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error toggling availability:", err);
    }
  }, []);

  const handleReloadImage = () => {
    setImgPreview(imageUrlInput);
    setEditDrink((prev) => prev ? { ...prev, image: imageUrlInput } : null);
  };

  // Filtered Lucide icons list for search selector
  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return ICONS_LIST;
    const q = iconSearch.toLowerCase();
    return ICONS_LIST.filter(
      (i) => i.label.toLowerCase().includes(q) || i.id.toLowerCase().includes(q),
    );
  }, [iconSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const isBosko = theme === "bosko";

  return (
    <div className="space-y-6">
      {/* Title + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-50">Carta</h1>
          <p className="text-[12px] text-ink-400 mt-1">
            Gestioná los tragos de tu boliche. {drinks.length} tragos registrados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={`h-9 px-4 rounded-lg text-ink-950 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 hover:brightness-110 transition-all cursor-pointer ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
        >
          <Plus size={14} strokeWidth={3} />
          Nuevo Trago
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Table & search panel */}
        <div className="flex-1 w-full space-y-4 min-w-0">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full h-10 pl-10 pr-4 bg-ink-900 border border-ink-800 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/30 transition-all"
            />
          </div>

          {/* Drinks table */}
          <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_110px] gap-3 px-5 py-3 border-b border-ink-800 bg-ink-925/50">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">Nombre</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 text-right">Precio</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 text-center">Acciones</span>
            </div>

            {filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-ink-500">
                {search ? "Sin resultados para tu búsqueda" : "No hay tragos registrados"}
              </div>
            ) : (
              <div className="divide-y divide-ink-850">
                {filtered.map((d) => {
                  const DrinkIcon = ICONS_LIST.find((i) => i.id === d.iconName)?.icon || GlassWater;
                  const isSelected = editDrink?.id === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => openEdit(d)}
                      className={`grid grid-cols-[1fr_100px_110px] gap-3 items-center px-5 py-3 transition-colors cursor-pointer hover:bg-ink-850/50 ${
                        isSelected
                          ? isBosko
                            ? "bg-[#4ade80]/5 border-l-2 border-l-[#4ade80]"
                            : "bg-blue/5 border-l-2 border-l-blue"
                          : "border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-ink-800 flex items-center justify-center text-ink-450 shrink-0">
                          <DrinkIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[13px] font-medium truncate ${d.available ? "text-ink-50" : "text-ink-500 line-through"}`}>{d.name}</p>
                        </div>
                      </div>
                      <span className={`font-mono text-[13px] text-right tabular ${d.available ? "text-ink-100" : "text-ink-500"}`}>
                        ${d.price.toLocaleString("es-AR")}
                      </span>
                      <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => toggleAvailable(d, e)}
                          className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                            d.available
                              ? "bg-ink-800 border-ink-700 text-ink-300 hover:text-blue hover:border-blue-line"
                              : "bg-ink-800/40 border-ink-800 text-ink-550 hover:text-ink-300 hover:border-ink-700"
                          }`}
                          title={d.available ? "Ocultar de la carta" : "Mostrar en la carta"}
                        >
                          {d.available ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(d)}
                          className="w-7 h-7 rounded-md bg-ink-800 border border-ink-700 text-ink-300 flex items-center justify-center hover:text-danger hover:border-danger-line transition-all cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Inline Drawer/Side Panel for CRUD operations */}
        {modalOpen && editDrink && (
          <div className="w-full lg:w-[560px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-5 flex flex-col gap-4 animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-ink-800">
              <h2 className="text-sm font-bold text-ink-50 uppercase tracking-wider">
                {editDrink.id ? "Editar Trago" : "Nuevo Trago"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
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
                  onChange={(e) => setEditDrink({ ...editDrink, name: e.target.value })}
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
                  onChange={(e) => setEditDrink({ ...editDrink, price: Number(e.target.value) })}
                  className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono focus:outline-none focus:border-blue transition-all"
                  placeholder="5500"
                />
                {editDrink.price > 0 && (
                  <span className="text-[10px] text-green font-mono mt-1.5 block">
                    Valor formateado: ${editDrink.price.toLocaleString("es-AR")}
                  </span>
                )}
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
                          onClick={() => setEditDrink({ ...editDrink, iconName: i.id })}
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
                    const activeClass = tag === "promo"
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                      : tag === "trending"
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                        : isBosko ? "bg-[#4ade80]/15 border-[#4ade80]/40 text-[#4ade80]" : "bg-blue/15 border-blue/40 text-blue";
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setEditDrink({
                          ...editDrink,
                          promo: tag === "promo",
                          trending: tag === "trending",
                        })}
                        className={`h-8 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          isSelected
                            ? activeClass
                            : "bg-transparent border-transparent text-ink-400 hover:text-ink-200"
                        }`}
                      >
                        {label}
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
                onClick={closeModal}
                className="h-8.5 px-3 rounded-lg bg-ink-850 border border-ink-750 text-[11px] font-medium text-ink-300 hover:text-ink-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editDrink.name || !editDrink.price}
                className={`h-8.5 px-4 rounded-lg text-ink-950 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
              >
                {saving ? "Guardando..." : editDrink.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Saved feedback popup */}
      {saved && (
        <div className="fixed bottom-6 right-6 bg-green-soft border border-green-line text-green px-4 py-2.5 rounded-xl text-[12px] font-medium flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-4 z-50">
          <Check size={16} />
          Cambios guardados
        </div>
      )}

      {/* Safe Delete Modal */}
      <SafeDeleteModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Eliminar Trago/Producto"
        expectedText={deleteConfirm?.name || ""}
        typeLabel="el trago"
      />
    </div>
  );
}
