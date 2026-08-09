export const TOUR_SEEN_KEY = "cocktrail_tour_seen_admin";
export const TOUR_RESUME_KEY = "cocktrail_tour_resume";
export const TOUR_RESUME_POST_LINK = "post-link";

export type TourStepId =
  | "welcome"
  | "nav-overview"
  | "mp-unlinked"
  | "mp-linked"
  | "mp-congrats"
  | "pdv-section"
  | "pdv-orphan"
  | "pdv-posnet"
  | "carta-intro"
  | "carta-nuevo"
  | "carta-form"
  | "staff-intro"
  | "staff-nuevo"
  | "staff-form"
  | "done";

export type TourTab = "monitoreo" | "pdv" | "carta" | "usuarios";

export type TourPhase = "inicio" | "pagos" | "carta" | "staff" | "cierre";

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
};

export type StepConfig = {
  linked: boolean;
  displayName: string | null;
  hasOrphanCaja: boolean;
  resumePostLink: boolean;
};

function interp(text: string, displayName: string | null): string {
  const name = displayName?.trim() || "tu cuenta";
  return text.replaceAll("{{displayName}}", name);
}

export function buildSteps(cfg: StepConfig): TourStep[] {
  const name = cfg.displayName;

  const navOverview: TourStep = {
    id: "nav-overview",
    tab: "monitoreo",
    selector: '[data-tour="sidebar"]',
    title: "Todo el panel, a un click",
    body: "Acá está el menú: Dashboard, Historial, Auditoría, y en Configuración — Pagos, Carta y Staff. Ahora vamos a Pagos.",
    phase: "inicio",
    icon: "map",
  };

  const pdvSection: TourStep = {
    id: "pdv-section",
    tab: "pdv",
    selector: '[data-tour="pdv-section"]',
    title: "Puntos de venta",
    body: "Cada barra es un PDV con su QR. Desde acá creás barras, imprimís el QR y vinculás lectores.",
    phase: "pagos",
    icon: "monitor",
    scrollFeel: true,
  };

  const orphan: TourStep = {
    id: "pdv-orphan",
    tab: "pdv",
    selector: '[data-tour="reprovisionar"]',
    title: "Una barra quedó huérfana",
    body: "Quedó de una cuenta vieja de Mercado Pago. Re-provisionar la pasa a la tuya — el QR cambia, conviene reimprimirlo.",
    phase: "pagos",
    icon: "monitor",
    mpAccent: true,
    scrollFeel: true,
  };

  const posnet: TourStep = {
    id: "pdv-posnet",
    tab: "pdv",
    selector: '[data-tour="agregar-posnet"]',
    title: "Agregar un Posnet",
    body: "Elegí un lector Point de tu cuenta y dale a Agregar. Sin Posnet igual cobrás con el QR de la barra.",
    phase: "pagos",
    icon: "monitor",
    mpAccent: true,
    scrollFeel: true,
  };

  const cartaIntro: TourStep = {
    id: "carta-intro",
    tab: "carta",
    selector: '[data-tour="carta-toolbar"]',
    title: "La carta del boliche",
    body: "Filtros, columnas y categorías viven acá arriba. Abajo está la lista de tragos. Vamos a ver cómo se carga uno.",
    phase: "carta",
    icon: "wine",
    animateNav: "carta",
    scrollFeel: true,
  };

  const cartaNuevo: TourStep = {
    id: "carta-nuevo",
    tab: "carta",
    selector: '[data-tour="nuevo-trago"]',
    title: "Nuevo trago",
    body: "Tocá Nuevo trago — se abre el formulario a la derecha y te seguimos ahí. No hace falta guardarlo si solo estás mirando.",
    phase: "carta",
    icon: "wine",
    scrollFeel: true,
    advanceOnClick: true,
  };

  const cartaForm: TourStep = {
    id: "carta-form",
    tab: "carta",
    selector: '[data-tour="drink-form"]',
    title: "Nombre, precio y categoría",
    body: "Completá nombre y precio, elegí categoría e ícono si querés. Cuando termines podés Crear o cerrar con la X — seguimos igual.",
    phase: "carta",
    icon: "wine",
    scrollFeel: true,
  };

  const staffIntro: TourStep = {
    id: "staff-intro",
    tab: "usuarios",
    selector: '[data-tour="staff-table"]',
    title: "Gestión de staff",
    body: "Acá ves quién puede entrar al sistema. Admins ven todo; cajeros solo la caja de ventas.",
    phase: "staff",
    icon: "users",
    animateNav: "usuarios",
    scrollFeel: true,
  };

  const staffNuevo: TourStep = {
    id: "staff-nuevo",
    tab: "usuarios",
    selector: '[data-tour="nuevo-usuario"]',
    title: "Sumá a alguien",
    body: "Tocá Nuevo usuario — se abre el formulario y te contamos qué poner en cada campo.",
    phase: "staff",
    icon: "users",
    scrollFeel: true,
    advanceOnClick: true,
  };

  const staffForm: TourStep = {
    id: "staff-form",
    tab: "usuarios",
    selector: '[data-tour="user-form"]',
    title: "Usuario, clave y rol",
    body: "Usuario + contraseña, y el rol (Administrador o Cajero). Crear guarda; la X cierra sin cambios.",
    phase: "staff",
    icon: "users",
    scrollFeel: true,
  };

  const done: TourStep = {
    id: "done",
    tab: "monitoreo",
    selector: null,
    title: "¡Mi Boliche listo!",
    body: "Ya conocés el panel, Pagos, la carta y el staff. El ? de arriba repite este recorrido cuando quieras.",
    phase: "cierre",
    icon: "party",
    animateNav: "monitoreo",
  };

  const pagosExtras = [
    pdvSection,
    ...(cfg.hasOrphanCaja ? [orphan] : []),
    posnet,
  ];

  const afterPagos = [cartaIntro, cartaNuevo, cartaForm, staffIntro, staffNuevo, staffForm, done];

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
      ...afterPagos,
    ];
  }

  const head: TourStep[] = [
    {
      id: "welcome",
      tab: "monitoreo",
      selector: null,
      title: "Bienvenido a Mi Boliche",
      body: "Te mostramos el panel y te dejamos listo: Mercado Pago, carta y staff. Empezamos por el menú.",
      phase: "inicio",
      icon: "brand",
    },
    navOverview,
  ];

  if (!cfg.linked) {
    return [
      ...head,
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
      // Sin vincular, igual mostramos PDV/carta/staff para que conozca el panel
      ...pagosExtras,
      ...afterPagos,
    ];
  }

  return [
    ...head,
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
    ...afterPagos,
  ];
}
