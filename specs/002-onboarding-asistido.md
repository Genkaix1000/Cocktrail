# Spec 002 — Onboarding Asistido (Tour Guiado)

**Fecha:** 2026-08-09  
**Estado:** Planificación (rev. 2)  
**Depende de:** Nada (independiente del Spec 001)  
**Stack:** React 19 + Next.js 16 + Tailwind CSS 4. Tour custom, cero dependencias.

---

## Cambios vs rev. 1 (por qué se reescribió)

| Problema en rev. 1 | Decisión |
|---|---|
| Resume post-OAuth por **índice numérico** + rebuild con `linked: true` → el paso "felicitaciones" desaparece y el índice apunta mal | Resume por **marker** (`post-link`), no por índice. Ver § Retoma post-OAuth. |
| Rama no-vinculado terminaba en felicitaciones → cierre y **saltaba Posnets** | Tras link: felicitaciones → Posnets → Carta → Staff → cierre. |
| Orphan vía `provisioning/summary` | Ese endpoint solo devuelve `{ store, bars, posnets }`. Orphan = `listCajas()` + `c.isOrphan`. |
| Tour ~12 pasos de UI chrome (colapsar sidebar, Dashboard, Logs…) antes del setup | Setup-first: MP → Posnets → Carta → Staff. Orientación de nav = 1 paso al final. |
| `isTabTransitioning` como gate de espera | Solo aplica a skeleton de `monitoreo`/`historial`. Esperar con `waitFor(selector)`. |
| Tab Ayuda completa en v1 | YAGNI (`docs/design/design.md`). v1 = tour + botón `?`. Ayuda tab = follow-up. |
| `branch?: boolean` en cada step | Inútil si `buildSteps` ya emite solo pasos aplicables. Se elimina. |
| `window.__cocktrail_tour` obligatorio | Context React + prop/`useTour()` en AppTopbar. Window API solo opcional para debug. |

---

## SDD — Diseño de Software

### Visión general

Recorrido guiado que **completa el setup inicial del admin**: vincular Mercado Pago, Posnets, primer trago, staff. Overlay custom con spotlight, sin librerías.

No es un tour de cada rincón de la UI. Es un checklist asistido con spotlight.

### Disparo del tour

| Condición | Comportamiento |
|---|---|
| Primer login admin (`localStorage.cocktrail_tour_seen_admin` ausente) | Auto-start tras 600ms en `AdminClient` |
| Botón `?` en `AppTopbar` (izquierda del toggle día/noche) | Relanza siempre (`start({ force: true })`) |
| `sessionStorage.cocktrail_tour_resume === "post-link"` al montar | Retoma en modo post-vinculación (ver § Retoma) |
| URL `?linked=true` | No dispara nada extra. `PagosSection` ya maneja toast + strip de query. El tour solo mira `sessionStorage`. |

Skip o cierre → escribe `localStorage.cocktrail_tour_seen_admin = "1"` y limpia el resume marker.

### Estado del tour

```ts
type TourStepId =
  | 'welcome'
  | 'mp-unlinked'      // card + CTA vincular
  | 'mp-linked'        // ya vinculado
  | 'mp-congrats'      // solo post-OAuth resume
  | 'pdv-orphan'       // solo si hay caja huérfana
  | 'pdv-posnet'       // agregar posnet
  | 'carta'
  | 'staff'
  | 'nav-overview'     // un solo paso de orientación
  | 'done';

type TourStep = {
  id: TourStepId;
  tab: 'monitoreo' | 'pdv' | 'carta' | 'usuarios';
  selector: string | null; // null = overlay central
  title: string;
  body: string;            // texto plano; `{{displayName}}` se interpola
  position?: 'auto' | 'top' | 'bottom' | 'left' | 'right'; // default auto
  /** Side-effects al entrar al paso */
  onEnter?: 'persist-resume-before-oauth';
};

type TourState = {
  running: boolean;
  index: number;
  steps: TourStep[];
};
```

