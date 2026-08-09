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
  buildSteps,
  type TourStep,
  type TourStepId,
  type TourTab,
} from "./tourSteps";

type TourApi = {
  running: boolean;
  start: (opts?: { force?: boolean }) => void;
  next: () => void;
  prev: () => void;
  end: (reason?: "skip" | "done") => void;
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
  let last = -9999;
  for (let i = 0; i < rounds; i++) {
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - last) < 1 && el.getBoundingClientRect().height > 2) return;
    last = top;
    await delay(80);
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
  children: ReactNode;
};

export function TourProvider({ onNavigateTab, children }: Props) {
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const startingRef = useRef(false);
  const mountedBootRef = useRef(false);
  const stepsRef = useRef<TourStep[]>([]);
  const indexRef = useRef(0);
  const onNavigateTabRef = useRef(onNavigateTab);
  const applyGenRef = useRef(0);
  const clickCleanupRef = useRef<(() => void) | null>(null);
  const nextRef = useRef<() => void>(() => {});

  onNavigateTabRef.current = onNavigateTab;
  stepsRef.current = steps;
  indexRef.current = index;

  const clearClickAdvance = () => {
    clickCleanupRef.current?.();
    clickCleanupRef.current = null;
  };

  const end = useCallback((reason: "skip" | "done" = "skip") => {
    void reason;
    applyGenRef.current += 1;
    clearClickAdvance();
    setRunning(false);
    setTransitioning(false);
    setSteps([]);
    setIndex(0);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
      sessionStorage.removeItem(TOUR_RESUME_KEY);
    } catch {
      /* private mode */
    }
  }, []);

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
      // Pagos tarda en salir del spinner — dar más aire
      const timeout = step.scrollAlign === "end" ? 8000 : 4500;
      let el = await waitForSelector(step.selector, timeout);

      // Si el form aún no abrió (Omitir click), lo abrimos nosotros
      if (!el && (step.id === "carta-form" || step.id === "staff-form")) {
        const opener =
          step.id === "carta-form"
            ? document.querySelector<HTMLElement>('[data-tour="nuevo-trago"]')
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

  const start = useCallback(
    async (opts?: { force?: boolean }) => {
      if (startingRef.current) return;
      startingRef.current = true;
      try {
        let resumeFlag = false;
        try {
          resumeFlag = sessionStorage.getItem(TOUR_RESUME_KEY) === TOUR_RESUME_POST_LINK;
        } catch {
          resumeFlag = false;
        }

        if (!opts?.force && !resumeFlag) {
          try {
            if (localStorage.getItem(TOUR_SEEN_KEY)) return;
          } catch {
            /* ignore */
          }
        }

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

        const nextSteps = buildSteps({
          linked,
          displayName: status?.displayName ?? null,
          hasOrphanCaja,
          resumePostLink,
        });

        setSteps(nextSteps);
        setIndex(0);
        setRunning(true);
        await applyStep(nextSteps[0]);
      } finally {
        startingRef.current = false;
      }
    },
    [applyStep],
  );

  const next = useCallback(() => {
    if (transitioning) return;
    const i = indexRef.current;
    const list = stepsRef.current;
    if (i >= list.length - 1) {
      end("done");
      return;
    }
    const nextIndex = i + 1;
    setIndex(nextIndex);
    void applyStep(list[nextIndex]);
  }, [applyStep, end, transitioning]);

  const prev = useCallback(() => {
    if (transitioning) return;
    const i = indexRef.current;
    const list = stepsRef.current;
    if (i <= 0) return;
    const prevIndex = i - 1;
    setIndex(prevIndex);
    void applyStep(list[prevIndex]);
  }, [applyStep, transitioning]);

  nextRef.current = next;

  const goto = useCallback(
    (id: TourStepId) => {
      const list = stepsRef.current;
      const nextIndex = list.findIndex((s) => s.id === id);
      if (nextIndex < 0) return;
      setIndex(nextIndex);
      void applyStep(list[nextIndex]);
    },
    [applyStep],
  );

  useEffect(() => {
    if (mountedBootRef.current) return;
    mountedBootRef.current = true;

    let resume = false;
    try {
      resume = sessionStorage.getItem(TOUR_RESUME_KEY) === TOUR_RESUME_POST_LINK;
    } catch {
      resume = false;
    }

    if (resume) {
      void start({ force: true });
      return;
    }

    let seen = false;
    try {
      seen = Boolean(localStorage.getItem(TOUR_SEEN_KEY));
    } catch {
      seen = false;
    }
    if (seen) return;

    const t = window.setTimeout(() => {
      void start();
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once
  }, []);

  const api: TourApi = { running, start, next, prev, end, goto };
  const step = steps[index];

  return (
    <TourContext.Provider value={api}>
      {children}
      {running && step && (
        <TourOverlay
          step={step}
          index={index}
          total={steps.length}
          busy={transitioning}
          onNext={next}
          onPrev={prev}
          onSkip={() => end("skip")}
        />
      )}
    </TourContext.Provider>
  );
}
