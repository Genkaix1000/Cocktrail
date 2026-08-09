"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CajaClient from "./CajaClient";
import CajaSessionOnboarding from "@/components/caja/CajaSessionOnboarding";
import { drinksService } from "@/services/drinks.service";
import { drinkCategoriesService } from "@/services/drink-categories.service";
import { authService } from "@/services/auth.service";
import {
  barSessionsService,
  setActiveBarContext,
  type BarSession,
  type BarSessionOption,
  type BarSessionOptions,
} from "@/services/bar-sessions.service";
import { ApiError } from "@/services/api-client";
import { useSSE } from "@/lib/useSSE";
import type { Drink, DrinkCategory } from "@cocktrail/shared";

type CurrentUser = {
  username: string;
  role: "admin" | "caja";
  permissions: {
    closeNight: boolean;
    cancelarTickets: boolean;
    historial: boolean;
    metricas: boolean;
  };
};

export default function CajaPage() {
  const router = useRouter();
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [categories, setCategories] = useState<DrinkCategory[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [boxes, setBoxes] = useState<BarSessionOption[]>([]);
  const [activeSession, setActiveSession] = useState<BarSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedBarId, setLoadedBarId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningBarId, setJoiningBarId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeBarId = activeSession?.barId ?? null;
  const activeBarIdRef = useRef(activeBarId);
  const usernameRef = useRef(currentUser?.username ?? null);
  const loadOptionsRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const autoJoinedRef = useRef<string | null>(null);

  useEffect(() => {
    activeBarIdRef.current = activeBarId;
  }, [activeBarId]);

  useEffect(() => {
    usernameRef.current = currentUser?.username ?? null;
  }, [currentUser?.username]);

  const applyOptions = useCallback((options: BarSessionOptions) => {
    setBoxes(options.boxes);
    setActiveSession(options.currentSession);
    setActiveBarContext(options.currentSession?.barId ?? null);
  }, []);

  const loadOptions = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      applyOptions(await barSessionsService.listOptions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las cajas.");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [applyOptions]);

  useEffect(() => {
    loadOptionsRef.current = loadOptions;
  }, [loadOptions]);

  // useSSE captura handlers en el mount: refs evitan stale-state.
  useSSE({
    "bar-session.expired": ({ barId, ejectedUser, ejectedBy }) => {
      void loadOptionsRef.current(true);

      if (activeBarIdRef.current !== barId) return;
      if (usernameRef.current && ejectedUser !== usernameRef.current) return;

      setActiveSession(null);
      setActiveBarContext(null);
      setLoadedBarId(null);
      setError(
        `Tu sesión fue cerrada por ${ejectedBy}. Elegí una caja para continuar.`,
      );
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | undefined;

    async function initialize() {
      try {
        const user = await authService.getMe();
        if (!user) {
          router.push("/login");
          return;
        }
        if (user.role !== "caja") {
          const dest = user.role === "admin" ? "/admin" : "/login";
          router.push(dest);
          return;
        }
        setCurrentUser(user);
      } catch (err) {
        // Sin sesión, /api/auth/me responde null (200): un throw acá es red
        // caída o 401. Mandar a /login por un microcorte obliga a la cajera a
        // re-loguearse con la cookie todavía válida — mejor reintentar.
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          setLoading(false);
          return;
        }
        if (!controller.signal.aborted) {
          retryTimer = window.setTimeout(() => void initialize(), 3_000);
        }
        return;
      }

      try {
        const options = await barSessionsService.listOptions(controller.signal);
        applyOptions(options);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las cajas.",
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void initialize();
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [applyOptions, router]);

  useEffect(() => {
    if (!activeBarId) return;
    let cancelled = false;
    Promise.all([drinksService.list(), drinkCategoriesService.list()])
      .then(([drinksData, categoriesData]) => {
        if (!cancelled) {
          setDrinks(drinksData);
          setCategories(categoriesData);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar la carta.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadedBarId(activeBarId);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBarId]);

  useEffect(() => {
    if (loading || activeBarId) return;
    const interval = window.setInterval(() => {
      void loadOptions(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [activeBarId, loadOptions, loading]);

  useEffect(() => {
    if (!activeBarId) return;
    const heartbeat = async () => {
      try {
        const session = await barSessionsService.heartbeat();
        setActiveSession(session);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setActiveSession(null);
          setActiveBarContext(null);
          setError("La sesión de esta caja terminó. Elegí una caja para continuar.");
          await loadOptions(true);
        }
      }
    };
    const interval = window.setInterval(() => {
      void heartbeat();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeBarId, loadOptions]);

  const handleJoin = useCallback(async (barId: string) => {
    setJoiningBarId(barId);
    setError(null);
    try {
      const { session } = await barSessionsService.join(barId);
      setActiveSession(session);
      setActiveBarContext(session.barId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const data = err.data as { connectedUser?: string };
        setError(
          data.connectedUser
            ? `Esta caja acaba de ser ocupada por ${data.connectedUser}.`
            : "Esta caja ya está en uso.",
        );
        await loadOptions(true);
      } else {
        setError(err instanceof Error ? err.message : "No se pudo conectar a la caja.");
      }
    } finally {
      setJoiningBarId(null);
    }
  }, [loadOptions]);

  // Una sola caja libre → entrar directo (sin pantalla de elección).
  useEffect(() => {
    if (loading || activeSession || joiningBarId) return;
    const joinable = boxes.filter((b) => b.status === "available" || b.status === "mine");
    if (joinable.length !== 1) return;
    const only = joinable[0];
    if (only.status !== "available") return;
    if (autoJoinedRef.current === only.barId) return;
    autoJoinedRef.current = only.barId;
    void handleJoin(only.barId);
  }, [loading, activeSession, joiningBarId, boxes, handleJoin]);

  async function handleLogout() {
    await authService.logout();
    router.push("/login");
    router.refresh();
  }

  // Debe vivir arriba de los early returns: Rules of Hooks.
  const reloadCarta = useCallback(async () => {
    try {
      const [drinksData, categoriesData] = await Promise.all([
        drinksService.list(),
        drinkCategoriesService.list(),
      ]);
      setDrinks(drinksData);
      setCategories(categoriesData);
    } catch (err) {
      console.error("Error al recargar la carta:", err);
    }
  }, []);

  if (loading || (activeBarId && loadedBarId !== activeBarId)) {
    return (
      <main className="min-h-[100dvh] bg-ink-950 text-ink-50 flex items-center justify-center">
        <p className="text-ink-400 text-sm animate-pulse">
          {activeSession ? "Conectando caja..." : "Buscando cajas..."}
        </p>
      </main>
    );
  }

  if (!currentUser) return null;

  if (!activeSession) {
    return (
      <CajaSessionOnboarding
        username={currentUser.username}
        boxes={boxes}
        joiningBarId={joiningBarId}
        refreshing={refreshing}
        error={error}
        onJoin={(barId) => void handleJoin(barId)}
        onRefresh={() => void loadOptions()}
        onLogout={() => void handleLogout()}
      />
    );
  }

  return (
    <CajaClient
      drinks={drinks}
      categories={categories}
      currentUser={currentUser}
      onReloadCarta={reloadCarta}
    />
  );
}
