import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Coffee,
  CreditCard,
  HelpCircle,
  History,
  LayoutDashboard,
  SearchCheck,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";

import type { TourStep } from "@/components/tour/tourSteps";
import { endAuditDemo, startAuditDemo } from "@/lib/auditTourDemo";

export const HELP_GENERAL_SEEN_KEY = "cocktrail_help_general_seen";
export const HELP_DONE_KEY = "cocktrail_help_done";

export type HelpRole = "admin" | "caja";

export type HelpCategoryId =
  | "general"
  | "dashboard"
  | "historial"
  | "auditoria"
  | "carta"
  | "staff"
  | "pagos"
  | "sistema"
  | "venta"
  | "caja-historial"
  | "metricas";

export type HelpCategory = {
  id: HelpCategoryId;
  title: string;
  description: string;
  tips?: string[];
  icon: LucideIcon;
  /** Si true, los pasos se cargan async (Pagos / MP). */
  dynamicSteps?: boolean;
  steps: TourStep[];
  /** Corre antes de arrancar el tour. Devuelve data que se pasa a onEnd. */
  onStart?: () => Promise<unknown>;
  /** Corre al terminar el tour (done o skip). Recibe lo que devolvió onStart. */
  onEnd?: (ctx: unknown) => Promise<void>;
};

function step(
  partial: Omit<TourStep, "phase" | "icon"> & Partial<Pick<TourStep, "phase" | "icon">>,
): TourStep {
  return {
    phase: "help",
    icon: "map",
    ...partial,
  };
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
}

/** True si ya vio first-visit o el tour viejo (no re-mostrar panel). */
export function hasSeenHelpGeneral(): boolean {
  try {
    if (localStorage.getItem(HELP_GENERAL_SEEN_KEY)) return true;
    // Migración suave: quien ya hizo el tour lineal no ve first-visit de nuevo.
    if (localStorage.getItem("cocktrail_tour_seen_admin")) return true;
    if (localStorage.getItem("cocktrail_tour_seen_caja")) return true;
  } catch {
    /* private mode */
  }
  return false;
}