**API** (via `useTour()` / context; opcionalmente espejada en `window.__cocktrail_tour` solo en dev):

```ts
tour.start(opts?: { force?: boolean }): void;
tour.next(): void;
tour.prev(): void;
tour.end(reason: 'skip' | 'done'): void;
tour.goto(id: TourStepId): void; // por id, nunca por índice crudo desde afuera
```

### Construcción de pasos

Al `start()`, `TourProvider` fetchea en paralelo:

1. `mercadopagoService.getSellerStatus()` → `{ linked, displayName, status }`
2. Si `linked`: `pdvService.listCajas()` → `hasOrphanCaja = cajas.some(c => c.isOrphan)`  
   Si no linked: no fetch de cajas.

```ts
type StepConfig = {
  linked: boolean;
  displayName: string | null;
  hasOrphanCaja: boolean;
  /** true solo cuando sessionStorage dice post-link */
  resumePostLink: boolean;
};

function buildSteps(cfg: StepConfig): TourStep[] {
  const steps: TourStep[] = [
    { id: 'welcome', tab: 'monitoreo', selector: null, ... },
  ];

  if (cfg.resumePostLink) {
    steps.push({ id: 'mp-congrats', tab: 'pdv', selector: null, ... });
  } else if (!cfg.linked) {
    steps.push({
      id: 'mp-unlinked',
      tab: 'pdv',
      selector: '[data-tour="vinculame"]',
      onEnter: 'persist-resume-before-oauth',
      ...
    });
  } else {
    steps.push({ id: 'mp-linked', tab: 'pdv', selector: '[data-tour="pagos-section"]', ... });
  }

  // Posnets solo tiene sentido con cuenta vinculada (o recién vinculada)
  if (cfg.linked || cfg.resumePostLink) {
    if (cfg.hasOrphanCaja) {
      steps.push({ id: 'pdv-orphan', tab: 'pdv', selector: '[data-tour="reprovisionar"]', ... });
    }
    steps.push({ id: 'pdv-posnet', tab: 'pdv', selector: '[data-tour="agregar-posnet"]', ... });
  }

  steps.push(
    { id: 'carta', tab: 'carta', selector: '[data-tour="nuevo-trago"]', ... },
    { id: 'staff', tab: 'usuarios', selector: '[data-tour="nuevo-usuario"]', ... },
    { id: 'nav-overview', tab: 'monitoreo', selector: '[data-tour="sidebar"]', ... },
    { id: 'done', tab: 'monitoreo', selector: null, ... },
  );

  return steps;
}
```

**Conteo tipico:** 6–8 pasos (no 12+).

### Fases del tour

#### 1 — Bienvenida

| Campo | Valor |
|---|---|
| `id` | `welcome` |
| `tab` | `monitoreo` |
| `selector` | `null` |
| `title` | Bienvenido a Cocktrail |
| `body` | En unos minutos vas a vincular Mercado Pago, configurar cobro, cargar la carta y crear tu staff. Empezar / Saltar. |

#### 2 — Mercado Pago (rama)

**No vinculado (`mp-unlinked`)**

| Campo | Valor |
|---|---|
| `tab` | `pdv` |
| `selector` | `[data-tour="vinculame"]` |
| `title` | Vincular Mercado Pago |
| `body` | Sin esto no hay cobros con QR ni tarjeta. Click en Vincular — autorizás en MP y volvés acá. |
| `onEnter` | Persiste `sessionStorage.cocktrail_tour_resume = "post-link"` **antes** de que el user pueda clickear (al entrar al paso, no al click). |

Nota: el botón vive al final de `PagosSection` (debajo de `PdvSection`). `scrollIntoView` obligatorio. Si el target no existe (estado raro), modo centro + mismo copy.

**Ya vinculado (`mp-linked`)**

| Campo | Valor |
|---|---|
| `tab` | `pdv` |
| `selector` | `[data-tour="pagos-section"]` |
| `title` | Mercado Pago vinculado |
| `body` | Tu cuenta (`{{displayName}}`) está activa. Acá ves estado, sandbox/prod y desvincular. |

