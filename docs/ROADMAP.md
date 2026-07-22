# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Las fases/features cerradas sin nada pendiente se resumen en 1-3 líneas acá — el detalle
> completo (qué se hizo, por qué, cómo se verificó) queda en su spec bajo
> [`docs/specs/`](./specs/README.md), organizada por fase (`01-tickets-impresora/`,
> `02-auditoria-api/`, …). Los planes técnicos correspondientes viven en `docs/plans/` con
> las mismas subcarpetas. Cada sección de abajo linkea su carpeta y sus documentos.
> Última actualización: 2026-07-22.

---

## 🧭 Dónde estamos y qué sigue *(2026-07-22)*

**En una línea**: el cobro con Posnet físico ya funciona de punta a punta, pero el sistema
**registra como venta un pago que Mercado Pago rechazó**. Eso se arregla primero; todo lo demás
espera.

### Lo que se cerró el 2026-07-22

- **Titularidad del Posnet destrabada** — dejó de depender de un tercero. El lector
  `PAX_A910__SMARTPOS1493600985` pasó a la cuenta propia, quedó colgado de la caja "Barra VIP"
  (`COCKTRAILBAR01`) y **en modo PDV**. Ver "Remediación de la integración Mercado Pago".
- **Gate físico del PR 3 pasado** — cobro real con el Posnet, aprobado, con ticket impreso.
- **El cobro por QR quedó verificado a nivel código**: funciona por *polling* contra MP y **no**
  depende del webhook (que hoy está caído por `MP_WEBHOOK_SECRET` vacía, R26). Falta probarlo con
  plata real, aprobada y rechazada.
- **Bug crítico encontrado y reproducido con evidencia cruda** — ver la sección "Cobro verificado".

### Orden de trabajo acordado

| # | Qué | Por qué va en ese lugar | Estado |
|---|---|---|---|
| 1 | **Cobro verificado** (`specs/mercadopago/cobro-verificado.md`) | Es el único que pierde plata **en cada uso**. Lo demás son riesgos; esto es daño presente. | ✅ **implementado el 2026-07-22** (backend+frontend+tests+sync a Cloud verificados) — falta solo el **gate físico** (tarjeta sin fondos + $15 contra el Posnet real) para `done` |
| 2 | **PR 4** de la remediación MP | Cimiento: hoy hay **dos sellers activos** y el sistema elige el correcto por casualidad (R21). Construir la gestión de Posnets encima de eso es edificar sobre algo que se mueve. Además es el que habilita migrar a la cuenta del boliche. | pendiente |
| 3 | **Gestión de Posnets** (`specs/mercadopago/gestion-posnets.md`) **+ PR 6** | Son la misma pantalla: el PR 6 cablea la UI de PDVs y la spec le da la funcionalidad que hoy no existe. Separarlas es tocar los mismos archivos dos veces. | spec `draft` |
| 4 | **PR 5** — conciliación / sync | Se beneficia del #1: hoy el Posnet **no deja fila en `mp_orders`** (R19), y el #1 obliga a persistir el intent. Hacerlo antes sería conciliar sobre datos que no existen. | pendiente |
| 5 | **Fase 6** — empaquetado | Nada de lo anterior es opcional para poder entregar el producto. | pendiente |

### Decisiones pendientes del dueño del proyecto

- ¿El **chequeo de salud** de la vinculación MP debe **bloquear** el cobro o solo advertir?
  (criterio G de `gestion-posnets.md`)
- ¿Un mismo Posnet puede **rotar entre dos barras** en noches distintas? Hoy el modelo dice que no
  — hay que confirmar que no existe el caso de un local con un solo aparato que lo mueve.

---

## Fase actual — MVP local-first para el boliche de prueba

**Objetivo**: que el sistema funcione completo en una máquina local del boliche (mini-PC/laptop),
sin depender de internet, con caja + reconciliación a la nube al cerrar la noche. El pedido por LAN
(`/carta` + `/barra`) está programado y corre, pero su validación queda para la Fase 7 (ver nota abajo).

**Estado**: completa y validada con datos reales — monorepo pnpm, Supabase local como fuente de
verdad, sync local→cloud, 2 roles (`admin/caja`), Mercado Pago real (Posnet físico), SSE,
impresora térmica, apertura/cierre de noche manual. Flujo caja→cierre→sync validado de punta a
punta el 2026-07-10 (efectivo) y el 2026-07-13 (Posnet físico).

> ⚠️ **Ojo con el alcance de esa validación**: es anterior al merge de la integración Mercado Pago
> del 2026-07-17, que trajo defectos que hacían el sistema **no desplegable** hasta remediarlos.
> Ver "Remediación de la integración Mercado Pago" más abajo — está en curso y tiene su gate de
> validación en vivo pendiente.

> 📌 **Nota — `/carta`, el ticket virtual y `/barra` quedan fuera de la validación hasta la Fase 7**:
> las tres pantallas del **flujo digital del cliente** están programadas y el código corre, pero
> no se van a validar/probar ahora — se van a **rediseñar junto con la Fase 7** (pedido online),
> incluyendo cómo se sincroniza un pedido creado en la web con la barra local y quién/cómo lo
> canjea. No tiene sentido validarlo dos veces.
>
> El rol `barman` se retiró por completo (2026-07-13) — el flujo físico del local es caja→barra
> sin app. `/barra` sigue existiendo como pantalla de canje manual, ahora admin-only.
>
> **Qué se prueba en cambio, ahora**: el flujo real del local es **caja → barra físico** (sin
> apps): la cajera carga y cobra en `/caja`, imprime el ticket y lo entrega. Ese es el circuito que
> se valida de punta a punta, junto con `/admin` para el cierre de noche y el sync.

---

## Fase 1 — Tickets + impresora térmica 🖨️ *(completa)*

Impresora térmica NICTOM IT06 (POS58, ESC/POS directo, sin CUPS) integrada a `/caja`: ticket
automático en cada venta de staff, manejo de error sin frenar la venta, botón de test. De paso,
"Abrir Noche" pasó a manual con palabra clave obligatoria.

📁 Docs: [`specs/01-tickets-impresora/`](./specs/01-tickets-impresora/) —
[`impresora-termica.md`](./specs/01-tickets-impresora/impresora-termica.md).

- [ ] Corte automático de papel — fuera de alcance (comandera sin cuchilla, se corta a mano).

---

## Fase 2 — Auditoría API 🔍 *(completa)*

`apps/api` con tests reales (Vitest+Supertest, 9 módulos, unitarios+integración), 2 hallazgos de
seguridad corregidos (`/api/system/*` sin auth, credencial `cajavip` hardcodeada), `OrderStatus`
colapsado a 3 valores, y deuda estructural resuelta (`emit` inyectado, `auth.service.ts`
partido, `SyncService`/`system.controller.ts` desacoplados).

📁 Docs: [`specs/02-auditoria-api/`](./specs/02-auditoria-api/) —
[`auditoria-api.md`](./specs/02-auditoria-api/auditoria-api.md),
[`deuda-estructural-fase2.md`](./specs/02-auditoria-api/deuda-estructural-fase2.md).

- [ ] Fuera de alcance de esta fase (sin tests/auditoría todavía): módulos `printer`, `cash-sales`
  (eliminado después, ver Deuda pre-Fase 6), `audit-logs`, `sse`.

---

## Fase 3 — Auditoría Web 🎨 *(completa)*

Los 3 god-components (`AdminClient` 3418→724, `CajaClient` 2182→447, `BarraClient` 1517→863
líneas) modularizados en hooks + subcomponentes con tests de caracterización. Hallazgos
documentados al cierre — todos resueltos en 3B/3C.

