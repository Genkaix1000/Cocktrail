# Specs — Spec-Driven Development (nativo)

Cada feature no trivial vive en un archivo `docs/specs/<slug>.md` que evoluciona en 3 capas
(spec → plan → tareas) generadas con los slash-commands de `.claude/commands/`.

## Flujo

```
brainstorming (skill, opcional)   →  explorar el intent
/spec  <feature>                  →  el QUÉ y el POR QUÉ (sin stack)
/plan  <slug>                     →  plan técnico (archivos, datos, riesgos)
/tasks <slug>                     →  checklist accionable
implementar (Plan Mode si es grande) → ir tildando las tareas
```

## Por qué nativo y no Spec Kit / OpenSpec

Para este MVP, Spec Kit es overkill (phase gates rígidos + setup Python) y OpenSpec agrega una
dependencia. El flujo nativo nos da el 90%: `CLAUDE.md`/`AGENTS.md` actúan como "constitution",
Plan Mode como fase de plan, y la skill `brainstorming` como exploración previa.
Si las specs se vuelven inmanejables en chat, evaluar subir a **OpenSpec** (lightweight, brownfield).
Ver `docs/AGENTS.md`.

## Convención de archivo

- `slug` en kebab-case (ej. `pedido-online-web.md`).
- Estado en el header: `draft` → `approved` → `in-progress` → `done`.
- Una feature = un archivo, con secciones `## Problema`, `## Objetivo`, `## Criterios de aceptación`,
  `## Plan técnico`, `## Tareas`.

## Organización en carpetas

Las specs se agrupan por **fase del roadmap** (prefijo numérico = orden de
[`docs/ROADMAP.md`](../ROADMAP.md)). Las que no pertenecen a una fase van a `features/`
(mejoras de producto sueltas) o a `deuda-pre-fase-6/` (riesgos/deuda cerrados antes del
empaquetado). El **plan técnico** de cada spec, cuando existe como archivo aparte, vive en
`docs/plans/` bajo la **misma subcarpeta**.

> `/spec` y `/plan` siguen escribiendo en la **raíz** de `docs/specs/` y `docs/plans/`.
> Una spec nueva nace suelta y se archiva en la subcarpeta de su fase cuando esa fase cierra.

## Índice

### `01-tickets-impresora/` — Fase 1: tickets + impresora térmica

| Spec | Estado | De qué va |
|---|---|---|
| [`impresora-termica.md`](./01-tickets-impresora/impresora-termica.md) | `approved` | Impresora NICTOM IT06 (ESC/POS directo) en `/caja` + "Abrir Noche" manual con palabra clave |

### `02-auditoria-api/` — Fase 2: auditoría de `apps/api`

| Spec | Estado | De qué va |
|---|---|---|
| [`auditoria-api.md`](./02-auditoria-api/auditoria-api.md) | `done` | Tests reales (Vitest+Supertest) + auditoría SOLID de los 9 módulos de la API |
| [`deuda-estructural-fase2.md`](./02-auditoria-api/deuda-estructural-fase2.md) | `done` | Los 5 puntos de deuda estructural que la Fase 2 dejó documentados sin resolver |

### `03-auditoria-web/` — Fase 3 / 3B / 3C: auditoría de `apps/web`

| Spec | Estado | De qué va |
|---|---|---|
| [`auditoria-web.md`](./03-auditoria-web/auditoria-web.md) | `done` | Fase 3 — modularización de los 3 god-components (`AdminClient`/`CajaClient`/`BarraClient`) |
| [`auditoria-web-componentes.md`](./03-auditoria-web/auditoria-web-componentes.md) | `done` | Fase 3B — los ~22 componentes sueltos que la Fase 3 dejó afuera |
| [`fase-3c-deuda-web-componentes.md`](./03-auditoria-web/fase-3c-deuda-web-componentes.md) | `done` | Fase 3C — deuda documentada de la 3B (servicios, modales, `Toast`, god-components de settings) |

Plan: [`plans/03-auditoria-web/2026-07-05-fase-3c-design.md`](../plans/03-auditoria-web/2026-07-05-fase-3c-design.md).

### `05-ui-caja/` — Fase 5: pulido de la terminal de caja

| Spec | Estado | De qué va |
|---|---|---|
| [`pulir-ui-caja.md`](./05-ui-caja/pulir-ui-caja.md) | `done` | Buscador con autocompletar + atajos de teclado + sacar el delay artificial de 800ms |
| [`adaptacion-caja-tablet.md`](./05-ui-caja/adaptacion-caja-tablet.md) | `draft` | `/caja` en tablet: sidebar plegable, checkout centrado, numpad, permiso `openNight` |

Plan: [`plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md`](../plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md).

### `06-empaquetado/` — Fase 6: empaquetado y producto