**Post-OAuth (`mp-congrats`)** — solo con resume marker

| Campo | Valor |
|---|---|
| `tab` | `pdv` |
| `selector` | `null` |
| `title` | ¡Cuenta vinculada! |
| `body` | `{{displayName}}` ya recibe los cobros. Siguiente: Posnets. |

Al entrar a `mp-congrats`, borrar el marker de resume (idempotente).

#### 3 — Posnets (si linked o post-link)

**Huérfano (`pdv-orphan`)** — solo si `hasOrphanCaja`

| Campo | Valor |
|---|---|
| `selector` | `[data-tour="reprovisionar"]` |
| `title` | PDV sin dueño |
| `body` | Esta barra quedó de una cuenta MP vieja. Re-provisionar la migra a la cuenta actual. El QR cambia: hay que reimprimirlo. |

**Agregar Posnet (`pdv-posnet`)**

| Campo | Valor |
|---|---|
| `selector` | `[data-tour="agregar-posnet"]` |
| `title` | Agregar Posnet |
| `body` | Elegí un dispositivo de tu cuenta MP y Agregar. Sin Posnet igual se cobra con QR dinámico/estático según barra. |

Si el selector no está (lista vacía / loading), modo centro con el mismo mensaje — no bloquear el tour.

#### 4 — Carta

| Campo | Valor |
|---|---|
| `id` | `carta` |
| `tab` | `carta` |
| `selector` | `[data-tour="nuevo-trago"]` |
| `title` | Creá tu carta |
| `body` | Productos de la barra: nombre, categoría, precio. Nuevo trago para el primero. |

#### 5 — Staff

| Campo | Valor |
|---|---|
| `id` | `staff` |
| `tab` | `usuarios` |
| `selector` | `[data-tour="nuevo-usuario"]` |
| `title` | Tu equipo |
| `body` | Admins (todo) y cajeros (solo ventas). Cada uno con su login. |

#### 6 — Orientación de nav (un paso)

| Campo | Valor |
|---|---|
| `id` | `nav-overview` |
| `tab` | `monitoreo` |
| `selector` | `[data-tour="sidebar"]` |
| `title` | El resto del panel |
| `body` | Dashboard e Historial de noches, Auditoría de tickets, Pagos, Carta, Staff y Sistema — todo desde acá. |

En `< md`: sin spotlight al sidebar (drawer). Modo centro + copy: "En pantallas chicas abrís el menú con el botón de la barra superior."

**No** se hace auto-open del drawer en v1 (deuda opcional).

#### 7 — Cierre

| Campo | Valor |
|---|---|
| `id` | `done` |
| `tab` | `monitoreo` |
| `selector` | `null` |
| `title` | ¡Listo! |
| `body` | Eso es lo esencial. Repetí el recorrido cuando quieras con el `?` de la barra superior. |

`end('done')` → `localStorage.cocktrail_tour_seen_admin = "1"`.

---

## Retoma post-OAuth

```
Antes (roto):
  sessionStorage.step = 10  →  reload linked=true  →  buildSteps sin felicitaciones
  →  goto(10) apunta a otro paso o overflow

Ahora:
  al entrar a mp-unlinked → sessionStorage.cocktrail_tour_resume = "post-link"
  user hace OAuth → vuelve a /admin?tab=pagos&linked=true
  TourProvider mount:
    resumePostLink = sessionStorage === "post-link"
    fetch status (linked=true) + listCajas
    buildSteps({ linked: true, resumePostLink: true, hasOrphanCaja })
    → [welcome?, NO — start directo en mp-congrats]
```

Al retomar, **no** re-mostrar welcome. `start()` detecta resume y:

```ts
const steps = buildSteps({ ...cfg, resumePostLink: true });
// steps[0] === mp-congrats (buildSteps en modo resume omite welcome)
setIndex(0);
running = true;
```