📁 Docs: [`specs/03-auditoria-web/`](./specs/03-auditoria-web/) —
[`auditoria-web.md`](./specs/03-auditoria-web/auditoria-web.md).

---

## Fase 3B — Auditoría Web: componentes sueltos + deuda de Fase 3 🎨 *(completa)*

22 componentes sueltos auditados (109 tests nuevos), bug real corregido (`CloseNightModal` con
timers sin cancelar podía disparar el cierre real sobre un componente desmontado), y los 5
hallazgos de la Fase 3 resueltos. Hallazgos documentados al cierre — todos resueltos en 3C o en
features posteriores.

📁 Docs: [`specs/03-auditoria-web/`](./specs/03-auditoria-web/) —
[`auditoria-web-componentes.md`](./specs/03-auditoria-web/auditoria-web-componentes.md).

---

## Fase 3C — Deuda documentada de Fase 3B 🎨 *(completa)*

Servicios de `apps/web/src/services/*.ts` auditados (46 tests), `Toast` compartido, modales
migrados a montaje condicional, god-components de settings partidos, y `CashSaleModal` (feature
muerta, nunca conectada desde el primer commit) eliminada.

📁 Docs: [`specs/03-auditoria-web/`](./specs/03-auditoria-web/) —
[`fase-3c-deuda-web-componentes.md`](./specs/03-auditoria-web/fase-3c-deuda-web-componentes.md),
plan: [`plans/03-auditoria-web/2026-07-05-fase-3c-design.md`](./plans/03-auditoria-web/2026-07-05-fase-3c-design.md).

---

## Feature — `useSSE` centralizado (deuda de Fase 3B) 🔌 *(completa)*

`useEventState` (hook compartido Admin+Caja) reemplaza la duplicación byte-a-byte de reconexión
SSE y `refetch()` entre ambos shells, con 4 hallazgos reales corregidos durante la implementación.

📁 Docs: [`specs/features/usesse-centralizado.md`](./specs/features/usesse-centralizado.md),
plan: [`plans/features/2026-07-05-usesse-centralizado-design.md`](./plans/features/2026-07-05-usesse-centralizado-design.md).

---

## Feature — Simplificar Dashboard de `/admin` 📊 *(completa)*

Dashboard + Estadísticas fusionados en una sola vista (3 `MetricCard`, Ventas por Hora, Top
Productos, Donut de pagos, Hora Pico, Comparativa), `Ticket Promedio` eliminado de todos lados,
código/tabs muertos sacados.

📁 Docs: [`specs/features/simplificar-dashboard-admin.md`](./specs/features/simplificar-dashboard-admin.md).

---

## Feature — Simplificar Historial de Noches 📉 *(completa)*

De 8 tarjetas + 2 widgets a 3 `MetricCard` + Trago Estrella + un único selector de detalle/
comparación (reemplaza Comparador + tabla paginada + popup).

📁 Docs: [`specs/features/simplificar-historial-noches.md`](./specs/features/simplificar-historial-noches.md).

---

## Feature — Dashboard sin noche abierta + fix torta + detalle de noche 📊 *(completa)*

Sin noche abierta, el Dashboard muestra los datos reales de la última noche cerrada (sin
"-100%" engañoso); la torta de canales ya no pinta colores con total $0; el detalle de una noche
en Historial suma Tickets Emitidos/Top Trago/Duración y no repite el bloque de sesiones cuando
hubo una sola.

📁 Docs: [`specs/features/dashboard-sin-noche-abierta.md`](./specs/features/dashboard-sin-noche-abierta.md),
plan: [`plans/features/2026-07-14-dashboard-sin-noche-abierta-design.md`](./plans/features/2026-07-14-dashboard-sin-noche-abierta-design.md).

---

## Feature — Reemplazar export CSV por PDF profesional 📄 *(completa)*

Un solo botón "Exportar" (Historial de Noches) genera un PDF con `@react-pdf/renderer` (portada
con logo, facturación semanal/mensual, detalle noche por noche) en vez de CSV.

📁 Docs: [`specs/features/export-pdf-historial.md`](./specs/features/export-pdf-historial.md),
plan: [`plans/features/2026-07-14-export-pdf-historial-design.md`](./plans/features/2026-07-14-export-pdf-historial-design.md).

---

## Fase 4 — E2E post-refactor 🧪 *(deprioritizada, 2026-07-13)*

**Decisión**: no se arranca por ahora — cada feature ya se verificó de punta a punta manualmente/
con `e2e-playwright-tester` al cerrarse, y esa cobertura se considera suficiente por el momento.

- [ ] Definir alcance si se retoma más adelante.

---

## Fase 5 — Pulir UI de caja ⚡ *(completa)*

Cobro en caja más rápido: buscador con autocompletar, atajos de teclado (Enter/1-2-3/Monto
exacto), delay artificial de 800ms sacado.

📁 Docs: [`specs/05-ui-caja/`](./specs/05-ui-caja/) —
[`pulir-ui-caja.md`](./specs/05-ui-caja/pulir-ui-caja.md) (completa),
[`adaptacion-caja-tablet.md`](./specs/05-ui-caja/adaptacion-caja-tablet.md) (`draft`, con
[plan](./plans/05-ui-caja/2026-07-13-adaptacion-caja-tablet-design.md)).

- [ ] **Adaptación de `/caja` a tablet + permiso `openNight`** — spec en `draft`, sin implementar.

---

## Deuda pre-Fase 6 🧹 *(en progreso, 2026-07-13)*

**Objetivo**: cerrar los riesgos/deuda reales documentados en la tabla de Riesgos antes de
arrancar el empaquetado (Fase 6). La Fase 4 (E2E formal) y la Fase 7 (pedido online) quedan
explícitamente afuera de esta ronda.

Resuelto: atomicidad del canje de ticket (R3), hardening de Kong/demo keys (R7), deuda
estructural de Fase 2, restore de emergencia desde Supabase Cloud, `cash_sales` eliminado (feature
muerta, nunca conectada a la UI), `audit_logs` aplicado en cloud (R13), y 15 campos/2 componentes
sin consumidor eliminados de `useAdminAnalytics`/`lib/analytics.ts` (R12).

📁 Docs: [`specs/deuda-pre-fase-6/`](./specs/deuda-pre-fase-6/) —
[`atomicidad-canje-ticket.md`](./specs/deuda-pre-fase-6/atomicidad-canje-ticket.md),
[`hardening-kong-demo-keys.md`](./specs/deuda-pre-fase-6/hardening-kong-demo-keys.md),
[`restaurar-backup-desde-cloud.md`](./specs/deuda-pre-fase-6/restaurar-backup-desde-cloud.md),
[`activar-sync-cloud.md`](./specs/deuda-pre-fase-6/activar-sync-cloud.md).
La deuda estructural de Fase 2 vive con su fase:
[`specs/02-auditoria-api/deuda-estructural-fase2.md`](./specs/02-auditoria-api/deuda-estructural-fase2.md).

- [ ] **Limpieza de lint a nivel repo** (R11) — la spec todavía no se escribió.

> 📌 Desde el 2026-07-21, el grueso del trabajo pre-Fase 6 es la **remediación de MP** y la **gestión
> de Posnets** (las dos secciones que siguen), no esta lista.

---

## Cobro verificado — el sistema registra ventas NO cobradas 🚨 *(bloqueante, 2026-07-22)*

