import type { TourPhase, TourStep } from "./tourSteps";

export const CAJA_TOUR_SEEN_KEY = "cocktrail_tour_seen_caja";

export const CAJA_TOUR_PHASES: { id: TourPhase; label: string }[] = [
  { id: "inicio", label: "Inicio" },
  { id: "venta", label: "Venta" },
  { id: "gestion", label: "Control" },
  { id: "cierre", label: "Listo" },
];

type CajaTourConfig = {
  hasHistorial: boolean;
  hasMetricas: boolean;
  canCloseNight: boolean;
  hasLinkedDevice: boolean | null;
};

export function buildCajaSteps(cfg: CajaTourConfig): TourStep[] {
  const steps: TourStep[] = [
    {
      id: "caja-welcome",
      tab: "venta",
      selector: null,
      title: "Tu caja, paso a paso",
      body: "En un minuto vas a ver cómo armar un pedido, cobrarlo y consultar lo que pasó durante la noche.",
      phase: "inicio",
      icon: "brand",
    },
    {
      id: "caja-menu",
      tab: "venta",
      selector: '[data-tour="caja-sidebar"]',
      title: "Todo está en este menú",
      body: "Nueva Venta es tu pantalla de trabajo. Según tus permisos, también podés consultar el Historial y las Métricas. En celular, abrí el menú desde arriba.",
      phase: "inicio",
      icon: "map",
    },
    {
      id: "caja-productos",
      tab: "venta",
      selector: '[data-tour="caja-productos"]',
      title: "Buscá y agregá productos",
      body: "Tocá un producto para sumarlo al pedido. Podés buscar por nombre y ordenar la carta por categoría, alfabeto o precio.",
      phase: "venta",
      icon: "wine",
      scrollFeel: false,
    },
    {
      id: "caja-carrito",
      tab: "venta",
      selector: '[data-tour="caja-carrito"]',
      title: "Revisá el pedido",
      body: "Acá ves cantidades y total. Podés sumar, quitar o vaciar productos antes de cobrar. En celular, el resumen aparece abajo.",
      phase: "venta",
      icon: "wine",
      scrollFeel: false,
    },
    {
      id: "caja-cobro",
      tab: "venta",
      selector: '[data-tour="caja-cobrar"]',
      title: "Cobrá cuando esté listo",
      body: "El botón se habilita cuando hay productos. Después elegís Efectivo, Tarjeta o QR y la pantalla te guía hasta confirmar e imprimir el ticket.",
      phase: "venta",
      icon: "monitor",
      scrollFeel: false,
    },
    {
      id: "caja-dispositivos",
      tab: "venta",
      selector: '[data-tour="caja-dispositivos"]',
      title: "Impresora y medios de cobro",
      body:
        cfg.hasLinkedDevice === false
          ? "Desde acá vinculás o probás la impresora. Esta caja no tiene Posnet asociado, pero igualmente podés cobrar en efectivo o con QR."
          : "Desde acá vinculás o probás la impresora y controlás el estado del Posnet. Si algo figura desconectado, revisalo antes de empezar a cobrar.",
      phase: "venta",
      icon: "monitor",
      scrollFeel: false,
    },
  ];

  if (cfg.hasHistorial) {
    steps.push({
      id: "caja-historial",
      tab: "historial",
      selector: '[data-tour="caja-historial"]',
      title: "Encontrá una venta",
      body: "En Historial podés buscar tickets, reimprimirlos y, si tenés permiso, cancelar una venta manteniendo presionado el botón.",
      phase: "gestion",
      icon: "map",
      animateNav: "historial",
      scrollFeel: false,
    });
  }

  if (cfg.hasMetricas) {
    steps.push({
      id: "caja-metricas",
      tab: "metricas",
      selector: '[data-tour="caja-metricas"]',
      title: "Seguí la noche en vivo",
      body: "Métricas resume lo vendido, el ticket promedio, las unidades y los tragos más pedidos. No necesitás calcular nada a mano.",
      phase: "gestion",
      icon: "sparkles",
      animateNav: "metricas",
      scrollFeel: false,
    });
  }

  if (cfg.canCloseNight) {
    steps.push({
      id: "caja-cierre",
      tab: "venta",
      selector: '[data-tour="caja-cerrar"]',
      title: "Cerrá la noche con cuidado",
      body: "Al terminar, Cerrar noche muestra el resumen y pide confirmación. Usalo solo cuando ya no queden ventas por hacer.",
      phase: "gestion",
      icon: "monitor",
      animateNav: "venta",
      scrollFeel: false,
    });
  }

  steps.push({
    id: "caja-done",
    tab: "venta",
    selector: null,
    title: "¡Listo para vender!",
    body: "Ya conocés lo necesario para operar la caja. Si querés repetir este recorrido, tocá el signo ? de la barra superior.",
    phase: "cierre",
    icon: "party",
    animateNav: "venta",
  });

  return steps;
}