Ajuste fino de `buildSteps` en resume:

```ts
if (cfg.resumePostLink) {
  // no welcome; arranca en congrats → posnets → carta → staff → nav → done
  return [
    { id: 'mp-congrats', ... },
    ...(cfg.hasOrphanCaja ? [orphan] : []),
    posnet, carta, staff, navOverview, done,
  ];
}
```

`PagosSection` sigue siendo dueña del toast `?linked=true`. El tour no parsea la URL.

---

## TDD — Diseño Técnico

### Arquitectura de archivos

```
apps/web/src/
├── components/
│   ├── tour/
│   │   ├── TourProvider.tsx      # Context + lógica
│   │   ├── TourOverlay.tsx       # Spotlight + card
│   │   └── tourSteps.ts          # buildSteps + copy
│   └── shared/
│       └── AppTopbar.tsx         # + botón ?
└── app/admin/
    └── AdminClient.tsx           # wrap TourProvider + anclas data-tour
```

Sin `AyudaSection` en v1.

### `TourProvider.tsx`

```
mount:
  if sessionStorage.resume === "post-link" → start({ resume: true })
  else if !localStorage.seen → setTimeout 600ms → start()

start({ force, resume }):
  1. fetch seller-status; si linked || resume → listCajas
  2. steps = buildSteps(...)
  3. running = true; index = 0
  4. applyStep(steps[0])

applyStep(step):
  1. onNavigateTab(step.tab)   // AdminClient.handleTabChange — usa "pdv", no "pagos"
  2. waitFor(step.selector, 3s) o resolve inmediato si selector null
  3. scrollIntoView({ block: 'center', behavior: 'smooth' })
  4. si onEnter === persist-resume → sessionStorage.setItem(...)
  5. si id === mp-congrats → sessionStorage.removeItem(resume)
  6. medir rect → overlay

next/prev: index±1, applyStep; si next past end → end('done')
end(reason): running=false; clear resume; always set seen=1
```

Props desde AdminClient:

```tsx
<TourProvider onNavigateTab={handleTabChange}>
```

No pasar `isTabTransitioning`.

### `TourOverlay.tsx`

- Layer `fixed inset-0 z-[9999]` (por encima de modales `z-50`; cuidado: `SandboxHelpTooltip` también usa 9999 — al start del tour, no abrir ese tooltip).
- Spotlight: `box-shadow: 0 0 0 9999px rgba(0,0,0,0.72)` + padding 8px. Transición `0.28s ease`.
- Target ausente / size 0 → modo `.center` (sin recorte).
- Card: clamp ancho 280–420px; posición auto (right → left → bottom → top); nub CSS; dots; Back / Next / Skip.
- Listeners `scroll` (capture) + `resize` → remeasure.
- Sin Framer Motion. Tailwind `animate-*` + CSS transitions.
- Antes de `start`: si hay modal abierto (ej. OpenNightModal), cerrarlo o dejar que el overlay lo tape (z-index gana). Preferir no pelear: el auto-start a 600ms suele ser antes de modales de noche.

### Anclas `data-tour`

| `data-tour` | Dónde | Notas |
|---|---|---|
| `sidebar` | `<aside>` en `AdminClient` renderSidebar | |
| `vinculame` | Botón Vincular en `PagosSection` | Solo existe si no linked / expired |
| `pagos-section` | Wrapper de `PagosSection` | |
| `reprovisionar` | Botón en `PdvTable` | Solo si `caja.isOrphan` |
| `agregar-posnet` | Botón "Agregar" en `PdvSection` | |
| `nuevo-trago` | `CartaSection` | |
| `nuevo-usuario` | `UsuariosSection` | |

No anclar: sidebar-collapse, tab-pdv, dashboard-content, logs-content (fuera del flujo v1).

Tabs reales del admin (referencia): `monitoreo`, `historial`, `logs`, `carta`, `usuarios`, `pdv` (alias URL `pagos` → `pdv`), `sistema`.

