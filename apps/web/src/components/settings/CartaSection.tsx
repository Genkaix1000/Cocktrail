"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Loader2, Plus, Search, Tags } from "lucide-react";
import { drinksService } from "@/services/drinks.service";
import { drinkCategoriesService } from "@/services/drink-categories.service";
import type { Drink, DrinkCategory } from "@cocktrail/shared";
import Toast from "@/components/shared/Toast";
import { SectionHelpButton } from "@/components/help/SectionHelpButton";
import DrinksTable, {
  type ColumnFilters,
  type SortDirection,
  type SortField,
} from "./DrinksTable";
import DrinkFormModal, { flagsForCategory, type DrinkForm } from "./DrinkFormModal";
import CategoriesEditorModal from "./CategoriesEditorModal";
import {
  type CartaColId,
  CARTA_COLS_DEFAULT,
  CARTA_COLS_REQUIRED,
  loadCartaCols,
  saveCartaCols,
} from "./cartaCrud";

const DELETE_UNDO_MS = 5000;

const EMPTY_COL_FILTERS: ColumnFilters = {
  name: "",
  priceMin: "",
  priceMax: "",
  status: "all",
  tags: "all",
  promo: "all",
  trending: "all",
  id: "",
};

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
  categoryId: null,
  sortOrder: 0,
  scheduleEnabled: false,
  scheduleFrom: "22:00",
  scheduleUntil: "03:00",
  scheduleHideWhenExpired: false,
  scheduleMoveToCategoryId: null,
  scheduleRepeatNextEvent: false,
});

type ViewFilter = "all" | "in" | "out";
type SidePanel = "drink" | "categories" | null;

