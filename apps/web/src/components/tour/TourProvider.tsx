"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { mercadopagoService } from "@/services/mercadopago.service";
import { pdvService } from "@/services/pdv.service";
import { TourOverlay } from "./TourOverlay";
import {
  TOUR_RESUME_KEY,
  TOUR_RESUME_POST_LINK,
  TOUR_SEEN_KEY,
  buildPagosSteps,
  type TourStep,
  type TourStepId,
  type TourTab,
} from "./tourSteps";

export type TourEndReason = "skip" | "done";

type TourApi = {
  running: boolean;
  start: (opts?: { force?: boolean }) => void;
  /** Corre un tour arbitrario (Help Center). No mira seenKey. */
  runSteps: (steps: TourStep[], opts?: { categoryId?: string }) => void;
  next: () => void;
  prev: () => void;
  end: (reason?: TourEndReason) => void;
  goto: (id: TourStepId) => void;
};

const TourContext = createContext<TourApi | undefined>(undefined);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function useTourSafe() {
  return useContext(TourContext);
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function waitForSelector(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const startAt = performance.now();
    const tick = () => {
      const nodes = Array.from(document.querySelectorAll(selector));
      const el = nodes.find((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      if (el) {
        resolve(el);
        return;
      }
      if (performance.now() - startAt > timeoutMs) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function getAdminScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".bosko-scroll");
}

function getScrollParent(el: Element): HTMLElement {
  const admin = getAdminScroller();
  if (admin && admin.contains(el)) return admin;

  let p = el.parentElement;
  while (p) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return p;
    }
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

async function waitLayoutStable(el: Element, rounds = 12): Promise<void> {
  let last = el.getBoundingClientRect().top;
  if (el.getBoundingClientRect().height > 2) return;
  for (let i = 0; i < rounds; i++) {
    await delay(80);
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - last) < 1 && el.getBoundingClientRect().height > 2) return;
    last = top;
  }
}

async function animateScrollTo(
  el: Element,
  durationMs: number,
  align: "center" | "end" = "center",
): Promise<void> {
  const parent = getScrollParent(el);
  await waitLayoutStable(el);

  const measureTarget = () => {
    const parentRect = parent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (align === "end") {
      return parent.scrollTop + (elRect.bottom - parentRect.top) - parent.clientHeight + 28;
    }
    return (
      parent.scrollTop + (elRect.top - parentRect.top) - parent.clientHeight / 2 + elRect.height / 2
    );
  };

  const run = (ms: number) =>
    new Promise<void>((resolve) => {
      const start = parent.scrollTop;
      const raw = measureTarget();
      const max = Math.max(0, parent.scrollHeight - parent.clientHeight);
      const target = Math.max(0, Math.min(raw, max));
      const delta = target - start;
      if (Math.abs(delta) < 4) {
        resolve();
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const ease = 1 - (1 - t) ** 3;
        parent.scrollTop = start + delta * ease;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

  await run(durationMs);
  // Segunda pasada: Pagos termina de cargar y mueve el botón más abajo
  await delay(120);
  await waitLayoutStable(el, 8);
  await run(380);
}

function pickNavButton(tab: TourTab): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour-nav="${tab}"]`),
  );
  const visible = nodes.find((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  return visible ?? nodes[0] ?? null;
}

async function animateNavClick(tab: TourTab): Promise<void> {
  const btn = pickNavButton(tab);
  if (!btn) return;

  btn.classList.add("tour-nav-pulse");
  const rect = btn.getBoundingClientRect();
  const finger = document.createElement("div");
  finger.className = "tour-finger";
  finger.style.left = `${rect.left + Math.min(28, rect.width * 0.35)}px`;
  finger.style.top = `${rect.top + rect.height / 2 - 14}px`;
  document.body.appendChild(finger);

  await delay(750);
  finger.remove();
  btn.classList.remove("tour-nav-pulse");
}

type Props = {
  onNavigateTab: (tab: string) => void;
  seenKey?: string;
  loadSteps?: () => TourStep[] | Promise<TourStep[]>;
  enableResume?: boolean;
  autoStart?: boolean;
  enabled?: boolean;
  /** Callback al cerrar un tour (Help Center marca categorías completadas). */
  onTourEnd?: (reason: TourEndReason, meta?: { categoryId?: string }) => void;
  children: ReactNode;
};

export function TourProvider({
  onNavigateTab,
  seenKey = TOUR_SEEN_KEY,
  loadSteps,
  enableResume = true,
  autoStart = true,
  enabled = true,
  onTourEnd,
  children,
}: Props) {
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [ready, setReady] = useState(false);
  const startingRef = useRef(false);
  const mountedBootRef = useRef(false);
  const stepsRef = useRef<TourStep[]>([]);
  const indexRef = useRef(0);
  const onNavigateTabRef = useRef(onNavigateTab);
  const onTourEndRef = useRef(onTourEnd);
  const categoryIdRef = useRef<string | undefined>(undefined);
  const applyGenRef = useRef(0);
  const clickCleanupRef = useRef<(() => void) | null>(null);
  const nextRef = useRef<() => void>(() => {});

  onNavigateTabRef.current = onNavigateTab;
  onTourEndRef.current = onTourEnd;
  stepsRef.current = steps;
  indexRef.current = index;

  const clearClickAdvance = () => {
    clickCleanupRef.current?.();
    clickCleanupRef.current = null;
  };

  const end = useCallback((reason: TourEndReason = "skip") => {
    const categoryId = categoryIdRef.current;
    applyGenRef.current += 1;
    clearClickAdvance();
    setRunning(false);
    setReady(false);
    setTransitioning(false);
    setSteps([]);
    setIndex(0);
    categoryIdRef.current = undefined;
    try {
      localStorage.setItem(seenKey, "1");
      if (enableResume) sessionStorage.removeItem(TOUR_RESUME_KEY);
    } catch {
      /* private mode */
    }
    onTourEndRef.current?.(reason, categoryId ? { categoryId } : undefined);
  }, [enableResume, seenKey]);

  const applyStep = useCallback(async (step: TourStep) => {
    const gen = ++applyGenRef.current;
    clearClickAdvance();
    setTransitioning(true);

    if (step.animateNav) {
      await animateNavClick(step.animateNav);
      if (gen !== applyGenRef.current) return;
    }

    onNavigateTabRef.current(step.tab);
    await delay(step.animateNav ? 320 : 160);
    if (gen !== applyGenRef.current) return;

    if (step.scrollTop) {
      const scroller = document.querySelector(".bosko-scroll");
      if (scroller) {
        scroller.scrollTop = 0;
      }
      window.scrollTo({ top: 0 });
    }

    if (step.onEnter === "persist-resume-before-oauth") {
      try {
        sessionStorage.setItem(TOUR_RESUME_KEY, TOUR_RESUME_POST_LINK);
      } catch {
        /* ignore */
      }
    }
    if (step.id === "mp-congrats") {
      try {
        sessionStorage.removeItem(TOUR_RESUME_KEY);
      } catch {
        /* ignore */
      }
    }

    if (step.selector) {
      const isAutoOpenStep =
        step.id === "carta-form" || step.id === "staff-form" || step.id === "carta-cats-modal";
      // Si es un paso que abre modal/panel, no esperar 4.5s para ver si ya está abierto
      const timeout = isAutoOpenStep ? 150 : step.scrollAlign === "end" ? 8000 : 4500;
      let el = await waitForSelector(step.selector, timeout);

      // Si el form/panel aún no abrió, lo abrimos nosotros
      if (!el && isAutoOpenStep) {
        const opener =
          step.id === "carta-form"
            ? document.querySelector<HTMLElement>('[data-tour="nuevo-trago"]')
            : step.id === "carta-cats-modal"
              ? document.querySelector<HTMLElement>('[data-tour="carta-categories"]')
              : document.querySelector<HTMLElement>('[data-tour="nuevo-usuario"]');
        opener?.click();
        el = await waitForSelector(step.selector, 3000);
      }

      if (gen !== applyGenRef.current) return;
      if (el && step.scrollFeel !== false) {
        await animateScrollTo(el, 1100, step.scrollAlign ?? "center");
      } else if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        await delay(350);
      }
    }

    if (gen !== applyGenRef.current) return;
    setTransitioning(false);
    setReady(true);

    if (step.advanceOnClick && step.selector) {
      const target = await waitForSelector(step.selector, 1500);
      if (!target || gen !== applyGenRef.current) return;

      const onClick = () => {
        clearClickAdvance();
        // Esperar a que monte el form / panel
        window.setTimeout(() => {
          if (gen === applyGenRef.current) nextRef.current();
        }, 450);
      };
      target.addEventListener("click", onClick);
      clickCleanupRef.current = () => target.removeEventListener("click", onClick);
    }
  }, []);

  const runSteps = useCallback(
    async (nextSteps: TourStep[], opts?: { categoryId?: string }) => {
      if (!enabled || nextSteps.length === 0) return;
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        categoryIdRef.current = opts?.categoryId;
        setSteps(nextSteps);
        setIndex(0);
        setRunning(true);
        await applyStep(nextSteps[0]);
      } finally {
        startingRef.current = false;
      }
    },
    [applyStep, enabled],
  );

  const start = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!enabled) return;
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        let resumeFlag = false;
        if (enableResume) {
          try {
            resumeFlag = sessionStorage.getItem(TOUR_RESUME_KEY) === TOUR_RESUME_POST_LINK;
          } catch {
            resumeFlag = false;
          }
        }

        if (!opts?.force && !resumeFlag) {
          try {
            if (localStorage.getItem(seenKey)) return;
          } catch {
            /* ignore */
          }
        }

        let nextSteps: TourStep[];
        if (loadSteps) {
          nextSteps = await loadSteps();
        } else {
          // Default admin: tour de Pagos (Help Center + resume OAuth).
          const status = await mercadopagoService.getSellerStatus().catch(() => null);
          const linked = Boolean(status?.linked && status.status !== "expired");
          const resumePostLink = resumeFlag && linked;
          if (resumeFlag && !linked) {
            try {
              sessionStorage.removeItem(TOUR_RESUME_KEY);
            } catch {
              /* ignore */
            }
          }

          let hasOrphanCaja = false;
          if (linked || resumePostLink) {
            const cajas = await pdvService.listCajas().catch(() => []);
            hasOrphanCaja = cajas.some((c) => c.isOrphan);
          }

          nextSteps = buildPagosSteps({
            linked,
            displayName: status?.displayName ?? null,
            hasOrphanCaja,
            resumePostLink,
          });
          categoryIdRef.current = "pagos";
        }

        setSteps(nextSteps);
        setIndex(0);
        setRunning(true);
        await applyStep(nextSteps[0]);
      } finally {
        startingRef.current = false;
      }
    },
    [applyStep, enableResume, enabled, loadSteps, seenKey],
  );

  const next = useCallback(() => {
    if (transitioning) return;
    const i = indexRef.current;
    const list = stepsRef.current;
    const current = list[i];

    if (current?.advanceOnClick && current.selector) {
      // Si el listener sigue activo, el user tocó "Continuar" — simulamos el click.
      // Si ya fue limpiado, el user clickeó el target y advanceOnClick nos trajo acá: avanzar.
      if (clickCleanupRef.current) {
        const nodes = Array.from(document.querySelectorAll(current.selector));
        const target = nodes.find((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 2 && r.height > 2;
        }) as HTMLElement | undefined;
        if (target) {
          const clickTarget = (target.querySelector(".cursor-pointer") as HTMLElement) || target;
          clickTarget.click();
          return;
        }
      }
    }

    if (i >= list.length - 1) {
      end("done");
      return;
    }
    const nextIndex = i + 1;
    const currentStep = list[i];
    const nextStep = list[nextIndex];
    setIndex(nextIndex);
    if (!currentStep || currentStep.tab !== nextStep.tab) {
      setReady(false);
    }
    void applyStep(nextStep);
  }, [applyStep, end, transitioning]);

  const prev = useCallback(() => {
    if (transitioning) return;
    const i = indexRef.current;
    const list = stepsRef.current;
    if (i <= 0) return;
    const prevIndex = i - 1;
    const currentStep = list[i];
    const prevStep = list[prevIndex];
    setIndex(prevIndex);
    if (!currentStep || currentStep.tab !== prevStep.tab) {
      setReady(false);
    }
    void applyStep(list[prevIndex]);
  }, [applyStep, transitioning]);

  nextRef.current = next;

  const goto = useCallback(
    (id: TourStepId) => {
      const list = stepsRef.current;
      const nextIndex = list.findIndex((s) => s.id === id);
      if (nextIndex < 0) return;
      setIndex(nextIndex);
      setReady(false);
      void applyStep(list[nextIndex]);
    },
    [applyStep],
  );

  useEffect(() => {
    if (!enabled) return;
    if (mountedBootRef.current) return;
    mountedBootRef.current = true;

    let resume = false;
    if (enableResume) {
      try {
        resume = sessionStorage.getItem(TOUR_RESUME_KEY) === TOUR_RESUME_POST_LINK;
      } catch {
        resume = false;
      }
    }

    // Resume OAuth siempre, aunque autoStart esté apagado (Help Center).
    if (resume) {
      void start({ force: true });
      return;
    }

    if (!autoStart) return;

    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(seenKey));
    } catch {
      seen = false;
    }
    if (seen) return;

    const t = window.setTimeout(() => {
      void start();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once when enabled
  }, [autoStart, enabled]);

  const api: TourApi = { running, start, runSteps, next, prev, end, goto };
  const step = steps[index];

  return (
    <TourContext.Provider value={enabled ? api : undefined}>
      {children}
      {running && step && (
        <TourOverlay
          step={step}
          index={index}
          total={steps.length}
          busy={transitioning}
          visible={ready}
          onNext={next}
          onPrev={prev}
          onSkip={() => end("skip")}
        />
      )}
    </TourContext.Provider>
  );
}