### Botón `?` en `AppTopbar`

```tsx
<button
  type="button"
  onClick={onHelpClick}  // prop desde AdminClient → tour.start({ force: true })
  aria-label="Recorrido guiado"
  title="Recorrido guiado"
  className="p-2 rounded-xl hover:bg-ink-800/60 transition-colors"
>
  <CircleHelp className="w-5 h-5 text-ink-400" />
</button>
```

Siempre visible. Preferir prop/callback sobre `window.*`.

### Mobile

| Viewport | Comportamiento |
|---|---|
| `>= md` | Spotlight normal sobre sidebar / targets |
| `< md` | `nav-overview` en modo centro (sin abrir drawer). Resto igual con `waitFor` + scroll |

### Plan de verificación (no ejecutar — planificar)

| # | Escenario | Esperado |
|---|---|---|
| 1 | Clean storage, primer login admin | Auto-start ~600ms, flujo setup-first |
| 2 | MP no vinculado → Vincular | Resume marker seteado; al volver con `?linked=true`, arranca en `mp-congrats` → posnets → carta → staff → done. **No** overflow de índice. |
| 3 | MP ya vinculado + `?` | `mp-linked` → posnets (orphan si aplica) → carta → staff → nav → done |
| 4 | Caja huérfana | Paso `pdv-orphan` presente; si no, ausente |
| 5 | Re-login con seen=1 | No auto-start; `?` relanza |
| 6 | Mobile | `nav-overview` centro; no rompe |
| 7 | Target faltante (lista posnets vacía) | Modo centro, Next sigue |
| 8 | Skip a mitad | seen=1, resume limpio, no re-auto |
| 9 | Unit `buildSteps` | Casos: unlinked, linked, linked+orphan, resumePostLink |

### Deuda técnica explícita (ponytail)

- **Sin tab Ayuda en v1.** Cuando haya guías permanentes, agregar `AyudaSection` con deep-links + `tour.start({ force: true })`. Hasta entonces el `?` alcanza. (`docs/design/design.md` YAGNI.)
- **Sin progreso parcial entre sesiones.** Solo flag `seen`. Tour corto; repetir es barato.
- **Sin i18n.** Strings en `tourSteps.ts`.
- **Sin auto-open del drawer mobile.** Modo centro en `nav-overview`.
- **Sin tests de overlay/posicionamiento.** Sí: unit de `buildSteps` (un archivo, casos de rama). Eso es el check que falla si se rompe el flujo OAuth/orphan.
- **Anclas manuales.** Si un refactor mueve un botón, el paso cae a centro. OK.

---

## Orden de ejecución

| Paso | Descripción | Esfuerzo |
|---|---|---|
| 1 | `tourSteps.ts` + unit test de `buildSteps` (ramas + resume) | 1h |
| 2 | `TourProvider.tsx` (estado, fetch, resume marker, applyStep) | 2h |
| 3 | `TourOverlay.tsx` (spotlight, card, remeasure) | 2h |
| 4 | Anclas `data-tour` en los 6 elementos | 0.5h |
| 5 | Wrap en `AdminClient` + prop `onHelpClick` a `AppTopbar` | 0.5h |
| 6 | Botón `?` en `AppTopbar` | 0.25h |
| 7 | Mobile centro en nav-overview | 0.25h |
| 8 | Verificación manual escenarios 1–8 | 1h |

**Total estimado:** 7–8h (rev. 1 pedía 10–13h; se cortó Ayuda + pasos de chrome).

---

## Variables de entorno / configuración

Ninguna.

---

## Dependencias

Cero paquetes nuevos. `lucide-react` ya expone `CircleHelp` / `HelpCircle`.

---

## Follow-up (no v1)

1. Tab `ayuda` con cards de deep-link (cuando el contenido lo justifique).
2. Paso opcional Historial de noches si el soporte lo pide.
3. Auto-open drawer en mobile para spotlight real del sidebar.