> 🔴 **Tiene prioridad sobre el PR 4 de la remediación.** Un sistema que registra ventas no cobradas
> no se puede poner en un boliche. Todo lo demás espera.

**Qué pasó** (reproducido en vivo el 2026-07-22): se cobró con el Posnet físico usando una **tarjeta
sin fondos**. Mercado Pago rechazó el pago (`cc_rejected_insufficient_amount`) y **Cocktrail imprimió
el ticket y registró la venta como concretada**. El boliche entregó producto sin cobrar y la caja no
cuadra.

**Causa raíz**: el campo `state` del payment intent describe el **ciclo de vida del intent**, no el
resultado del pago. `FINISHED` significa "el intent terminó" y convive con `payment.status:
"rejected"`. El backend devuelve ese estado crudo (`mercadopago.service.ts:286`) sin consultar nunca
el pago real, y el frontend concreta la venta con esa sola palabra (`useCheckout.ts:298`). La función
correcta —`mapPaymentStatusToNormalized`— **ya existe** (`mercadopago.service.ts:30-34`); solo se
invoca dentro del `if (rawStatus === "CONFIRMATION_REQUIRED")`.

**El bug nació en la doc**: `docs/mp/api-point-devices.md:93` dice `FINISHED → FINISHED → Concretar
pedido ✅`, y `cobro-posnet-mercadopago.md:90-92` lo repite como criterio de aceptación cumplido.
Mientras eso siga escrito, cualquiera lo reintroduce con la doc de su lado.

**Lo que dejó a la vista**: el intent del Posnet no se persiste en ningún lado · `Order` no tiene
ningún campo de pago (`domain.ts:38-56`) · el ticket se imprime según `isStaffOrder`
(`orders.service.ts:83`), no según el cobro · el monto aprobado nunca se compara contra el carrito ·
la constancia de "venta cobrada sin registrar" se escribe **antes** de registrar · el polling del
Posnet no tiene deadline · un rechazo por fondos se muestra como *"la cancelaron a propósito"*.

**Los webhooks no salvaban nada**: `MP_WEBHOOK_SECRET` vacía → 401 (R26) · se descarta todo lo que no
sea `type === "order"` y el topic de Point es `payment_intent` · `reconcileFromMp` solo toca
`mp_orders` y nada revierte una `Order`. La verificación tiene que ser **sincrónica**.

**Alcance**: Posnet 🔴 roto y confirmado empíricamente · QR 🟡 **sin verificar** (mismo patrón de
razonamiento en `useCheckout.ts:367`; probablemente se salva porque la Orders API tiene `failed` como
estado propio, pero hay que probarlo).

- [x] El backend consulta el pago real ante **cualquier** estado con `payment.id` — con tarjeta sin
  fondos el endpoint devuelve `REJECTED` (con `statusDetail`), nunca `FINISHED`. Verificado en vivo.
- [x] `FINISHED` sin `payment.id` es **indeterminado**, no cobrado (`UNKNOWN`); el deadline lo pone
  el servidor (`expires_at`). **Ante la duda, NO cobrado.**
- [x] Se verifica que el monto aprobado coincida con el total del carrito (Posnet **y** QR).
- [x] La cajera lee el motivo real del rechazo (mapa de `status_detail`; rechazo ≠ cancelación).
- [x] `POST /api/orders` con método no-efectivo **exige prueba de pago y la valida server-side**
  (422 `PAYMENT_PROOF_REQUIRED` / 409 `PAYMENT_REJECTED`|`PAYMENT_UNVERIFIED`; el intent de Point se
  persiste en `mp_orders` con `type='point'` y la `Order` liga `mp_order_id`/`mp_payment_id`).
  Invariante además como CHECK en la base: `cobrado ⇒ efectivo ∨ mp_order_id`.
- [x] La impresión del ticket cuelga del cobro verificado, no de `isStaffOrder` (y `reprint` bloquea
  `pendiente_de_cobro`).
- [x] El polling del Posnet tiene deadline (server-side + corte local de defensa).
- [x] Se corrigen las dos afirmaciones falsas de la doc (`docs/mp/api-point-devices.md` y
  `cobro-posnet-mercadopago.md`).
- [ ] **Gate físico** (único pendiente para `done`): tarjeta sin fondos contra el Posnet real → la UI
  muestra el rechazo, no imprime ticket ni crea pedido; y el camino feliz de $15 → ticket OK.

📁 Spec: [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md)
(`in-progress`). Riesgo asociado: **R27**. **Implementado el 2026-07-22** (backend + frontend +
tests + migraciones + push a Cloud verificado de punta a punta con un cierre de noche real). El
alcance es **solo la venta de caja**: el defecto gemelo de `/carta` quedó fuera y se difirió a la
Fase 7 como **R28**.

---

## Remediación de la integración Mercado Pago 🔧 *(en progreso, 2026-07-22)*

**Origen**: el 2026-07-17 entró a `develop` la integración completa de MP (OAuth, provisioning, QR,
webhooks) + sesiones de caja, **sin revisión**. Una auditoría en profundidad encontró **12 defectos
altos**: cobros duplicables, la caja dependiendo de Supabase Cloud para cobrar, cobros MP invisibles
en la conciliación, y la caja bloqueándose sola. No era desplegable en el boliche.

📁 Docs: [`specs/mercadopago/`](./specs/mercadopago/) + [`plans/mercadopago/`](./plans/mercadopago/)
(y la doc de referencia de la API en [`docs/mp/`](./mp/) y [`docs/fases-mp/`](./fases-mp/)).

**Spec** (fuente de verdad, con los 6 entregables y sus criterios):
[`remediacion-integracion-mp.md`](./specs/mercadopago/remediacion-integracion-mp.md).
Contexto: [`integracion-mp.md`](./specs/mercadopago/integracion-mp.md) (arquitectura de alto nivel)
y [`cobro-posnet-mercadopago.md`](./specs/mercadopago/cobro-posnet-mercadopago.md) (cobro Posnet).
Log de deuda encontrada durante la implementación:
[`deuda-remediacion-mp.md`](./plans/mercadopago/deuda-remediacion-mp.md); plan original:
[`plan-implementacion-mp.md`](./plans/mercadopago/plan-implementacion-mp.md).

| PR | Contenido | Estado |
|---|---|---|
| 1 | Suite de tests en verde + comentarios falsos | ✅ `ba7c113` |
| 2 | **Runner de migraciones** — antes no existía forma de actualizar el schema de una base ya desplegada sin borrarla (bloqueante de producción, independiente de MP) | ✅ `2745f7c` |
| 3 | Integridad del cobro: idempotencia real, timeouts, webhooks durables, constancia de ventas cobradas sin registrar | ✅ `e3f1a29` — **falta el gate**: cobro real con Posnet físico. **Ya no está bloqueado por un tercero** (destrabado el 2026-07-22): falta pasar el lector a modo PDV, asignarle store/POS, apuntar `MP_POS_DEVICE_ID` al lector correcto y correr el test de $15 |
| 4 | **Invertir la dirección del token**: cobrar deja de depender de Supabase Cloud (D1). Cifrado de tokens, modelo single-seller (vincular reemplaza + Desvincular), validación server-side de barra/dispositivo | ⏳ **← SIGUIENTE** |
| 5 | Conciliación: los cobros MP suben a la nube al cerrar la noche | ⏳ pendiente |
| 6 | Sesiones de caja (que hoy se auto-bloquean) + cableado del CRUD de PDVs + docs | ⏳ pendiente |