export function markHelpGeneralSeen(): void {
  try {
    localStorage.setItem(HELP_GENERAL_SEEN_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function readCompletedCategories(): HelpCategoryId[] {
  try {
    const raw = localStorage.getItem(HELP_DONE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is HelpCategoryId => typeof x === "string");
  } catch {
    return [];
  }
}

export function markCategoryDone(id: HelpCategoryId): HelpCategoryId[] {
  const next = [...new Set([...readCompletedCategories(), id])];
  try {
    localStorage.setItem(HELP_DONE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export type AdminNightConfig = {
  hasActiveNight: boolean;
};

/** Onboarding topbar: corto — install → nav → noche (1 paso) → MP. */
function adminGeneralSteps(cfg: AdminNightConfig): TourStep[] {
  const steps: TourStep[] = [];

  if (!isStandalone()) {
    steps.push(
      step({
        id: "general-install",
        tab: "sistema",
        selector: '[data-tour="pwa-install"]',
        title: "Instalá la app de caja",
        body: "En la tablet, descargá miBoliche Caja para poder imprimir tickets.",
        icon: "monitor",
        animateNav: "sistema",
        scrollFeel: false,
      }),
    );
  }

  steps.push(
    step({
      id: "general-welcome",
      tab: "monitoreo",
      selector: null,
      title: "¡Bienvenido a Mi Boliche!",
      body: "Un recorrido corto: menú, noches y Mercado Pago. Cada sección tiene su propio ? si querés más detalle.",
      icon: "brand",
      animateNav: "monitoreo",
    }),
    step({
      id: "general-nav",
      tab: "monitoreo",
      selector: '[data-tour="sidebar"]',
      title: "Navegación",
      body: "Dashboard, Historial, Auditoría, Pagos, Carta y Staff. Colapsá el menú con la flecha.",
      icon: "map",
      scrollFeel: false,
    }),
    step({
      id: "general-night",
      tab: "monitoreo",
      selector: '[data-tour="night-card"]',
      title: cfg.hasActiveNight ? "Noche en curso" : "Abrir y cerrar noches",
      body: cfg.hasActiveNight
        ? "Desde acá cerrás la noche al terminar. Si es de prueba, al cerrar se borra todo."
        : "Desde acá abrís la noche (palabra clave y, si querés, modo prueba) y la cerrás al terminar.",
      icon: "map",
      scrollFeel: false,
    }),
    step({
      id: "general-pagos",
      tab: "pdv",
      selector: '[data-tour="mp-card"]',
      title: "Vinculá Mercado Pago",
      body: "Sin esto no cobrás con QR ni Posnet. Tocá Vincular y autorizá — el ? de Pagos tiene el detalle.",
      icon: "mp",
      mpAccent: true,
      animateNav: "pdv",
      scrollAlign: "end",
    }),
    step({
      id: "general-done",
      tab: "monitoreo",
      selector: null,
      title: "¡Listo!",
      body: "El ? de arriba repite esta ayuda. En cada sección hay otro ? para un tour corto.",
      icon: "party",
      animateNav: "monitoreo",
    }),
  );

  return steps;
}

const ADMIN_CATEGORIES: HelpCategory[] = [
  {
    id: "general",
    title: "Ayuda General",
    description: "Onboarding: app de caja, navegación y Mercado Pago.",
    tips: ["Cada sección tiene su propio ? para un tour corto."],
    icon: HelpCircle,
    steps: [], // filled at runtime via getCategories
  },
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Estado de la noche, métricas y desglose de pagos.",
    icon: LayoutDashboard,
    steps: [
      step({
        id: "dash-header",
        tab: "monitoreo",
        selector: '[data-tour="night-status"]',
        title: "Panel de monitoreo",
        body: "Acá ves el resumen de tu negocio. Si hay una noche abierta, los datos se actualizan solos en tiempo real. Si no, ves el resumen de la última noche registrada.",
        icon: "sparkles",
      }),
      step({
        id: "dash-sanidad",
        tab: "monitoreo",
        selector: '[data-tour="sistema-sanidad"]',
        title: "Sanidad del sistema",
        body: "Te avisa si algo necesita atención: Mercado Pago sin vincular, cambios en la base de datos, o migraciones pendientes. Si está todo verde, no hace falta hacer nada.",
        icon: "monitor",
      }),
      step({
        id: "dash-metrics",
        tab: "monitoreo",
        selector: '[data-tour="dashboard-metrics"]',
        title: "Métricas principales",
        body: "Ingreso neto (facturación menos comisiones de MP), tickets totales, y unidades vendidas. Cada tarjeta compara contra la última noche cuando hay historial.",
        icon: "sparkles",
      }),
      step({
        id: "dash-hourly",
        tab: "monitoreo",
        selector: '[data-tour="hourly-chart"]',
        title: "Ventas por hora",
        body: "Gráfico de barras con la recaudación hora por hora. La barra más alta es la hora pico. Pasá el mouse sobre cada barra para ver el monto exacto.",
        icon: "map",
      }),
      step({
        id: "dash-products",
        tab: "monitoreo",
        selector: '[data-tour="top-products"]',
        title: "Productos más vendidos",
        body: "Top 5 de tragos por recaudación bruta. Te muestra cuántas unidades de cada uno se vendieron y el subtotal.",
        icon: "wine",
      }),
      step({
        id: "dash-donut",
        tab: "monitoreo",
        selector: '[data-tour="payment-donut"]',
        title: "Desglose de pagos",
        body: "Distribución por método de pago: efectivo, QR, débito, crédito. Cada porción muestra el porcentaje y el monto.",
        icon: "mp",
      }),
      step({
        id: "dash-peak",
        tab: "monitoreo",
        selector: '[data-tour="peak-hour"]',
        title: "Hora pico",
        body: "La hora de mayor recaudación de la noche. Cuando la noche está abierta, muestra el badge \"En vivo\" y se actualiza automáticamente.",
        icon: "sparkles",
      }),
      step({
        id: "dash-footer",
        tab: "monitoreo",
        selector: '[data-tour="dashboard-footer"]',
        title: "Actualización en vivo",
        body: "El punto verde significa que el monitoreo está activo y los datos llegan en tiempo real por SSE. Si se corta la conexión, se reintenta automáticamente.",
        icon: "monitor",
      }),
    ],
  },
  {
    id: "historial",
    title: "Historial de Noches",
    description: "Noches cerradas, analíticas y borrado.",
    icon: History,
    steps: [
      step({
        id: "hist-header",
        tab: "historial",
        selector: '[data-tour="historial-header"]',
        title: "Archivo de noches",
        body: "Cada noche cerrada se guarda acá con sus totales, pedidos y ventas. Si necesitás un informe, el botón Exportar PDF genera un resumen completo de todo el historial.",
        icon: "map",
        animateNav: "historial",
      }),
      step({
        id: "hist-metrics",
        tab: "historial",
        selector: '[data-tour="historial-metrics"]',
        title: "Métricas de período",
        body: "Tres tarjetas para medir el negocio: lo facturado esta semana, este mes, y el total histórico acumulado. Cada una compara contra el período anterior.",
        icon: "sparkles",
      }),
      step({
        id: "hist-list",
        tab: "historial",
        selector: '[data-tour="night-records"]',
        title: "Registro de noches",
        body: "Cada tarjeta resume una noche: fecha, duración, facturación, tickets, unidades y métodos de pago. Bajá para recorrerlas todas — las más recientes están arriba.",
        icon: "map",
      }),
      step({
        id: "hist-compare",
        tab: "historial",
        selector: '[data-tour="night-comparator"]',
        title: "Comparativa entre noches",
        body: "Seleccioná una noche para ver su detalle completo. Elegí una segunda noche para compararlas lado a lado: ingreso, tickets, top trago, duración, y más.",
        icon: "monitor",
        scrollFeel: true,
      }),
      step({
        id: "hist-delete",
        tab: "historial",
        selector: '[data-tour="delete-night"]',
        title: "Eliminar noche",
        body: "Si registraste una noche por error o de prueba, la podés borrar. El sistema te pide confirmación y te avisa que no se puede deshacer.",
        icon: "monitor",
        scrollFeel: true,
      }),
    ],
  },
  {
    id: "auditoria",
    title: "Auditoría de Tickets",
    description: "Buscá tickets, filtrá y revisá el detalle.",
    tips: ["El tour carga tickets de ejemplo en pantalla; no hace falta abrir una noche."],
    icon: SearchCheck,
    onStart: auditoriaOnStart,
    onEnd: auditoriaOnEnd,
    steps: [
      step({
        id: "audit-demo",
        tab: "logs",
        selector: '[data-tour="audit-header"]',
        title: "Demo con tickets de ejemplo",
        body: "Cargamos tickets ficticios para que pruebes la sección sin abrir noche. No son reales: al terminar el tour (o con \"Salir del demo\") vuelven los datos de verdad.",
        icon: "map",
        animateNav: "logs",
      }),
      step({
        id: "audit-nav",
        tab: "logs",
        selector: '[data-tour="audit-nav"]',
        title: "Navegar por fecha",
        body: "Los tickets se agrupan por mes y día. El demo trae dos días: cambiá de día en la fila de abajo para ver cómo se filtra la tabla.",
        icon: "map",
      }),
      step({
        id: "audit-filters",
        tab: "logs",
        selector: '[data-tour="audit-filter-cancelados"]',
        title: "Filtrá cancelados",
        body: "Tocá Cancelados (o Continuá) para ver solo los anulados.",
        icon: "map",
        advanceOnClick: true,
      }),
      step({
        id: "audit-filters-all",
        tab: "logs",
        selector: '[data-tour="audit-filter-todos"]',
        title: "Volvé a Todos",
        body: "Tocá Todos (o Continuá) para ver de nuevo la lista completa del día.",
        icon: "map",
        advanceOnClick: true,
      }),
      step({
        id: "audit-search",
        tab: "logs",
        selector: '[data-tour="audit-search"]',
        title: "Buscador",
        body: "Escribí número de ticket, trago, creador o token. El embudo al lado abre filtros por columna (método, monto, etc.).",
        icon: "map",
      }),
      step({
        id: "audit-table",
        tab: "logs",
        selector: '[data-tour="logs-table"]',
        title: "Tabla de tickets",
        body: "Cada fila es un ticket: items, operador, método, total y estado. Ordená clickeando el encabezado. En un ticket real, Cancelar anula el cobro; acá en demo solo actualiza la fila de ejemplo.",
        icon: "monitor",
      }),
      step({
        id: "audit-pagination",
        tab: "logs",
        selector: '[data-tour="audit-pagination"]',
        title: "Paginación",
        body: "Con más de 10 tickets en el día, se pagina de a 10. Usá las flechas o los números para pasar de página.",
        icon: "map",
      }),
    ],
  },
  {
    id: "carta",
    title: "Carta",
    description: "Productos, categorías y columnas de la grilla.",
    tips: ["Podés desactivar un trago sin borrarlo."],
    icon: Coffee,
    steps: [
      step({
        id: "carta-header",
        tab: "carta",
        selector: '[data-tour="carta-header"]',
        title: "Gestión de la carta",
        body: "Acá administrás todos los tragos de tu barra. El contador te dice cuántos hay visibles del total registrado.",
        icon: "wine",
        animateNav: "carta",
      }),
      step({
        id: "carta-toolbar",
        tab: "carta",
        selector: '[data-tour="carta-toolbar"]',
        title: "Barra de herramientas",
        body: "Filtrá entre Todos, En carta y Ocultos. El embudo abre filtros por columna (nombre, precio, etiquetas). El buscador encuentra por nombre. A la derecha, botones para crear tragos y administrar categorías.",
        icon: "map",
      }),
      step({
        id: "carta-table",
        tab: "carta",
        selector: '[data-tour="carta-table"]',
        title: "Tabla de tragos",
        body: "Cada fila muestra un trago con su ícono, nombre, categoría y precio. Click en una fila para editarlo. El ojo activa/desactiva el trago sin borrarlo. El tacho lo elimina con opción de deshacer.",
        icon: "wine",
      }),
      step({
        id: "carta-new",
        tab: "carta",
        selector: '[data-tour="nuevo-trago"]',
        title: "Agregar trago",
        body: "Tocá Nuevo trago para abrir el formulario a la derecha. Completá nombre y precio como mínimo. La categoría es opcional.",
        icon: "wine",
        advanceOnClick: true,
      }),
      step({
        id: "carta-form",
        tab: "carta",
        selector: '[data-tour="drink-form"]',
        title: "Formulario del trago",
        body: "Nombre, precio, descripción, categoría e ícono. También podés marcarlo como promoción o trending. Guardar crea el trago; la X cierra sin cambios.",
        icon: "wine",
        scrollFeel: true,
      }),
      step({
        id: "carta-cats",
        tab: "carta",
        selector: '[data-tour="carta-categories"]',
        title: "Categorías",
        body: "Tocá Categorías para abrir el editor. Ahí vas a poder crear, reordenar y eliminar las categorías que agrupan los tragos en la caja.",
        icon: "wine",
      }),
      step({
        id: "carta-cats-modal",
        tab: "carta",
        selector: '[data-tour="carta-categories-modal"]',
        title: "Editor de categorías",
        body: "Cada categoría es una celda con su número de orden. Arrastrá la celda por el ícono de la derecha para reordenar: 1 = primero en la grilla de la caja. Pasá el mouse sobre una celda para ver el tacho de eliminar. Creá nuevas con el campo de abajo.",
        icon: "wine",
        scrollFeel: true,
      }),
    ],
  },
  {
    id: "staff",
    title: "Gestión de Staff",
    description: "Usuarios, roles y permisos.",
    icon: Users,
    steps: [
      step({
        id: "staff-table",
        tab: "usuarios",
        selector: '[data-tour="staff-table"]',
        title: "Tabla de usuarios",
        body: "Quién puede entrar y con qué rol.",
        icon: "users",
        animateNav: "usuarios",
      }),
      step({
        id: "staff-new",
        tab: "usuarios",
        selector: '[data-tour="nuevo-usuario"]',
        title: "Agregar usuario",
        body: "Tocá Nuevo usuario — te seguimos en el formulario.",
        icon: "users",
        advanceOnClick: true,
      }),
      step({
        id: "staff-edit",
        tab: "usuarios",
        selector: '[data-tour="user-form"]',
        title: "Editar usuario",
        body: "Usuario, clave y rol. Crear guarda; la X cierra sin cambios.",
        icon: "users",
      }),
    ],
  },
  {
    id: "pagos",
    title: "Pagos",
    description: "Mercado Pago, sucursal, PDVs, Posnets y sesiones.",
    tips: ["Si vinculás MP, el recorrido retoma solo al volver."],
    icon: CreditCard,
    steps: [
      step({
        id: "pagos-header",
        tab: "pagos",
        selector: '[data-tour="pagos-header"]',
        title: "Configuración de pagos",
        body: "Acá manejás todo lo relacionado a cobros: vinculás Mercado Pago, administrás los puntos de venta (PDVs), configurás Posnets, y ves quién está conectado en caja.",
        icon: "mp",
        mpAccent: true,
        animateNav: "pagos",
      }),
      step({
        id: "pagos-mp",
        tab: "pagos",
        selector: '[data-tour="mp-card"]',
        title: "Cuenta de Mercado Pago",
        body: "Si no está vinculada, el botón Vincular te redirige a MP para autorizar. Si ya está vinculada, ves el nombre de la cuenta y podés desvincularla. El ícono ? al lado del título abre los plazos y comisiones.",
        icon: "mp",
        mpAccent: true,
        scrollAlign: "end",
      }),
      step({
        id: "pagos-health",
        tab: "pagos",
        selector: '[data-tour="pagos-salud"]',
        title: "Diagnóstico de MP",
        body: "Panel compacto que muestra el estado de la conexión con Mercado Pago: APIs disponibles, última verificación, y posibles fallos. Ideal para diagnosticar si algo no funciona.",
        icon: "monitor",
      }),
      step({
        id: "pagos-sucursal",
        tab: "pagos",
        selector: '[data-tour="pagos-sucursal"]',
        title: "Sucursal y sesiones",
        body: "Info de tu sucursal en MP: nombre, cantidad de barras (QRs) y Posnets. Podés renombrar la sucursal para que aparezca en los comprobantes. Abajo ves quién está conectado en caja y podés cerrar sesiones remotamente.",
        icon: "monitor",
        scrollFeel: true,
      }),
      step({
        id: "pagos-pdv",
        tab: "pdv",
        selector: '[data-tour="pdv-section"]',
        title: "Puntos de venta",
        body: "Cada barra es un PDV con su QR. Desde acá creás barras, imprimís el QR y vinculás lectores.",
        icon: "monitor",
        scrollFeel: true,
      }),
      step({
        id: "pagos-posnet",
        tab: "pdv",
        selector: '[data-tour="agregar-posnet"]',
        title: "Agregar un Posnet",
        body: "Elegí un lector Point de tu cuenta y dale a Agregar. Sin Posnet igual cobrás con el QR de la barra.",
        icon: "monitor",
        mpAccent: true,
        scrollFeel: true,
      }),
    ],
  },
  {
    id: "sistema",
    title: "Sistema",
    description: "App de caja para la tablet e impresión.",
    icon: Settings,
    steps: [
      step({
        id: "sys-section",
        tab: "sistema",
        selector: '[data-tour="sistema-section"]',
        title: "Sección Sistema",
        body: "Acá está la app de caja y la guía de instalación.",
        icon: "monitor",
        animateNav: "sistema",
      }),
      step({
        id: "sys-install",
        tab: "sistema",
        selector: '[data-tour="pwa-install"]',
        title: "Instalar la app",
        body: "Descargá el APK, instalalo en la tablet y conectá la impresora.",
        icon: "monitor",
      }),
    ],
  },
];

/** Onboarding topbar caja: apk -> bienvenida -> plegar menú -> buscar -> tendencias -> agregar -> carrito -> cobrar -> dispositivos -> historial -> métricas -> cierre -> done. */
function cajaGeneralSteps(cfg: {
  hasHistorial: boolean;
  hasMetricas: boolean;
  canCloseNight: boolean;
  hasLinkedDevice: boolean | null;
}): TourStep[] {
  const steps: TourStep[] = [];

  if (!isStandalone()) {
    steps.push(
      step({
        id: "caja-install",
        tab: "venta",
        selector: null,
        title: "Usá la app de caja",
        body: "Para imprimir tickets necesitás miBoliche Caja en la tablet. Pedile al administrador el APK desde la sección de Sistema.",
        icon: "monitor",
      }),
    );
  }

  steps.push(
    step({
      id: "caja-welcome",
      tab: "venta",
      selector: null,
      title: "¡Bienvenido a la caja!",
      body: "En este tour completo te enseñaremos a operar la caja: registrar pedidos, cobros, y consultar el historial y métricas.",
      icon: "brand",
    }),
    step({
      id: "caja-sidebar-fold",
      tab: "venta",
      selector: '[data-tour-nav="collapse"]',
      title: "Menú y Visualización",
      body: "Haciendo clic acá podés plegar o desplegar el menú lateral. Usalo cuando necesites cartas más grandes, mayor visibilidad de tus productos o más espacio de trabajo en la tablet.",
      icon: "map",
      scrollTop: true,
      advanceOnClick: true,
    }),
    step({
      id: "caja-productos",
      tab: "venta",
      selector: '[data-tour="caja-productos"]',
      title: "Buscá y filtrá productos",
      body: "En esta grilla tenés todos los productos de la carta. Podés usar el buscador para encontrar un trago por su nombre o ordenar la carta por categoría, orden alfabético o precio.",
      icon: "wine",
    }),
    step({
      id: "caja-tendencias",
      tab: "venta",
      selector: '[data-tour="tendencias-dinamicas"]',
      title: "Tendencias Dinámicas",
      body: "¡Ordená tus productos según los más vendidos en vivo! Al activar esta función, la carta se reordena automáticamente mostrando arriba los tragos con más salida de la noche.",
      icon: "sparkles",
    }),
    step({
      id: "caja-agregar-item",
      tab: "venta",
      selector: '[data-tour="primer-producto"]',
      title: "Agregá un producto",
      body: "Hacé clic en el producto para sumarlo a la venta. Si tocás 'Continuar', agregaremos uno automáticamente por vos.",
      icon: "wine",
      advanceOnClick: true,
    }),
    step({
      id: "caja-carrito",
      tab: "venta",
      selector: '[data-tour="caja-carrito"]',
      title: "Revisá y editá el pedido",
      body: "Acá ves los productos agregados. Podés ajustar las cantidades con los botones + y - de cada ítem, o vaciar el pedido completo con el botón 'Vaciar' si querés empezar de nuevo.",
      icon: "wine",
    }),
    step({
      id: "caja-cobrar-btn",
      tab: "venta",
      selector: '[data-tour="caja-cobrar"]',
      title: "Cobrá la venta",
      body: "Una vez que el pedido esté listo, tocá 'Cobrar' para seleccionar el medio de pago (Efectivo, Tarjeta o QR) y concretar la transacción.",
      icon: "monitor",
    }),
    step({
      id: "caja-dispositivos",
      tab: "venta",
      selector: '[data-tour="caja-dispositivos"]',
      title: "Impresora y medios de cobro",
      body:
        cfg.hasLinkedDevice === false
          ? "Desde acá vinculás o probás la impresora. Esta caja no tiene Posnet asociado, pero igualmente podés cobrar en efectivo o con QR dinámico."
          : "Desde acá vinculás o probás la impresora y controlás el estado del Posnet. Si algo figura desconectado, revisalo antes de empezar a cobrar.",
      icon: "monitor",
    }),
  );

  if (cfg.hasHistorial) {
    steps.push(
      step({
        id: "caja-historial-nav",
        tab: "historial",
        selector: '[data-tour="order-list"]',
        title: "Historial de Ventas",
        body: "¡Viajemos al Historial! En esta sección se listan todos los tickets emitidos durante la noche. Podés reimprimir un ticket si la impresora falló o, si tenés los permisos necesarios, cancelar una venta.",
        icon: "map",
        animateNav: "historial",
      }),
    );
  }

  if (cfg.hasMetricas) {
    steps.push(
      step({
        id: "caja-metricas-nav",
        tab: "metricas",
        selector: '[data-tour="metrics-totals"]',
        title: "Métricas de la noche",
        body: "¡Mirá el rendimiento en vivo! En la sección de Métricas podés consultar la facturación neta, la cantidad de tickets cobrados y el gráfico de ventas por hora.",
        icon: "sparkles",
        animateNav: "metricas",
      }),
    );
  }

  if (cfg.canCloseNight) {
    steps.push(
      step({
        id: "caja-cierre-nav",
        tab: "venta",
        selector: '[data-tour="caja-cerrar"]',
        title: "Cerrar noche",
        body: "Al finalizar el evento, usá este botón para cerrar la noche y consolidar la caja. Usalo solo cuando no queden más ventas por hacer.",
        icon: "monitor",
        animateNav: "venta",
      }),
    );
  }

  steps.push(
    step({
      id: "caja-done",
      tab: "venta",
      selector: null,
      title: "¡Todo listo!",
      body: "Ya completaste el recorrido por el flujo de la caja. Si necesitás volver a ver esta guía en el futuro, solo tocá el signo ? en la barra superior.",
      icon: "party",
      animateNav: "venta",
    }),
  );

  return steps;
}

export type CajaHelpConfig = {
  hasHistorial: boolean;
  hasMetricas: boolean;
  canCloseNight: boolean;
  hasLinkedDevice: boolean | null;
};

export function getCategories(
  role: HelpRole,
  cajaCfg?: CajaHelpConfig,
  adminNightCfg?: AdminNightConfig,
): HelpCategory[] {
  if (role === "admin") {
    const cfg = adminNightCfg ?? { hasActiveNight: false };
    return ADMIN_CATEGORIES.map((c) =>
      c.id === "general" ? { ...c, steps: adminGeneralSteps(cfg) } : c,
    );
  }

  const cfg = cajaCfg ?? {
    hasHistorial: true,
    hasMetricas: true,
    canCloseNight: false,
    hasLinkedDevice: null,
  };

  const cats: HelpCategory[] = [
    {
      id: "general",
      title: "Ayuda General",
      description: "Cómo vender, cobrar y consultar la noche desde la caja.",
      tips: ["La impresora se vincula desde el menú lateral."],
      icon: HelpCircle,
      steps: cajaGeneralSteps(cfg),
    },
    {
      id: "venta",
      title: "Nueva Venta",
      description: "Grilla, carrito y cobro.",
      icon: ShoppingCart,
      steps: [
        step({
          id: "venta-grid",
          tab: "venta",
          selector: '[data-tour="caja-productos"]',
          title: "Grilla de productos",
          body: "Tocá un producto para sumarlo al pedido.",
          icon: "wine",
          scrollFeel: false,
        }),
        step({
          id: "venta-cart",
          tab: "venta",
          selector: '[data-tour="caja-carrito"]',
          title: "Carrito lateral",
          body: "Cantidades, total y vaciar pedido.",
          icon: "wine",
          scrollFeel: false,
        }),
        step({
          id: "venta-checkout",
          tab: "venta",
          selector: '[data-tour="caja-cobrar"]',
          title: "Checkout y cobro",
          body: "Elegí Efectivo, Tarjeta o QR. La pantalla te guía hasta imprimir.",
          icon: "monitor",
          scrollFeel: false,
        }),
        step({
          id: "venta-devices",
          tab: "venta",
          selector: '[data-tour="caja-dispositivos"]',
          title: "Impresora y cobros",
          body:
            cfg.hasLinkedDevice === false
              ? "Vinculá o probá la impresora. Esta caja no tiene Posnet; cobrá en efectivo o QR."
              : "Estado de impresora y Posnet. Revisalo antes de empezar a cobrar.",
          icon: "monitor",
          scrollFeel: false,
        }),
      ],
    },
  ];

  if (cfg.hasHistorial) {
    cats.push({
      id: "caja-historial",
      title: "Historial de Ventas",
      description: "Tickets de la noche, reimpresión y cancelación.",
      icon: History,
      steps: [
        step({
          id: "caja-hist-orders",
          tab: "historial",
          selector: '[data-tour="order-list"]',
          title: "Órdenes de la noche",
          body: "Lista de ventas con búsqueda y acciones.",
          icon: "map",
          animateNav: "historial",
          scrollFeel: false,
        }),
        step({
          id: "caja-hist-print",
          tab: "historial",
          selector: '[data-tour="order-print"]',
          title: "Reimprimir ticket",
          body: "Desde acá reimprimís un ticket si la impresora falló.",
          icon: "monitor",
          scrollFeel: false,
        }),
      ],
    });
  }

  if (cfg.hasMetricas) {
    cats.push({
      id: "metricas",
      title: "Métricas",
      description: "Totales y desglose de la noche en vivo.",
      icon: BarChart3,
      steps: [
        step({
          id: "metr-totals",
          tab: "metricas",
          selector: '[data-tour="metrics-totals"]',
          title: "Totales de la noche",
          body: "Facturación, tickets y unidades.",
          icon: "sparkles",
          animateNav: "metricas",
          scrollFeel: false,
        }),
        step({
          id: "metr-payments",
          tab: "metricas",
          selector: '[data-tour="metrics-payments"]',
          title: "Facturación por hora",
          body: "Cómo se repartieron las ventas a lo largo de la noche.",
          icon: "sparkles",
          scrollFeel: false,
        }),
      ],
    });
  }

  if (cfg.canCloseNight) {
    // Tip in venta tour already covers devices; close night stays in general via sidebar tour optionally
    const venta = cats.find((c) => c.id === "venta");
    venta?.steps.push(
      step({
        id: "venta-close",
        tab: "venta",
        selector: '[data-tour="caja-cerrar"]',
        title: "Cerrar noche",
        body: "Al terminar, Cerrar noche pide confirmación. Usalo solo cuando no queden ventas.",
        icon: "monitor",
        scrollFeel: false,
      }),
    );
  }

  return cats;
}

/** Inyecta tickets hardcodeados en Auditoría (sin API / sin noche). */
async function auditoriaOnStart(): Promise<{ demo: true }> {
  startAuditDemo();
  // Dejar que LogsSection pinte la tabla antes del primer spotlight.
  await new Promise((r) => window.setTimeout(r, 120));
  return { demo: true };
}

/** Saca el demo al terminar el tour. */
async function auditoriaOnEnd(_ctx: unknown): Promise<void> {
  endAuditDemo();
}
