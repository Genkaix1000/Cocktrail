"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { TourProvider, useTour, type TourEndReason } from "@/components/tour/TourProvider";
import {
  getCategories,
  hasSeenHelpGeneral,
  markHelpGeneralSeen,
  type AdminNightConfig,
  type CajaHelpConfig,
  type HelpCategoryId,
  type HelpRole,
} from "./helpTours";

type HelpApi = {
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
  children,
  cleanupRef,
}: {
  role: HelpRole;
  cajaConfig?: CajaHelpConfig;
  adminNightConfig?: AdminNightConfig;
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

        cajaConfig?.onEnsureSidebarExpanded?.();
        const startCtx = await cat.onStart?.();
        cleanupRef.current = startCtx != null
          ? async () => { await cat.onEnd?.(startCtx); }
          : null;

        await tour.runSteps(steps, { categoryId });
      } finally {
        startingRef.current = false;
      }
    },
    [categories, tour, cleanupRef],
  );

  const startGeneralTour = useCallback(
    () => startTour("general"),
    [startTour],
  );

  useEffect(() => {
    if (hasSeenHelpGeneral()) return;
    markHelpGeneralSeen();
    const t = window.setTimeout(() => {
      void startGeneralTour();
    }, 600);
    return () => window.clearTimeout(t);
  }, [startGeneralTour]);

  const api: HelpApi = {
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
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  const handleTourEnd = useCallback((_reason: TourEndReason, _meta?: { categoryId?: string }) => {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;
    if (cleanup) void cleanup();
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
