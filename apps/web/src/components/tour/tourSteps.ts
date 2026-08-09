export const TOUR_SEEN_KEY = "cocktrail_tour_seen_admin";
export const TOUR_RESUME_KEY = "cocktrail_tour_resume";
export const TOUR_RESUME_POST_LINK = "post-link";

/** IDs legacy del tour lineal + cualquier id de helpTours. */
export type TourStepId = string;

export type TourTab =
  | "monitoreo"
  | "pdv"
  | "pagos"
  | "carta"
  | "usuarios"
  | "venta"
  | "historial"
  | "metricas"
  | "sistema"
  | "logs";

export type TourPhase =
  | "inicio"
  | "pagos"
  | "carta"
  | "staff"
  | "cierre"
  | "venta"
  | "gestion"
  | "help";

export const TOUR_PHASES: { id: TourPhase; label: string }[] = [
  { id: "inicio", label: "Inicio" },
  { id: "pagos", label: "Pagos" },
  { id: "carta", label: "Carta" },
  { id: "staff", label: "Staff" },
  { id: "cierre", label: "Listo" },
];

export type TourStepIcon =
  | "sparkles"
  | "mp"
  | "wine"
  | "users"
  | "monitor"
  | "map"
  | "party"
  | "brand";

export type TourStep = {
  id: TourStepId;
  tab: TourTab;
  selector: string | null;
  title: string;
  body: string;
  phase: TourPhase;
  icon: TourStepIcon;
  mpAccent?: boolean;
  position?: "auto" | "top" | "bottom" | "left" | "right";
  onEnter?: "persist-resume-before-oauth";
  animateNav?: TourTab;
  scrollFeel?: boolean;
  /** Alinear scroll al borde inferior (para cards al fondo de Pagos) */
  scrollAlign?: "center" | "end";
  /** Si el user clickea el target, avanzamos solos al paso siguiente */
  advanceOnClick?: boolean;
  /** Si es true, fuerza el scroll al inicio del contenedor */
  scrollTop?: boolean;
};

export type StepConfig = {
  linked: boolean;
  displayName: string | null;
  hasOrphanCaja: boolean;
  resumePostLink: boolean;
};

/** Tour de la categoría Pagos (Help Center) + resume post-OAuth. */
function interp(text: string, displayName: string | null): string {
  const name = displayName?.trim() || "tu cuenta";
  return text.replaceAll("{{displayName}}", name);
}

export function buildPagosSteps(cfg: StepConfig): TourStep[] {
  const name = cfg.displayName;
  const pagosExtras: TourStep[] = [
    {
      id: "pdv-section",
      tab: "pdv",
      selector: '[data-tour="pdv-section"]',
      title: "Puntos de venta",
      body: "Cada barra es un PDV con su QR. Desde acá creás barras, imprimís el QR y vinculás lectores.",
      phase: "pagos",
      icon: "monitor",
      scrollFeel: true,
    },
    ...(cfg.hasOrphanCaja
      ? [
          {
            id: "pdv-orphan",
            tab: "pdv" as const,
            selector: '[data-tour="reprovisionar"]',
            title: "Una barra quedó huérfana",
            body: "Quedó de una cuenta vieja de Mercado Pago. Re-provisionar la pasa a la tuya — el QR cambia, conviene reimprimirlo.",
            phase: "pagos" as const,
            icon: "monitor" as const,
            mpAccent: true,
            scrollFeel: true,
          } satisfies TourStep,
        ]
      : []),
    {
      id: "pdv-posnet",
      tab: "pdv",
      selector: '[data-tour="agregar-posnet"]',
      title: "Agregar un Posnet",
      body: "Elegí un lector Point de tu cuenta y dale a Agregar. Sin Posnet igual cobrás con el QR de la barra.",
      phase: "pagos",
      icon: "monitor",
      mpAccent: true,
      scrollFeel: true,
    },
  ];

  if (cfg.resumePostLink) {
    return [
      {
        id: "mp-congrats",
        tab: "pdv",
        selector: '[data-tour="mp-card"]',
        title: "¡Ya está vinculada!",
        body: interp(
          "Los cobros van a {{displayName}}. Seguimos con los puntos de venta y Posnets.",
          name,
        ),
        phase: "pagos",
        icon: "mp",
        mpAccent: true,
        animateNav: "pdv",
        scrollFeel: true,
        scrollAlign: "end",
      },
      ...pagosExtras,
    ];
  }

  if (!cfg.linked) {
    return [
      {
        id: "mp-unlinked",
        tab: "pdv",
        selector: '[data-tour="vinculame"]',
        title: "Conectá Mercado Pago",
        body: "Bajamos hasta el botón Vincular. Tocá, autorizá en Mercado Pago y volvés solo — el recorrido sigue.",
        phase: "pagos",
        icon: "mp",
        mpAccent: true,
        onEnter: "persist-resume-before-oauth",
        animateNav: "pdv",
        scrollFeel: true,
        scrollAlign: "end",
      },
      ...pagosExtras,
    ];
  }

  return [
    {
      id: "mp-linked",
      tab: "pdv",
      selector: '[data-tour="mp-card"]',
      title: "Mercado Pago conectado",
      body: interp(
        "La cuenta de {{displayName}} ya recibe cobros. Esta tarjeta vive al final de Pagos — desvinculás desde acá si hace falta.",
        name,
      ),
      phase: "pagos",
      icon: "mp",
      mpAccent: true,
      animateNav: "pdv",
      scrollFeel: true,
      scrollAlign: "end",
    },
    ...pagosExtras,
  ];
}
