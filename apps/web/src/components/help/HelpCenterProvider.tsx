"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { TourProvider, useTour, type TourEndReason } from "@/components/tour/TourProvider";
import {
  getCategories,
  hasSeenHelpGeneral,
  markCategoryDone,
  markHelpGeneralSeen,
  readCompletedCategories,
  type AdminNightConfig,
  type CajaHelpConfig,
  type HelpCategoryId,
  type HelpRole,
} from "./helpTours";

type HelpApi = {
  completedCategories: HelpCategoryId[];
  /** Tour de onboarding (topbar ?). */
  startGeneralTour: () => Promise<void>;
  /** Tour de una sección (hint ? contextual). */
  startTour: (category: HelpCategoryId) => Promise<void>;
};

const HelpContext = createContext<HelpApi | undefined>(undefined);

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used within HelpCenterProvider");
  return ctx;
}

export function useHelpSafe() {
  return useContext(HelpContext);
}

type Props = {
  role: HelpRole;
  onNavigateTab: (tab: string) => void;
  enabled?: boolean;
  cajaConfig?: CajaHelpConfig;
  adminNightConfig?: AdminNightConfig;
  children: ReactNode;
};

function HelpBridge({
  role,
  cajaConfig,
  adminNightConfig,
  completedCategories,
  children,
  cleanupRef,
}: {
  role: HelpRole;
  cajaConfig?: CajaHelpConfig;
  adminNightConfig?: AdminNightConfig;
  completedCategories: HelpCategoryId[];
  children: ReactNode;
  cleanupRef: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  const tour = useTour();
  const startingRef = useRef(false);

  const categories = useMemo(
    () => getCategories(role, cajaConfig, adminNightConfig),
    [role, cajaConfig, adminNightConfig],
  );

  const startTour = useCallback(
    async (categoryId: HelpCategoryId) => {
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat || startingRef.current) return;

      startingRef.current = true;
      try {
        const steps = cat.steps;

        if (steps.length === 0) return;

        const startCtx = await cat.onStart?.();
        cleanupRef.current = startCtx != null
          ? async () => { await cat.onEnd?.(startCtx); }
          : null;

        await tour.runSteps(steps, { categoryId });
      } finally {
        startingRef.current = false;
      }
    },
    [categories, tour],
  );

  const startGeneralTour = useCallback(
    () => startTour("general"),
    [startTour],
  );

  // First visit: arranca el tour general (no hay panel).
  useEffect(() => {
    if (hasSeenHelpGeneral()) return;
    markHelpGeneralSeen();
    const t = window.setTimeout(() => {
      void startGeneralTour();
    }, 600);
    return () => window.clearTimeout(t);
  }, [startGeneralTour]);

  const api: HelpApi = {
    completedCategories,
    startGeneralTour,
    startTour,
  };

  return <HelpContext.Provider value={api}>{children}</HelpContext.Provider>;
}

export function HelpCenterProvider({
  role,
  onNavigateTab,
  enabled = true,
  cajaConfig,
  adminNightConfig,
  children,
}: Props) {
  const [completedCategories, setCompletedCategories] = useState<HelpCategoryId[]>(() =>
    readCompletedCategories(),
  );
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  const handleTourEnd = useCallback((reason: TourEndReason, meta?: { categoryId?: string }) => {
    // Call cleanup first (e.g. cancel test ticket for auditoría)
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;
    if (cleanup) void cleanup();

    if (reason !== "done" || !meta?.categoryId) return;
    setCompletedCategories(markCategoryDone(meta.categoryId as HelpCategoryId));
  }, []);

  return (
    <TourProvider
      onNavigateTab={onNavigateTab}
      autoStart={false}
      enableResume={role === "admin"}
      enabled={enabled}
      onTourEnd={handleTourEnd}
    >
      {enabled ? (
        <HelpBridge
          role={role}
          cajaConfig={cajaConfig}
          adminNightConfig={adminNightConfig}
          completedCategories={completedCategories}
          cleanupRef={cleanupRef}
        >
          {children}
        </HelpBridge>
      ) : (
        children
      )}
    </TourProvider>
  );
}
