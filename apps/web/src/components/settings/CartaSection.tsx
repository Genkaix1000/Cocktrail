"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Wine } from "lucide-react";
import { drinksService } from "@/services/drinks.service";
import type { Drink } from "@cocktrail/shared";
import { useTheme } from "@/components/ThemeProvider";
import Toast from "@/components/shared/Toast";
import DrinksTable from "./DrinksTable";
import DrinkFormModal, { type DrinkForm } from "./DrinkFormModal";

/** Ventana para deshacer un delete antes de pegarle a la API. */
const DELETE_UNDO_MS = 5000;

// Función en vez de constante: `flavors` es un array y si fuera un objeto
// módulo-level compartido, todas las aperturas de "Nuevo Trago" mutarían la
// misma referencia. Hoy no hay UI para editar `flavors`, pero evita la trampa.
const makeEmptyForm = (): DrinkForm => ({
  name: "",
  price: 0,
  description: "",
  vibe: "",
  flavors: [],
  iconName: "glass-water",
  trending: false,
  promo: false,
  available: true,
});

export default function CartaSection() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false); // Controls side-drawer visibility
  const [editDrink, setEditDrink] = useState<DrinkForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [undoDelete, setUndoDelete] = useState<Drink | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  const [sortField, setSortField] = useState<"name" | "price">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // ponytail: un solo delete pendiente a la vez; cola si hace falta paralelizar
  const pendingDeleteRef = useRef<{ drink: Drink; timer: ReturnType<typeof setTimeout> } | null>(null);

  const commitDelete = useCallback(async (drink: Drink) => {
    try {
      await drinksService.delete(drink.id);
    } catch (err) {
      console.error("Error deleting trago:", err);
      setDrinks((prev) => (prev.some((d) => d.id === drink.id) ? prev : [...prev, drink]));
      setError("No se pudo eliminar el trago. Reintentá en unos segundos.");
    }
  }, []);

  const flushPendingDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    void commitDelete(pending.drink);
  }, [commitDelete]);

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      // Best-effort: no await en unmount; el DELETE sigue en vuelo.
      void drinksService.delete(pending.drink.id).catch(() => {});
      pendingDeleteRef.current = null;
    };
  }, []);

  const loadDrinks = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await drinksService.list();
      setDrinks(data);
    } catch (err) {
      console.error("Error loading drinks:", err);
      // Sin esto, un error de red se ve idéntico a "carta vacía" y el dueño
      // del boliche puede pensar que borró todos los tragos.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDrinks();
  }, [loadDrinks]);

  const sortedAndFiltered = useMemo(() => {
    let list = [...drinks];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const [valA, valB]: [string | number, string | number] =
        sortField === "name"
          ? [a.name.toLowerCase(), b.name.toLowerCase()]
          : [a.price, b.price];

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [drinks, search, sortField, sortDirection]);

  const handleSort = (field: "name" | "price") => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const openCreate = useCallback(() => {
    setEditDrink(makeEmptyForm());
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((drink: Drink) => {
    setEditDrink({ ...drink });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditDrink(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editDrink || saving) return;
    setSaving(true);
    setError(null);
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
    } catch (err) {
      console.error("Error saving trago:", err);
      setError("No se pudo guardar el trago. Reintentá en unos segundos.");
    } finally {
      setSaving(false);
    }
  }, [editDrink, saving, closeModal]);

  const handleConfirmDelete = useCallback(
    (drink: Drink) => {
      setConfirmingDeleteId(null);
      flushPendingDelete();
      setDrinks((prev) => prev.filter((d) => d.id !== drink.id));
      if (editDrink?.id === drink.id) {
        setModalOpen(false);
        setEditDrink(null);
      }
      const timer = setTimeout(() => {
        pendingDeleteRef.current = null;
        setUndoDelete((current) => (current?.id === drink.id ? null : current));
        void commitDelete(drink);
      }, DELETE_UNDO_MS);
      pendingDeleteRef.current = { drink, timer };
      setUndoDelete(drink);
      setError(null);
    },
    [flushPendingDelete, commitDelete, editDrink?.id],
  );

  const handleUndoDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setDrinks((prev) => (prev.some((d) => d.id === pending.drink.id) ? prev : [...prev, pending.drink]));
    setUndoDelete(null);
  }, []);

  const toggleAvailable = useCallback(async (drink: Drink, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await drinksService.update(drink.id, { available: !drink.available });
      setDrinks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setSaved(true);
    } catch (err) {
      console.error("Error toggling availability:", err);
      setError("No se pudo actualizar la disponibilidad. Reintentá en unos segundos.");
    }
  }, []);

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
          <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Wine size={16} />
            </div>
            <span>Carta</span>
          </h1>
          <p className="text-[13px] text-ink-400/80 mt-1">
            Gestioná los tragos de tu boliche. {drinks.length} tragos registrados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.97]"
        >
          <Plus size={14} strokeWidth={2.5} />
          Nuevo Trago
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Table & search panel */}
        <div className={`flex-1 w-full space-y-4 min-w-0 ${modalOpen ? "" : "max-w-4xl"}`}>
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

          <DrinksTable
            drinks={sortedAndFiltered}
            loadError={loadError}
            search={search}
            sortField={sortField}
            sortDirection={sortDirection}
            isBosko={isBosko}
            selectedDrinkId={editDrink?.id}
            confirmingDeleteId={confirmingDeleteId}
            onSort={handleSort}
            onRetry={loadDrinks}
            onSelectDrink={openEdit}
            onToggleAvailable={toggleAvailable}
            onAskDelete={(d) => setConfirmingDeleteId(d.id)}
            onCancelDelete={() => setConfirmingDeleteId(null)}
            onConfirmDelete={handleConfirmDelete}
          />
        </div>

        {/* Inline Drawer/Side Panel for CRUD operations */}
        {modalOpen && editDrink && (
          <DrinkFormModal
            editDrink={editDrink}
            isBosko={isBosko}
            saving={saving}
            onChange={(patch) => setEditDrink({ ...editDrink, ...patch })}
            onCancel={closeModal}
            onSave={handleSave}
          />
        )}
      </div>

      {/* Saved feedback popup */}
      {undoDelete ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message={`Eliminado: ${undoDelete.name}`}
            duration={DELETE_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoDelete }}
            onClose={() => setUndoDelete(null)}
          />
        </div>
      ) : saved ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="success" message="Cambios guardados" duration={2500} onClose={() => setSaved(false)} />
        </div>
      ) : error ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      ) : null}
    </div>
  );
}
