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
dependencia. El flujo nativo nos da el 90%: `docs/ARCHITECTURE.md` y `AGENTS.md` actúan como
"constitution", Plan Mode como fase de plan, y la skill `brainstorming` como exploración previa.
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
| [`caja_numpad_and_pos_improvements_spec.md`](./05-ui-caja/caja_numpad_and_pos_improvements_spec.md) | `done` | Numpad, mejoras de checkout y POS (F1-F2 completadas) |

Plan: [`plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md`](../plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md).

### `features/` — mejoras de producto sueltas (fuera de fase)

| Spec | Estado | De qué va |
|---|---|---|
| [`usesse-centralizado.md`](./features/usesse-centralizado.md) | `done` | `useEventState`: un solo hook SSE compartido entre los shells de Admin y Caja |
| [`simplificar-dashboard-admin.md`](./features/simplificar-dashboard-admin.md) | `done` | Fusionar Monitoreo + Estadísticas en una sola vista del panel `/admin` |
| [`simplificar-historial-noches.md`](./features/simplificar-historial-noches.md) | `done` | De 8 tarjetas + 2 widgets a 3 `MetricCard` + un único selector de detalle/comparación |
| [`dashboard-sin-noche-abierta.md`](./features/dashboard-sin-noche-abierta.md) | `done` | Sin noche abierta el Dashboard muestra la última noche cerrada + fix de la torta de canales |
| [`export-pdf-historial.md`](./features/export-pdf-historial.md) | `done` | Reemplazar el export CSV por un PDF con `@react-pdf/renderer` |
| [`acceso-admin-sin-noche.md`](./features/acceso-admin-sin-noche.md) | `done` | Entrar a `/admin` sin noche activa (hoy el gate "Abrir Noche" tapa todo el panel) |
| [`refactor-ui-bosko/`](./features/refactor-ui-bosko/) | `draft` | Refactor visual skin Bosko (light/dark, tokens, bento); admin shell primero |
| [`002-onboarding-asistido.md`](./features/002-onboarding-asistido.md) | `draft` | Onboarding asistido con tour interactivo + Help Center por secciones (admin + caja) |

### Raíz — specs abiertas todavía sin archivar

| Spec | Estado | De qué va |
|---|---|---|
| [`noches-de-prueba-y-borrado.md`](./noches-de-prueba-y-borrado.md) | `approved` | Abrir noches de prueba que no persisten nada + borrar una noche registrada desde `/admin` y por CLI |

Design system: [`docs/design/`](../design/README.md) —
[`design.md`](../design/design.md),
referencias [light](../design/reference/bosko-light.png) /
[dark](../design/reference/bosko-dark.png).

Specs Bosko: [`refactor-ui-bosko.md`](./features/refactor-ui-bosko/refactor-ui-bosko.md) (overview) ·
[`admin-dashboard.md`](./features/refactor-ui-bosko/admin-dashboard.md) (shell) ·
[`dashboard-kpis.md`](./features/refactor-ui-bosko/dashboard-kpis.md) (KPI cards) ·
[`dashboard-charts.md`](./features/refactor-ui-bosko/dashboard-charts.md) (charts) ·
[`crud-carta.md`](./features/refactor-ui-bosko/crud-carta.md) (CRUD Carta / tabla estándar, `in-progress`).

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
| [`001-mp-vinculacion-qr-dinamico.md`](./mercadopago/001-mp-vinculacion-qr-dinamico.md) | `in-progress` | Vinculación MP + QR dinámico — spec canónica de la integración (F1–F8) |

Planes: [`plans/mercadopago/`](../plans/mercadopago/) —
[deuda de la remediación](../plans/mercadopago/deuda-remediacion-mp.md).

### `security/` — auditorías de seguridad

| Spec | Estado | De qué va |
|---|---|---|
| [`01-auditoria-seguridad-arquitectura.md`](./security/01-auditoria-seguridad-arquitectura.md) | `done` | Auditoría de seguridad arquitectónica: auth, surface, data, secrets |
| [`02-evaluacion-tecnica-recomendaciones.md`](./security/02-evaluacion-tecnica-recomendaciones.md) | `done` | Evaluación técnica y recomendaciones de hardening |
| [`03-resumen-soporte-mercadopago.md`](./security/03-resumen-soporte-mercadopago.md) | `done` | Resumen del soporte de Mercado Pago en el sistema |
| [`04-auditoria-ciberseguridad.md`](./security/04-auditoria-ciberseguridad.md) | `done` | Auditoría completa con 5 frameworks (MITRE ATT&CK, NIST CSF, ATLAS, D3FEND, NIST AI RMF) |
| [`05-framework-mappings.md`](./security/05-framework-mappings.md) | `done` | Mapeos detallados ATT&CK/CSF/ATLAS/D3FEND/AI-RMF |
| [`README-cybersecurity.md`](./security/README-cybersecurity.md) | — | Índice del módulo de ciberseguridad |