| Spec | Estado | De qué va |
|---|---|---|
| [`empaquetado-windows.md`](./06-empaquetado/empaquetado-windows.md) | `draft` | Que la PC Windows del boliche arranque el sistema sola, sin terminal ni Docker a mano |

Plan: [`plans/06-empaquetado/2026-07-13-empaquetado-windows-design.md`](../plans/06-empaquetado/2026-07-13-empaquetado-windows-design.md).

### `deuda-pre-fase-6/` — riesgos y deuda cerrados antes del empaquetado

| Spec | Estado | De qué va |
|---|---|---|
| [`atomicidad-canje-ticket.md`](./deuda-pre-fase-6/atomicidad-canje-ticket.md) | `done` | R3 — canje de ticket atómico (se elimina el patrón leer→chequear→escribir) |
| [`hardening-kong-demo-keys.md`](./deuda-pre-fase-6/hardening-kong-demo-keys.md) | `done` | R7 — camino real para reemplazar las demo keys de Kong/Supabase self-hosting |
| [`restaurar-backup-desde-cloud.md`](./deuda-pre-fase-6/restaurar-backup-desde-cloud.md) | `done` | Restore de emergencia: bajar de Supabase Cloud lo que se perdió en la mini-PC |
| [`activar-sync-cloud.md`](./deuda-pre-fase-6/activar-sync-cloud.md) | `done` | R2 — validar de punta a punta el sync local→cloud contra el proyecto real |

### `features/` — mejoras de producto sueltas (fuera de fase)

| Spec | Estado | De qué va |
|---|---|---|
| [`usesse-centralizado.md`](./features/usesse-centralizado.md) | `done` | `useEventState`: un solo hook SSE compartido entre los shells de Admin y Caja |
| [`simplificar-dashboard-admin.md`](./features/simplificar-dashboard-admin.md) | `done` | Fusionar Monitoreo + Estadísticas en una sola vista del panel `/admin` |
| [`simplificar-historial-noches.md`](./features/simplificar-historial-noches.md) | `done` | De 8 tarjetas + 2 widgets a 3 `MetricCard` + un único selector de detalle/comparación |
| [`dashboard-sin-noche-abierta.md`](./features/dashboard-sin-noche-abierta.md) | `done` | Sin noche abierta el Dashboard muestra la última noche cerrada + fix de la torta de canales |
| [`export-pdf-historial.md`](./features/export-pdf-historial.md) | `done` | Reemplazar el export CSV por un PDF con `@react-pdf/renderer` |
| [`acceso-admin-sin-noche.md`](./features/acceso-admin-sin-noche.md) | `done` | Entrar a `/admin` sin noche activa (hoy el gate "Abrir Noche" tapa todo el panel) |

Planes: [`plans/features/`](../plans/features/) —
[`useSSE`](../plans/features/2026-07-05-usesse-centralizado-design.md),
[dashboard sin noche](../plans/features/2026-07-14-dashboard-sin-noche-abierta-design.md),
[export PDF](../plans/features/2026-07-14-export-pdf-historial-design.md).

### `mercadopago/` — integración de cobros

| Spec | Estado | De qué va |
|---|---|---|
| [`integracion-mp.md`](./mercadopago/integracion-mp.md) | referencia activa | Arquitectura de alto nivel: OAuth, Store, POS, QR y Point en Cocktrail |
| [`cobro-posnet-mercadopago.md`](./mercadopago/cobro-posnet-mercadopago.md) | `done` | Cierre y endurecimiento del cobro con el Posnet físico (Point Integration API) |
| [`remediacion-integracion-mp.md`](./mercadopago/remediacion-integracion-mp.md) | `in-progress` | Los 12 defectos altos de la integración que entró sin revisión — 6 PRs de remediación (1-4 hechos, 5-6 pendientes) |
| [`cobro-verificado.md`](./mercadopago/cobro-verificado.md) | `done` | 🚨 Bloqueante — el sistema registra como venta un pago que MP **rechazó**; la venta se concreta si y solo si MP confirmó el cobro (R27) |
| [`gestion-posnets.md`](./mercadopago/gestion-posnets.md) | `draft` | La pantalla de Posnets es decorativa: el cobro sale por `MP_POS_DEVICE_ID` y no por la caja. Alta/PDV/salud del Posnet desde `/admin` (R23/R24/R25) |

Planes: [`plans/mercadopago/`](../plans/mercadopago/) —
[plan de implementación](../plans/mercadopago/plan-implementacion-mp.md),
[log de deuda de la remediación](../plans/mercadopago/deuda-remediacion-mp.md).
Doc de referencia de la API de MP: [`docs/mp/INDEX.md`](../mp/INDEX.md) y
[`docs/fases-mp/INDEX.md`](../fases-mp/INDEX.md).