> 🚨 **Reprioritizado el 2026-07-22: antes del PR 4 va "Cobro verificado"** (sección de arriba,
> R27). El PR 4 evita que la plata vaya a la cuenta equivocada; el bug de cobro verificado hace que
> **la plata no entre en ninguna cuenta y el sistema diga que sí**. Es más grave y más barato de
> arreglar. Lo de abajo queda vigente, pero inmediatamente después.

> 🎯 **Próxima sesión (definido el 2026-07-21): arrancar por el PR 4.** Es el que cierra la fuga
> más peligrosa que dejó a la vista el episodio del Posnet: **hoy hay dos sellers activos y el
> sistema cobra con el "correcto" por casualidad** (R21) — vincular cualquier cuenta nueva la
> dejaría ignorada y la plata seguiría yendo a la vieja en silencio. Con D9 (vincular reemplaza +
> botón Desvincular) eso se vuelve imposible por construcción, y de paso queda el camino limpio
> para migrar a la cuenta del dueño cuando toque.
>
> Antes de codear: **re-verificar los supuestos del PR 4 contra el estado real** — la sección se
> escribió antes de los hallazgos del 21-07 y ya cayó uno: los cobros salen por el nivel 2 OAuth, no
> por el fallback env como asumía el plan. Un segundo supuesto se levantó y se volvió a caer el mismo
> día 22-07: **no** es cierto que el fallback al nivel 3 requiera un token de la misma *aplicación*
> de MP que el lector (R24 refutado). La tarea correspondiente ya está reformulada en la spec como
> **estrategia F1**: degradar distinguiendo las clases de fallo, guarda de **cuenta**, y un preflight
> de solo lectura al boot que mide si el fallback es utilizable y lo muestra en el health y en
> `/admin`.
>
> El bloqueo de titularidad del lector que frenaba los gates físicos de PR 3 y PR 4 **se resolvió el
> 2026-07-22** — ver el bloque de abajo.