export default function CartaSection() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [categories, setCategories] = useState<DrinkCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(EMPTY_COL_FILTERS);
  const [visibleCols, setVisibleCols] = useState<CartaColId[]>(CARTA_COLS_DEFAULT);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [editDrink, setEditDrink] = useState<DrinkForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [undoDelete, setUndoDelete] = useState<Drink | null>(null);
  const [undoDeleteCategory, setUndoDeleteCategory] = useState<DrinkCategory | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [sortField, setSortField] = useState<SortField>("category");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const pendingDeleteRef = useRef<{ drink: Drink; timer: ReturnType<typeof setTimeout> } | null>(null);
  const pendingCategoryDeleteRef = useRef<{ category: DrinkCategory; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    setVisibleCols(loadCartaCols());
  }, []);

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const categorySort = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.sortOrder])),
    [categories],
  );

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
      void drinksService.delete(pending.drink.id).catch(() => {});
      pendingDeleteRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      const pending = pendingCategoryDeleteRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      void drinkCategoriesService.delete(pending.category.id).catch(() => {});
      pendingCategoryDeleteRef.current = null;
    };
  }, []);

  const loadDrinks = useCallback(async () => {
    setLoadError(false);
    try {
      const [drinksData, categoriesData] = await Promise.all([
        drinksService.list(),
        drinkCategoriesService.list(),
      ]);
      setDrinks(drinksData);
      setCategories(categoriesData);
    } catch (err) {
      console.error("Error loading drinks:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDrinks();
  }, [loadDrinks]);

  const setFiltersOpenSafe = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setFiltersOpen((prev) => {
      const next = typeof open === "function" ? open(prev) : open;
      if (!next) setColumnFilters(EMPTY_COL_FILTERS);
      return next;
    });
  }, []);

  const sortedAndFiltered = useMemo(() => {
    let list = [...drinks];

    if (viewFilter === "in") list = list.filter((d) => d.available);
    if (viewFilter === "out") list = list.filter((d) => !d.available);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }

    if (filtersOpen) {
      const cf = columnFilters;
      if (cf.name.trim()) {
        const q = cf.name.toLowerCase();
        list = list.filter((d) => d.name.toLowerCase().includes(q));
      }
      if (cf.id.trim()) {
        list = list.filter((d) => String(d.id).includes(cf.id.trim()));
      }
      const min = cf.priceMin === "" ? null : Number(cf.priceMin);
      const max = cf.priceMax === "" ? null : Number(cf.priceMax);
      if (min != null && !Number.isNaN(min)) list = list.filter((d) => d.price >= min);
      if (max != null && !Number.isNaN(max)) list = list.filter((d) => d.price <= max);
      if (cf.status === "in") list = list.filter((d) => d.available);
      if (cf.status === "out") list = list.filter((d) => !d.available);
      if (cf.tags === "promo") list = list.filter((d) => d.promo);
      if (cf.tags === "trending") list = list.filter((d) => d.trending);
      if (cf.tags === "any") list = list.filter((d) => d.promo || d.trending);
      if (cf.promo === "yes") list = list.filter((d) => d.promo);
      if (cf.promo === "no") list = list.filter((d) => !d.promo);
      if (cf.trending === "yes") list = list.filter((d) => d.trending);
      if (cf.trending === "no") list = list.filter((d) => !d.trending);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "category") {
        const orderA = a.categoryId ? (categorySort[a.categoryId] ?? 9999) : 9999;
        const orderB = b.categoryId ? (categorySort[b.categoryId] ?? 9999) : 9999;
        const soA = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Infinity;
        const soB = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Infinity;
        cmp = orderA - orderB || soA - soB || a.name.localeCompare(b.name);
      } else if (sortField === "name") {
        cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else {
        cmp = a.price - b.price;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return list;
  }, [drinks, search, sortField, sortDirection, viewFilter, filtersOpen, columnFilters, categorySort]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const toggleCol = useCallback((col: CartaColId) => {
    if (CARTA_COLS_REQUIRED.includes(col)) return;
    setVisibleCols((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      const order: CartaColId[] = [
        "id",
        "name",
        "category",
        "price",
        "status",
        "tags",
        "actions",
      ];
      const ordered = order.filter((c) => next.includes(c) || CARTA_COLS_REQUIRED.includes(c));
      saveCartaCols(ordered);
      return ordered;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditDrink(makeEmptyForm());
    setSidePanel("drink");
  }, []);

  const openEdit = useCallback((drink: Drink) => {
    setEditDrink({ ...drink, description: "", vibe: "" });
    setSidePanel("drink");
  }, []);

  const openCategories = useCallback(() => {
    setEditDrink(null);
    setSidePanel("categories");
  }, []);

  const closeSidePanel = useCallback(() => {
    setSidePanel(null);
    setEditDrink(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editDrink || saving) return;
    setSaving(true);
    setError(null);
    try {
      const flags = flagsForCategory(editDrink.categoryId);
      const payload = {
        ...editDrink,
        description: "",
        vibe: "",
        flavors: editDrink.flavors ?? [],
        categoryId: editDrink.categoryId ?? null,
        ...flags,
      };
      if (editDrink.id != null) {
        const drinkId = editDrink.id;
        const { id: _, ...rest } = payload;
        const updated = await drinksService.update(drinkId, rest);
        setDrinks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      } else {
        const created = await drinksService.create(payload);
        setDrinks((prev) => [...prev, created]);
      }
      closeSidePanel();
      setSaved(true);
    } catch (err) {
      console.error("Error saving trago:", err);
      setError("No se pudo guardar el trago. Reintentá en unos segundos.");
    } finally {
      setSaving(false);
    }
  }, [editDrink, saving, closeSidePanel]);

  const handleConfirmDelete = useCallback(
    (drink: Drink) => {
      setConfirmingDeleteId(null);
      flushPendingDelete();
      setDrinks((prev) => prev.filter((d) => d.id !== drink.id));
      if (editDrink?.id === drink.id) {
        setSidePanel(null);
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
    } catch (err) {
      console.error("Error toggling availability:", err);
      setError("No se pudo actualizar la disponibilidad. Reintentá en unos segundos.");
    }
  }, []);

  const handleCreateCategory = useCallback(
    async (name: string) => {
      setSavingCategory(true);
      setError(null);
      try {
        const created = await drinkCategoriesService.create({ name });
        setCategories((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
      } catch (err) {
        console.error("Error creating category:", err);
        setError("No se pudo crear la categoría.");
        throw err;
      } finally {
        setSavingCategory(false);
      }
    },
    [],
  );

  const handleReorderCategories = useCallback(async (ids: string[]) => {
    setSavingCategory(true);
    setError(null);
    try {
      const next = await drinkCategoriesService.reorder(ids);
      setCategories(next);
    } catch (err) {
      console.error("Error reordering categories:", err);
      setError("No se pudo guardar el orden de categorías.");
      // Recargar para no dejar el UI desync.
      const fresh = await drinkCategoriesService.list().catch(() => null);
      if (fresh) setCategories(fresh);
    } finally {
      setSavingCategory(false);
    }
  }, []);

  const commitDeleteCategory = useCallback(async (category: DrinkCategory) => {
    try {
      await drinkCategoriesService.delete(category.id);
      setDrinks((prev) =>
        prev.map((d) =>
          d.categoryId === category.id ? { ...d, categoryId: null, promo: false, trending: false } : d,
        ),
      );
    } catch (err) {
      console.error("Error deleting category:", err);
      setCategories((prev) =>
        prev.some((c) => c.id === category.id)
          ? prev
          : [...prev, category].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setError("No se pudo eliminar la categoría.");
    }
  }, []);

  const handleDeleteCategory = useCallback(
    async (id: string) => {
      const category = categories.find((c) => c.id === id);
      if (!category) return;
      // Flush cualquier borrado de categoría pendiente antes de encolar otro.
      const prevPending = pendingCategoryDeleteRef.current;
      if (prevPending) {
        clearTimeout(prevPending.timer);
        pendingCategoryDeleteRef.current = null;
        void commitDeleteCategory(prevPending.category);
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      const timer = setTimeout(() => {
        pendingCategoryDeleteRef.current = null;
        setUndoDeleteCategory((current) => (current?.id === id ? null : current));
        void commitDeleteCategory(category);
      }, DELETE_UNDO_MS);
      pendingCategoryDeleteRef.current = { category, timer };
      setUndoDeleteCategory(category);
      setError(null);
    },
    [categories, commitDeleteCategory],
  );

  const handleUndoDeleteCategory = useCallback(() => {
    const pending = pendingCategoryDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCategoryDeleteRef.current = null;
    setCategories((prev) =>
      prev.some((c) => c.id === pending.category.id)
        ? prev
        : [...prev, pending.category].sort((a, b) => a.sortOrder - b.sortOrder),
    );
    setUndoDeleteCategory(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  const views: { id: ViewFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "in", label: "En carta" },
    { id: "out", label: "Ocultos" },
  ];

  return (
    <div className="flex flex-col gap-8 w-full min-w-0">
      <div data-tour="carta-header" className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
            Carta
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
            Gestioná los tragos de tu boliche. {sortedAndFiltered.length}{" "}
            {sortedAndFiltered.length === 1 ? "trago" : "tragos"}
            {sortedAndFiltered.length !== drinks.length
              ? sortedAndFiltered.length === 1
                ? " visible"
                : " visibles"
              : " registrados"}
            .
          </p>
        </div>
        <SectionHelpButton category="carta" />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 w-full space-y-4 min-w-0">
          <div data-tour="carta-toolbar" className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              {views.map((v) => {
                const active = viewFilter === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewFilter(v.id)}
                    className={`h-10 px-4 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] border border-transparent"
                        : "bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
              <button
                type="button"
                title="Filtros de columna"
                aria-label="Filtros de columna"
                aria-pressed={filtersOpen}
                onClick={() => setFiltersOpenSafe((o) => !o)}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                  filtersOpen
                    ? "bg-[var(--accent-surface)] border-transparent text-[var(--accent-text)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                }`}
              >
                <Filter size={15} />
              </button>
            </div>

            <div className="flex-1 min-w-[180px] flex items-center h-10 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden focus-within:border-[var(--accent-primary)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre…"
                className="flex-1 h-full pl-4 pr-2 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
              />
              <span className="w-10 h-10 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                <Search size={15} />
              </span>
            </div>

            <button
              type="button"
              data-tour="nuevo-trago"
              onClick={openCreate}
              className="h-10 px-4 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.98]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Nuevo trago
            </button>

            <button
              type="button"
              data-tour="carta-categories"
              onClick={openCategories}
              aria-pressed={sidePanel === "categories"}
              className={`h-10 px-4 rounded-full text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.98] border ${
                sidePanel === "categories"
                  ? "bg-[var(--accent-surface)] border-transparent text-[var(--accent-text)]"
                  : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
              }`}
            >
              <Tags size={14} strokeWidth={2.5} />
              Categorías
            </button>
          </div>

          <div data-tour="carta-table">
            <DrinksTable
            drinks={sortedAndFiltered}
            categoryNames={categoryNames}
            loadError={loadError}
            hasActiveSearch={Boolean(search.trim())}
            sortField={sortField}
            sortDirection={sortDirection}
            selectedDrinkId={editDrink?.id}
            confirmingDeleteId={confirmingDeleteId}
            visibleCols={visibleCols}
            filtersOpen={filtersOpen}
            columnFilters={columnFilters}
            onSort={handleSort}
            onRetry={loadDrinks}
            onSelectDrink={openEdit}
            onToggleAvailable={toggleAvailable}
            onAskDelete={(d) => setConfirmingDeleteId(d.id)}
            onCancelDelete={() => setConfirmingDeleteId(null)}
            onConfirmDelete={handleConfirmDelete}
            onToggleCol={toggleCol}
              onColumnFiltersChange={(patch) => setColumnFilters((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </div>

        {sidePanel === "drink" && editDrink && (
          <DrinkFormModal
            editDrink={editDrink}
            categories={categories}
            saving={saving}
            onChange={(patch) => setEditDrink((prev) => ({ ...(prev ?? makeEmptyForm()), ...patch } as DrinkForm))}
            onCancel={closeSidePanel}
            onSave={handleSave}
          />
        )}

        {sidePanel === "categories" && (
          <CategoriesEditorModal
            categories={categories}
            saving={savingCategory}
            onChange={setCategories}
            onCreate={handleCreateCategory}
            onReorder={handleReorderCategories}
            onDelete={handleDeleteCategory}
            onClose={closeSidePanel}
          />
        )}
      </div>

      {undoDeleteCategory ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message={`Categoría eliminada: ${undoDeleteCategory.name}`}
            duration={DELETE_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoDeleteCategory }}
            onClose={() => setUndoDeleteCategory(null)}
          />
        </div>
      ) : undoDelete ? (
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
          <Toast variant="success" message="Cambios guardados" onClose={() => setSaved(false)} />
        </div>
      ) : null}

      {error && (
        <div className="fixed bottom-6 left-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      )}
    </div>
  );
}