> ✅ **Bloqueo de titularidad del Posnet — RESUELTO el 2026-07-22.**
>
> **Qué pasaba** (2026-07-21): el gate del PR 3 (cobro real de $15) estaba frenado por una causa
> mundana — **el Posnet nuevo ya estaba registrado en la cuenta de Mercado Pago del otro
> desarrollador** (Matías Asin, `ASMA4106894` / `logzone@outlook.com`, user `225043369`),
> probablemente de cuando desarrolló la integración. El panel del lector mostraba `log****@outlook.com`
> en el campo **"Cuenta"**; **cerrar sesión no liberaba la titularidad** (el lector figuraba "Sin
> sesión activa" y seguía en esa cuenta), y reconfigurarlo con otra cuenta devolvía *"Tu cuenta no
> tiene permiso para iniciar sesión"*. Entrando como **colaborador** sí se configuraba, pero entonces
> **los cobros entraban a la cuenta del colaborado** — comprobado con un cobro de prueba de $15.
>
> **Cómo se destrabó** (2026-07-22): desde la app de MP, operando como colaborador dentro de la cuenta
> de Matías, se usó la opción **"Eliminar el lector de mi cuenta"** sobre
> `PAX_A910__SMARTPOS1493600985`. Resultado verificado por API (`GET /point/integration-api/devices`):
>
> - Cuenta de Matías (`225043369`): pasó de `total: 2` a `total: 1`. Le queda solo
>   `PAX_A910__SMARTPOS1494025317` (store `83923406`, POS `134012614`, sigue `STANDALONE`).
> - Cuenta de Manuel (`1517393956`): pasó de `total: 0` a `total: 1` — apareció
>   `PAX_A910__SMARTPOS1493600985` con `pos_id: 0`, `store_id: ""` y `operating_mode: STANDALONE`.
>
> O sea: **"Eliminar el lector de mi cuenta" desde un contexto de colaborador transfiere el lector a
> la cuenta personal del colaborador**, no lo deja huérfano. Y **no** lo pone en modo PDV: eso es un
> paso aparte (ver R25 y la feature de Posnets).
>
> **Actualización (2026-07-22, segunda pasada) — los tres pasos manuales ya se hicieron.** Verificado
> contra la API: `PAX_A910__SMARTPOS1493600985` está en `operating_mode: "PDV"`, atado al store
> `85068168` (external `COCKTRAILSUC001`, creado el 22-07 ~02:07 ART) y al POS `135641665`
> (`external_pos_id: COCKTRAILBAR01`), y `MP_POS_DEVICE_ID` **ya apunta a ese lector**. **Qué falta
> para cerrar el gate**: correr el test de $15 — con la salvedad de que **R27 es bloqueante y tiene
> prioridad** (hoy un pago rechazado se registra como venta concretada).
>
> Efecto colateral de este cambio de estado: es lo que refutó R24 — el `MP_ACCESS_TOKEN` de la env,
> que con el lector en STANDALONE devolvía `total: 0`, ahora lo lista sin haber cambiado el token.
>
> **Reglas que deja este episodio** (aplican también a la puesta en producción):
> 1. El **lector y el seller vinculado a Cocktrail tienen que ser de la misma cuenta de MP**.
> 2. La **titularidad manda sobre el login**: entrar como colaborador con tu email no cambia a qué
>    cuenta entra la plata.
> 3. El lector debe estar en **modo PDV**, no STANDALONE, para recibir cobros de un sistema externo.
> 4. **OAuth da permiso sobre una cuenta, no posesión del hardware.** Mercado Pago no expone ningún
>    endpoint para reclamar ni transferir un lector entre cuentas — eso se hace sí o sí desde la app
>    de MP o desde el aparato. Por eso vincular por OAuth **nunca "trae" el Posnet**. Ahora bien, una
>    vez que el lector ya está en la cuenta, el token OAuth sí puede listarlo, pasarlo a PDV, crear
>    store/POS y obtener el QR estático. Conclusión práctica: el flujo ideal ("el dueño vincula su
>    cuenta en `/admin` y configura su Posnet desde ahí") **es alcanzable con un único paso manual
>    irreductible**: que el dueño reclame el lector en su cuenta desde la app de MP.

---

## Feature — Gestión de Posnets desde la app 📟 *(nueva, va ANTES de la Fase 6)*

**Qué pasa**: se descubrió el 2026-07-21, al intentar usar un Posnet nuevo, que **la pantalla de
Posnets del admin es decorativa a los fines de cobrar**. **Demostrado empíricamente el 2026-07-22**:
se hizo un cobro real con el Posnet físico que funcionó perfectamente mientras `/admin → Pagos`
mostraba **"0 Posnets"**, **"No hay Posnets registrados"** y **"Sin Posnet vinculado"**.

**Causa**: el cobro resuelve el dispositivo desde la variable de entorno `MP_POS_DEVICE_ID`
(`mercadopago.service.ts:178`); dar de alta o vincular un Posnet desde `/admin` **solo escribe en
`mercadopago_cajas_devices`, tabla que ningún camino de cobro lee** (verificado: está vacía mientras
el cobro funciona). Consecuencia concreta: **cambiar de Posnet físico obliga a editar un `.env` y
reiniciar el backend** — imposible para el dueño del boliche.

**Restricción irreductible**: **OAuth da permiso sobre una cuenta, no posesión del hardware.** MP no
expone API para reclamar ni transferir un lector entre cuentas. Pero una vez que el lector está en la
cuenta, el token OAuth alcanza para listarlo, pasarlo a PDV, crear sucursal/caja y sacar el QR — o
sea que el flujo objetivo tiene **un único paso manual**: que el dueño reclame el lector desde la app
de MP. Todo lo demás va en `/admin`.

**Modelo objetivo** (decidido el 2026-07-21): la **caja es la unidad estable** (su `external_pos_id`
y su **QR estático no cambian nunca**, el QR está atado al punto de venta en MP, no al hardware); el
**Posnet es hardware reemplazable** colgado de una caja (un device pertenece a una sola caja para
siempre, pero una caja sí puede cambiar de device — el viejo queda histórico, no se borra, y el QR ni
se entera); pueden convivir varios Posnets dados de alta, **uno solo activo por caja**.

- [ ] El cobro resuelve el `deviceId` desde el Posnet vinculado a la caja; `MP_POS_DEVICE_ID` queda
  degradado a **último recurso** y su uso es visible, no silencioso.
- [ ] Listar los Posnets de la cuenta desde la app, poner un lector en **modo PDV** desde la app, y
  que `operating_mode` refleje el valor **real** de MP (R25).
- [ ] Vincular / cambiar / desvincular un Posnet desde `/admin`, sin tocar el QR estático.
- [ ] **Panel de salud de la vinculación** (R23): seller único y activo · lector en la misma cuenta ·
  lector en PDV · caja provisionada en la cuenta activa. Más el estado del **fallback de emergencia**
  (R24): si el `MP_ACCESS_TOKEN` de la env es de la misma **cuenta** que el lector y si efectivamente
  lo ve en `GET /point/integration-api/devices` — el preflight lo calcula en el PR 4 (estrategia F1),
  acá se muestra como una fila más.
- [ ] Sin prefijo de modelo hardcodeado, nombre de sucursal real (hoy es el literal `"Bosko"`), y
  "Test $15" contra el Posnet de la fila con su resultado visible.

📁 **Spec**: [`specs/mercadopago/gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md)
(`draft`, 2026-07-22) — **fuente de verdad de esta feature**. Riesgos asociados: **R23**, **R24**,
**R25** (y detecta R21/R22). Plan y tareas pendientes.

> **Relación con la remediación**: el PR 6 de
> [`remediacion-integracion-mp.md`](./specs/mercadopago/remediacion-integracion-mp.md) cablea la
> pantalla de PDVs; esta feature le da la funcionalidad que hoy no existe. Conviene hacerlas juntas o
> esta inmediatamente después. Con
> [`cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md) no se pisan, pero ambas tocan
> `mercadopago.service.ts` — coordinar si se hacen en paralelo.
> **Va antes de la Fase 6** porque entregar un producto empaquetado donde cambiar un Posnet exige
> editar un archivo de configuración por SSH no es entregable.

### Procedimiento — migrar el Posnet a la cuenta del boliche *(acordado el 2026-07-22)*

Las pruebas se hacen con la cuenta de Manuel (`1517393956`). Cuando llegue el momento de producción,
el procedimiento es:

1. Sacar el lector de la cuenta de Manuel con la misma opción **"Eliminar el lector de mi cuenta"**.
2. **El dueño lo reclama desde SU cuenta** en la app de MP (paso manual irreductible — MP no expone
   API para transferir hardware, ver regla 4 del episodio de titularidad).
3. El dueño **vincula su cuenta por OAuth** en `/admin`.
4. Se **desvinculan los sellers viejos** (el botón "Desvincular" del PR 4).
5. Se **re-provisiona local/caja**, y **el QR estático CAMBIA**: si ya se imprimió, hay que
   reimprimirlo. Esto es exactamente R22.

> ⚠️ **Supuesto pendiente de verificar antes de la puesta en producción**: si un OAuth iniciado por un
> **colaborador** genera token de la cuenta del colaborador o de la del negocio. Hay que probarlo — de
> eso depende que el paso 3 haga lo que se espera.

> 🧹 **Datos del boliche real provisionados en la cuenta equivocada** (verificado el 2026-07-22): el
> store **"Bosko"** (`84800158`, `external_id=BOSKO`, Av. Corrientes 1000, La Plata, creado el
> 2026-07-15) está en la cuenta de **Matías** (`225043369`), no en la de Manuel (ahí da 404).
> "Bosko/Bósko" es el nombre del boliche real al que va a ir la plata en producción — o sea que hay
> datos del boliche real provisionados en la cuenta del otro desarrollador. Además, la pantalla del
> propio aparato mostraba un negocio "Bósko" y un nombre **"Mole"** que **no existe** como store ni
> como POS en ninguna de las dos cuentas conocidas — queda sin explicación y anotado como tal, no se
> adivina de dónde sale.

---

## Fase 6 — Empaquetado y producto 📦

**Objetivo**: que la **PC del boliche arranque el sistema sola al prenderse** y la tablet entre por la
red, sin que nadie instale Docker ni Node ni levante nada a mano (ver "Topología del deploy" más abajo).

📁 Docs: [`specs/06-empaquetado/`](./specs/06-empaquetado/) —
[`empaquetado-windows.md`](./specs/06-empaquetado/empaquetado-windows.md) (`draft`), con
[plan](./plans/06-empaquetado/2026-07-13-empaquetado-windows-design.md).

> 🔑 **Decisión clave (bloqueante del empaquetado): sacar Docker.**
> Hoy el stack corre con `docker compose` (Postgres + PostgREST + Kong). **Node sí se puede *embeber***
> en el ejecutable (Node SEA / Tauri / Electron), pero **Docker NO se empaqueta**. Para el doble-click
> hay que reemplazar el Docker por un **Postgres embebido**: un binario que la app arranca sola
> (p.ej. `embedded-postgres`) o un shell **Tauri/Electron** con Postgres como *sidecar*.
>
> **Implicancia**: en modo empaquetado, **Kong + PostgREST + las demo keys pasan a ser descartables**
> (solo emulan la "puerta apikey" de Supabase cloud); localmente se le habla a Postgres directo. El
> stack Docker actual sigue sirviendo para el test en LAN ahora y para que el esquema cloud matchee.
>
> **Ojo**: para *probar en el boliche* NO hace falta esperar al empaquetado — se hace el setup una sola
> vez en la PC y la tablet entra por navegador a la IP de la LAN. El empaquetado es para el producto.
>
> **Insumo ya resuelto**: el **runner de migraciones** (PR 2 de la remediación MP) era prerrequisito de
> esta fase — sin él no había forma de actualizar una instalación desplegada sin borrarle los datos.

- [ ] Elegir shell de empaquetado (Tauri vs Electron vs Node SEA + binarios).
- [ ] **App "doble-click"** = Node embebido + Postgres embebido (sin Docker).
- [ ] Integrar la impresora térmica (Fase 1) dentro del paquete.
- [ ] Multi-tenant (slug por boliche) + RLS en Supabase.

### Dejar la base limpia antes de entregar

Resuelto: `pnpm --filter cocktrail-api db:reset` (local/cloud, confirmación tipeada para cloud) y
auto-seed de historial demo sacado del boot. Ver `apps/api/src/scripts/reset-data.ts`.

- [ ] Correr `db:reset --target=cloud` recién el día de la entrega real (no antes, para no perder
  datos de prueba útiles mientras se sigue developeando).

### Topología del deploy: PC servidor + tablet operativa *(corregido 2026-07-21)*

> ⚠️ **Corrección**: una versión previa de esta sección decía que el boliche tenía "una sola tablet,
> sin mini-PC", y que admin/caja se operarían desde la misma compu que corre el servidor. **Es falso.**
> El modelo real, confirmado por el dueño del proyecto, es el de abajo.

**Modelo real del local:**

- **Una PC** en el boliche corre el sistema empaquetado. Se prende y **arranca el servidor sola**,
  sin que nadie la toque: nadie opera sobre esa máquina, es infraestructura. (Requisito directo para
  la Fase 6: el paquete tiene que registrarse como servicio de arranque del SO.)
- **Una tablet** es la superficie de uso diario: **`/caja` y `/admin`** se operan desde ahí (cobrar,
  y también abrir/cerrar la noche y ver reportes). Llega al servidor por la **LAN**.

**Consecuencias que esto impone** (y que la versión vieja subestimaba, porque asumía que todo corría
en `localhost`):

- El acceso por red **deja de ser opcional**: si la tablet no encuentra al servidor, el local no
  cobra. Hostname estable y IP fija pasan de "pulido de UX" a **requisito operativo**.
- Los accesos "app mode" en la PC pierden sentido — nadie usa esa máquina.

- [ ] **Hostname estable en vez de IP** (requisito, no pulido): `avahi-daemon` (mDNS) en la PC para
  responder a `cocktrail.local`, **más reserva de IP fija por DHCP** en el router como red de
  seguridad si el mDNS falla o la tablet no lo resuelve.
- [ ] **PWA instalable en la tablet**: `manifest.json` + íconos en `apps/web` para que "Agregar a
  pantalla de inicio" deje un ícono real (`display: standalone`, sin barra de direcciones) en vez de
  un bookmark. La cajera toca el ícono y entra a `/caja` a pantalla completa.
- [ ] **Modo kiosco en la tablet (opcional)**: apps tipo "Fully Kiosk Browser" (Android) para que la
  tablet arranque directo en `/caja` sin que nadie tenga que tocar nada.
- [ ] **Arranque desatendido del servidor**: la PC debe levantar el stack al bootear y **nunca entrar
  en suspensión/hibernación** durante el turno. Verificar también qué pasa tras un corte de luz
  (¿arranca sola al volver la corriente? — configuración de BIOS/UEFI).

**Requisitos mínimos de la PC** (el stack Docker está recortado a `db` + `rest` + `kong`, no es el
Supabase completo, así que el piso es bajo): CPU x86_64 dual-core (~1.8GHz, ej. Intel N100/Celeron),
4GB RAM mínimo (8GB recomendado), SSD 64GB+ (evitar HDD/eMMC por las escrituras de Postgres), Linux
(Debian/Ubuntu). Con una tablet sola la carga concurrente es mínima.

---

## Fase 7 — Pedido online "en la web" 🌐 *(lo último de lo último)*

**Objetivo**: que el cliente pueda pedir desde internet (fuera de la LAN del local), reciba su ticket
online, y ese pedido aparezca en la barra local y se reconcilie al cerrar la caja.

- [ ] Definir el path cloud del pedido online (¿se sirve `/carta` + `/pedido/[token]` desde la nube?).
- [ ] **Sync bidireccional**: pedidos creados en la nube → bajan a la barra local (hoy el sync sube; falta el camino inverso para órdenes online).
- [ ] Auth de la zona cloud (las cookies HMAC LAN no sirven cross-origin contra un host cloud).
- [ ] Reconciliación de tragos online al **cerrar la caja** (juntar lo online con lo presencial en el resumen de la noche).
- [ ] Mercado Pago **online** (Checkout Pro / QR / Bricks) además del Point físico — usar el plugin oficial de MP (ver `docs/AGENTS.md`). Incluye el QR real (Orders API, ver R14) que el Posnet físico no puede mostrar.
- [ ] **Rediseñar el canje en `/barra`**: el rol `barman` se retiró (2026-07-13, decisión: solo
  `admin`/`caja`), así que ya no hay "acceso rápido de barman" para reactivar. Al encarar esta fase
  hay que decidir de nuevo quién/cómo canjea el ticket en barra (¿caja lo hace desde `/caja`?, ¿un
  código de local compartido sin login?, ¿se recupera un rol dedicado?) y verificar E2E el flujo
  completo (pedido online → ticket en el celular → canje en `/barra` → reconciliación).
- [ ] **Separar "cómo piensa pagar el cliente" de "cómo se cobró" en los totales de la noche** (R28).
  `computeTotals` (`apps/api/src/shared/utils/totals.ts:32-40`) agrega por `paymentMethod` **sin
  mirar ningún estado de cobro**, y en un pedido de `/carta` ese campo es una *intención*
  (`apps/web/src/app/carta/page.tsx:48,215`, default `"qr"`), no un cobro que ya pasó. Resultado: un
  pedido creado desde `/carta` **suma a la facturación de la noche sin que haya entrado un peso**.
  Hoy no hace daño porque `/carta` está fuera de validación (ver la nota de la fase actual) y nadie
  crea pedidos por ahí, pero se vuelve real en el minuto uno del pedido online. El arreglo va acá
  porque depende del rediseño del flujo digital del cliente: el esquema ya deja lugar para eso
  (`orders.payment_status`, con `pendiente_de_cobro` reservado para esta fase). Hallazgo original en
  [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md).

---

## Backlog / más adelante

- [ ] Métricas avanzadas (hora pico, ticket promedio).
- [ ] Edición de carta avanzada, fidelidad/puntos, propinas.

---

## Riesgos / deuda técnica conocida

Solo quedan acá los riesgos **abiertos**. Los resueltos (R1-R7, R9, R10, R12, R13) se sacaron de
esta tabla — el detalle de cada resolución está en la spec correspondiente o en el historial de
git.

> Los riesgos R17-R26 salieron de la auditoría, de la implementación de la remediación MP y de la
> verificación contra la API real de Mercado Pago (21 y 22-07). **R27 salió de un cobro real fallido
> el 22-07 y es el único bloqueante duro de producción hoy.** R28 salió del análisis de R27 y está
> **diferido a la Fase 7**, no abierto. El
> inventario **completo** de deuda encontrada (con file:line y contexto) vive en
> [`docs/plans/mercadopago/deuda-remediacion-mp.md`](./plans/mercadopago/deuda-remediacion-mp.md); acá suben solo los que
> tienen impacto transversal o de seguridad.

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R8 | La impresora térmica **no reporta "sin papel"** — verificado en vivo: con el rollo vacío/sin papel, `GET /api/printer/status` sigue devolviendo `connected: true` y la venta marca `printed: true` aunque no salió nada. La impresora no expone protocolo bidireccional confiable (por eso se evitó CUPS), así que el software solo confirma que el device node existe y acepta la escritura, no que el papel esté presente. | La cajera puede creer que el ticket salió cuando en realidad no imprimió nada (papel agotado). | Abierto — mitigación operativa por ahora: revisar visualmente el rollo antes de empezar el turno. Una detección real requeriría lectura de estado bidireccional (fuera de alcance, ver plan técnico de `docs/specs/01-tickets-impresora/impresora-termica.md`). |
| R11 | `pnpm --filter web lint` sobre **todo** `apps/web` reporta errores preexistentes (reglas `react-hooks/refs`, `react-hooks/purity`, `react-hooks/set-state-in-effect` de una versión más estricta de `eslint-plugin-react-hooks`/reglas del React Compiler). Persisten en: `apps/carta/page.tsx`, `LogsSection.tsx`, `AnimatedNumber.tsx`, `Sparkline.tsx`, `Toast.tsx`, `orderStatus.ts`. No es una regresión de ninguna fase — las specs siempre corrieron `eslint` solo sobre los archivos tocados, nunca `eslint .` sobre el árbol completo. | Cosmético/mantenibilidad — no rompe build ni tests, pero el criterio "`eslint` en 0" de las specs nunca se cumplió a nivel repo completo. | En progreso — spec `limpieza-lint-repo` |
| R14 | QR real de Mercado Pago (mostrar un código escaneable, vía la Orders API con `type: "qr"` + `external_pos_id`) no está implementado — confirmado con la doc oficial de MP que el Posnet físico (Point Integration API) no puede mostrar QR en su pantalla; es un producto distinto atado a otra superficie. | Ninguno hoy (se sacó la opción de UI que prometía algo que no existía). Si se quiere QR real hace falta una pantalla nueva donde mostrarlo y probablemente credenciales/config adicionales. | Abierto — ver también Fase 7 ("Mercado Pago online"), que ya cubre esto como feature futura. |
| R15 | `modules/mercadopago` sigue sobre la Payment Intents API (legacy) de Mercado Pago, no la Orders API moderna que MP recomienda para nuevas features. | Ninguno funcional hoy — el flujo probado en producción con el Posnet real sigue andando. Riesgo a futuro si MP deprecara la API legacy. | Abierto — migración deliberadamente no abordada; el flujo actual es el único probado en vivo y migrar el contrato completo no se justificaba en esa iteración. |
| R17 | Los controllers nuevos de `modules/mercadopago` validan a mano con chequeos `typeof` (9 en `mercadopago-provisioning.controller.ts`) en vez de usar el `validate.ts` con zod que ya existe en el repo. | Inconsistencia de patrón y validación más débil/dispersa en los endpoints de cobro. | Abierto — refactor transversal, deliberadamente diferido en la remediación por tocar justo los endpoints de cobro sin cerrar ningún criterio. |
| R18 | **Las 8 tablas legacy son escribibles por el rol anónimo**: `20240101000000_schema.sql:69` y `20240102000000_edge_sync.sql:47` hacen `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role`. Las tablas nuevas de MP sí revocan `anon` una por una; las viejas (`night_events`, `orders`, `tickets`, `drinks`, `users`, `app_config`, `audit_logs`, `cash_sales`) no. | **Seguridad**: cualquiera con la `anon key` pública y acceso a la LAN puede escribir/borrar pedidos, tickets y usuarios vía PostgREST. Hoy acotado a la red local del boliche; sería crítico si el stack se expusiera. | Abierto — el criterio E de la remediación solo cubrió las tablas nuevas. Descubierto el 2026-07-21 al implementar el runner de migraciones. |
| R19 | **No existe ligadura entre `mp_orders` y los pedidos de dominio (`orders`)**, y los cobros con **Posnet no dejan fila en `mp_orders`** (solo los de QR). | La conciliación "cobro cobrado sin pedido registrado" es manual, y el push a la nube del PR 5 solo va a ver los cobros por QR — el débito con Posnet, que es el medio real de uso hoy, queda afuera del criterio C. | Abierto — candidato a resolverse junto con el PR 5 de la remediación. |
| R20 | El reintento de una "venta cobrada sin registrar" (constancia del PR 3) puede **crear un pedido duplicado**: `POST /api/orders` no tiene idempotencia propia, así que si el registro llegó al servidor pero se perdió la respuesta, el reintento inserta un segundo pedido. | La cajera podría generar dos pedidos para un solo cobro al usar el botón "Reintentar". Preferible a perder la venta (el trade-off se tomó a conciencia), pero hay que cerrarlo. | Abierto — la solución es llevar la misma semilla de idempotencia a `orders`. |
| R21 | **Hoy hay dos sellers de Mercado Pago activos** en Cloud (la cuenta de prueba de Manuel y la del otro desarrollador). `findFirstActive()` toma el **más viejo**, y da la casualidad de que el más viejo es el correcto. | Si se vincula otra cuenta, el sistema puede **cobrar con la cuenta equivocada en silencio** — la plata iría a otro. Verificado en vivo el 2026-07-21. **Actualización 2026-07-22**: tras la transferencia del lector, el seller que gana por `created_at ASC` (Manuel, `1517393956`) **casualmente sí es el dueño del lector** — o sea que la coincidencia se sostiene, pero **sigue siendo por casualidad**, no por diseño. | Abierto — lo cierra el PR 4 de la remediación (D9: vincular reemplaza + botón Desvincular). |
| R22 | **Cambiar de cuenta de Mercado Pago deja huérfanas las cajas ya provisionadas.** `mercadopago_cajas` estampa `seller_user_id` y su `store_id`/`pos_id_mp` viven **dentro de la cuenta de ese seller**, pero no existe ninguna lógica de re-provisión ni de limpieza cuando se vincula otra cuenta (verificado: nadie llama a `cajasRepo.deleteById` por cambio de seller). | Al migrar a la cuenta del dueño, la caja y **el QR estático quedan apuntando a un punto de venta de la cuenta vieja**. Hay que re-provisionar a mano, y **el QR cambia** — si ya se imprimió, hay que reimprimirlo. | **Ya se materializó** (verificado el 2026-07-22, no es hipotético): existe un POS "Barra VIP" con `external_id=COCKTRAILBAR01` **en las dos cuentas a la vez** (Manuel `135641665` y Matías `135485560`), más un tercero con `external_id=BARRAVIP` (POS `135344264`) dentro del store "Bosko" de Matías. El provisioning de Cocktrail corrió contra cuentas distintas en momentos distintos y nadie limpió nada. Resolver junto con el PR 4 (que es el que cambia la cuenta); la **detección** de cajas huérfanas y el **aviso previo de que el QR cambia** son de [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloque H). El procedimiento de migración está más arriba, en la sección de gestión de Posnets. |
| R23 | **El sistema no detecta ni avisa cuando la vinculación de MP quedó incoherente**: seller de una cuenta y lector de otra, lector en modo STANDALONE en vez de PDV, o caja provisionada en una cuenta que ya no es la activa. El cobro simplemente falla con un error de MP. | Diagnosticar el problema del 2026-07-21 llevó horas de consultas manuales a la API. En producción, un sábado a la noche, eso es la caja parada sin saber por qué. | Abierto — lo cierra la spec [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloque G): un panel de "salud de la vinculación MP" en `/admin` con los 4 chequeos (seller único activo · lector en la misma cuenta · lector en PDV · caja provisionada en la cuenta activa) lo hace evidente de un vistazo. |
| R24 | **El fallback por `MP_ACCESS_TOKEN` puede no ver el lector, y el sistema no tiene forma de saberlo hasta que falla un cobro.** *(Reformulado el 2026-07-22, segunda pasada.)* La primera formulación decía que **la visibilidad de los devices Point es por aplicación de MP** — con el token del `.env` (app `4126722482739227`, cuenta `1517393956`) `GET /point/integration-api/devices` devolvía `total: 0`, y solo el token OAuth de `MP_APP_ID=2990738606457276` veía el lector. **Eso quedó refutado**: con el **mismo token del `.env`**, sin tocarlo, el listado ahora devuelve `total: 1` con `PAX_A910__SMARTPOS1493600985` en `operating_mode: PDV` (store `85068168`, POS `135641665`). Lo que cambió entre observaciones fue el **estado del device** (de `STANDALONE / pos_id: 0 / store_id: ""` a PDV con store y POS), no la aplicación del token. La [referencia oficial del endpoint](https://www.mercadopago.com.ar/developers/es/reference/integrations_api/_point_integration-api_devices/get) lo describe por **cuenta**, sin mencionar la aplicación. **Sigue abierto**: por qué el token OAuth sí listaba el lector en STANDALONE y el de la env no (aclararlo exige devolver el lector a STANDALONE — prueba destructiva sobre el único aparato), y si el tipo de solución de la aplicación (**"Pagos presenciales"**, requisito de la [doc de Point](https://www.mercadopago.com.br/developers/es/docs/mp-point/create-application)) afecta el `POST` de payment intent aunque el `GET` funcione. | El nivel 3 del `credentials-resolver.service.ts` (`env.MP_ACCESS_TOKEN`) **no está condenado**, pero su utilidad depende de condiciones del entorno que la app hoy no observa: que el token sea de la **misma cuenta** que el lector y que efectivamente lo vea. Peor: si no lo es, el fallo aparece recién al cobrar. Y si el token es de **otra cuenta**, degradar mandaría la plata a otro (se cruza con R21/R22). | Abierto — lo cierra la **estrategia F1** del PR 4 en la [spec de remediación](./specs/mercadopago/remediacion-integracion-mp.md): degradar distinguiendo "no hay seller" de "el seller falló", guarda de cuenta para no cobrar hacia otra, **preflight de solo lectura al boot** (`/users/me` + listado de devices) que deja el estado en `usable`/`unusable`/`unknown`, y exposición en `/api/system/health` + aviso en `/admin`. La fila del **panel de salud** es de [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloque G). La pregunta del `POST` la cierra el modo 3 del gate del PR 4. |
| R25 | **`mercadopago_cajas_devices.operating_mode` miente**: tiene `DEFAULT 'PDV'`, **ningún CHECK**, y **nadie lo sincroniza contra Mercado Pago**. Verificado el 2026-07-22: la tabla local afirma "PDV" mientras el aparato real está en `STANDALONE`. | Un admin mira la pantalla de Posnets, ve "PDV" y cree que el lector está operativo; el cobro falla igual. Es exactamente la clase de dato falso que hace que diagnosticar un problema de cobro lleve horas (ver R23). | Abierto — lo cierra la spec [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloque C): sincronizar el modo real contra MP + poder setearlo por `PATCH .../devices/{id}` desde la app. |
| R26 | **`MP_WEBHOOK_SECRET` está vacía** en `apps/api/.env`, así que `POST /api/mercadopago/webhooks` responde **401 fail-closed** (el fail-closed es correcto y deliberado; lo que falta es el secreto). Verificado el 2026-07-22. | Todo el trabajo de **webhooks durables del PR 3 está inerte en este entorno**. No bloquea el cobro por Posnet (que resuelve por polling del payment intent) pero sí el flujo de **QR**, que depende de la notificación de MP. | Abierto — cargar el secreto en el `.env` del entorno de pruebas y volver a verificar el camino de QR antes de darlo por validado. |
| R27 | 🚨 **El sistema registra como venta concretada un pago que Mercado Pago rechazó.** Reproducido en vivo el 2026-07-22 con una tarjeta sin fondos: MP devolvió `rejected` / `cc_rejected_insufficient_amount` y Cocktrail **imprimió el ticket y creó el pedido**. Causa: el `state` del payment intent describe el **ciclo de vida del intent**, no el resultado del pago — `FINISHED` convive con un pago rechazado. El backend devuelve ese estado crudo (`mercadopago.service.ts:286`) sin consultar nunca el pago real, y el frontend concreta la venta con esa única condición (`useCheckout.ts:298`). La normalización correcta ya existe (`mercadopago.service.ts:30-34`) pero solo se invoca dentro del `if (rawStatus === "CONFIRMATION_REQUIRED")`. Agravantes: el intent del Posnet no se persiste, `Order` no tiene ningún campo de pago (`domain.ts:38-56`), el ticket se imprime según `isStaffOrder` (`orders.service.ts:83`) y el monto aprobado nunca se compara contra el carrito. Los webhooks no lo corrigen (R26 + filtro `type === "order"` + `reconcileFromMp` solo toca `mp_orders`). **El bug nació en la doc**: `docs/mp/api-point-devices.md:93` y `cobro-posnet-mercadopago.md:90-92` lo canonizan como correcto. | **Pérdida de plata directa e invisible**: el boliche entrega producto sin cobrar y la caja no cuadra, sin que nadie se entere hasta el cierre — si se entera. Aplica a **cualquier** rechazo (fondos, límite, tarjeta vencida o robada), no a un caso raro. **Posnet: roto y confirmado empíricamente. QR: sin verificar** (mismo patrón en `useCheckout.ts:367`). | **Abierto — BLOQUEANTE para producción, con prioridad sobre el PR 4 de la remediación.** Spec `draft`: [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md). |
| R28 | **`computeTotals` agrega por `paymentMethod` sin mirar ningún estado de cobro** (`apps/api/src/shared/utils/totals.ts:32-40`). En una venta de caja ese campo dice *cómo se cobró*; en un pedido de `/carta` dice *cómo el cliente piensa pagar* (`apps/web/src/app/carta/page.tsx:48,215`, default `"qr"`) — el cobro todavía no pasó. El mismo campo, dos significados, y los totales de la noche los suman igual. Hallazgo derivado del análisis de R27: es la misma familia de defecto (confundir intención con hecho) por otra vía. | Un pedido creado desde `/carta` **infla la facturación de la noche sin que haya entrado un peso**. **Hoy el impacto real es cero**: `/carta`, el ticket virtual y `/barra` están fuera de validación hasta la Fase 7 y nadie crea pedidos por ahí. Se vuelve daño real en el minuto uno del pedido online. | **Diferido a la Fase 7** (no abierto sin dueño): se resuelve al rediseñar el flujo digital del cliente — ver el bullet en "Fase 7 — Pedido online". Queda **explícitamente fuera del alcance** de [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md), que cubre solo la venta de caja; el esquema que deja esa spec (`orders.payment_status`, con `pendiente_de_cobro` reservado) ya prevé el arreglo. ⚠️ Si se habilita `/carta` antes de la Fase 7, este riesgo pasa a abierto. |
| R16 | Los tests de integración (`apps/api/tests/integration/`) pegan contra el MISMO Supabase local que usa el dev server — no hay una DB de test aislada. `cleanNightEvents()`/`cleanOrders`/etc. en `db-helpers.ts` borran/crean sin acotar a un rango/prefijo de test, a diferencia de `cleanDrinks()`/`cleanUsers()` (ya arregladas con `TEST_DRINK_ID_FLOOR`/`TEST_USERNAME_PREFIX`). | Corriendo la suite de integración repetidas veces en una sesión de desarrollo larga, se acumulan decenas de `night_events`/`orders`/`tickets` de test reales en la base compartida. No hay riesgo de perder catálogo/usuarios reales (ya protegidos), pero sí de ensuciar el Historial de Noches con datos falsos si no se corre `cleanup-empty-nights.ts` después. | Abierto — aplicar el mismo patrón de rango/prefijo de test a `night_events`/`orders`/`tickets`, o directamente provisionar una segunda instancia local de Supabase dedicada a tests. |

---

## Cómo trabajamos (SDD nativo)

Para features nuevas usamos **Spec-Driven Development nativo** (sin herramientas externas):
1. `brainstorming` (skill) para explorar el intent.
2. `/spec` → escribe la spec en `docs/specs/<feature>.md` (el *qué* y el *por qué*).
3. `/plan` → plan técnico sobre esa spec.
4. `/tasks` → checklist accionable.
5. Implementar (Plan Mode de Claude Code para los cambios grandes).

Las specs nacen en la raíz de `docs/specs/` y se archivan en la subcarpeta de su fase cuando la
fase cierra (mismo criterio para los planes en `docs/plans/`).

Ver [`docs/specs/README.md`](./specs/README.md) y los comandos en `.claude/commands/`.
