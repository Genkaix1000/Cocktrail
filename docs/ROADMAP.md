# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Las fases/features cerradas sin nada pendiente se resumen en 1-3 líneas acá — el detalle
> completo (qué se hizo, por qué, cómo se verificó) queda en su spec bajo
> [`docs/specs/`](./specs/README.md), organizada por fase (`01-tickets-impresora/`,
> `02-auditoria-api/`, …). Los planes técnicos correspondientes viven en `docs/plans/` con
> las mismas subcarpetas. Cada sección de abajo linkea su carpeta y sus documentos.
> Última actualización: 2026-07-23.

---

## 🧭 Dónde estamos y qué sigue *(2026-07-23)*

**En una línea**: el cobro con Posnet físico funciona de punta a punta, **la venta se concreta
solo si Mercado Pago confirmó el cobro** (`cobro-verificado` `done`), **cobrar ya no depende de
Supabase Cloud** (PR 4 cerrado, gate físico en sus dos modos) y **el Posnet ya se gestiona desde
`/admin`** (`gestion-posnets` código completo — pendiente solo el gate físico). Lo que sigue:
**cerrar el gate físico de gestión-posnets**, luego **PR 5** (conciliación) y **Fase 6**
(empaquetado).

### Bloques cerrados (punteros — el detalle vive en cada spec)

- **`cobro-verificado`** ✅ `done` (2026-07-22) → [spec](./specs/mercadopago/cobro-verificado.md). Cerró R18/R19/R20/R27.
- **PR 4** de la remediación MP ✅ done (2026-07-22, `db1e31d` + `00e6ac6`) → ver "Remediación". Cerró R21.
- **Titularidad del Posnet** ✅ resuelta (2026-07-22): lector `PAX_A910__SMARTPOS1493600985` en la cuenta propia, colgado de "Barra VIP" (`COCKTRAILBAR01`), en modo PDV → ver "Remediación".
- **`gestion-posnets`** 🟡 código completo (2026-07-23, backend + PR 6 UI + frontend, typecheck/tests verdes) → [spec](./specs/mercadopago/gestion-posnets.md). Cerró R23/R25, mitigó R24, cubrió R22 (detección + reprovision). **Pendiente**: gate físico (T29), E2E manual (T28), verificación real de listado/PATCH (T14) — las hace el dueño con el aparato.

> ⚠️ **Aún sin verificación en vivo**: el cobro por QR (código OK vía polling, `MP_WEBHOOK_SECRET` vacía → R26) y los gates físicos de gestión-posnets.

### Orden de trabajo

| # | Qué | Estado |
|---|---|---|
| 1 | **Cobro verificado** | ✅ `done` (2026-07-22) |
| 2 | **PR 4** de la remediación MP | ✅ done (2026-07-22) |
| 3 | **Gestión de Posnets + PR 6** (misma pantalla) | 🟡 código completo (2026-07-23) — **pendiente gate físico** (T14/T28/T29) |
| 4 | **PR 5** — conciliación / sync | ⏳ pendiente (el intent del Posnet ya se persiste en `mp_orders`, R19 resuelto → hay datos reales para conciliar) |
| 5 | **Fase 6** — empaquetado | ⏳ pendiente |

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
> de Posnets** (sus secciones, más abajo), no esta lista.

---

## Cobro verificado — la venta se concreta solo si MP confirmó el cobro 🚨 *(completa, 2026-07-22)*

✅ **Hecho (2026-07-22)** → [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md)
(`done`, commit `6c48669`). El bug R27: `state=FINISHED` del intent convivía con un pago rechazado y
el sistema registraba la venta igual. Cerrado con veredicto server-side + invariante como CHECK en
la base (`cobrado ⇒ efectivo ∨ mp_order_id`) + **gate físico pasado**. Cerró **R18/R19/R20/R27**.

> Alcance = **solo venta de caja**. El defecto gemelo de `/carta` se difirió a la Fase 7 como **R28** (ver Riesgos).

---

## Remediación de la integración Mercado Pago 🔧 *(en progreso, 2026-07-22)*

**Origen**: el 2026-07-17 entró a `develop` la integración completa de MP (OAuth, provisioning, QR,
webhooks) + sesiones de caja, **sin revisión**. Una auditoría en profundidad encontró **12 defectos
altos**: cobros duplicables, la caja dependiendo de Supabase Cloud para cobrar, cobros MP invisibles
en la conciliación, y la caja bloqueándose sola. No era desplegable en el boliche.

📁 Docs: [`specs/mercadopago/`](./specs/mercadopago/) + [`plans/mercadopago/`](./plans/mercadopago/).

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
| 3 | Integridad del cobro: idempotencia real, timeouts, webhooks durables, constancia de ventas cobradas sin registrar | ✅ `e3f1a29` — **cerrado del todo**: gate físico pasado el 2026-07-22 (cobro real aprobado con el Posnet) |
| 4 | **Invertir la dirección del token**: cobrar deja de depender de Supabase Cloud (D1). Cifrado de tokens, modelo single-seller (vincular reemplaza + Desvincular), validación server-side de barra/dispositivo | ✅ `db1e31d` + `00e6ac6` — **cerrado del todo el 2026-07-22**: gate físico pasado en sus dos modos (ver abajo) |
| 5 | Conciliación: los cobros MP suben a la nube al cerrar la noche | ⏳ pendiente |
| 6 | Sesiones de caja (que hoy se auto-bloquean) + cableado del CRUD de PDVs + docs | 🟡 parcial — cableado de PDVs y docs hechos vía `gestion-posnets` (T19/T26); **queda solo** el fix de sesiones de caja que se auto-bloquean |

> ✅ **PR 4 cerrado el 2026-07-22** (`db1e31d` + `00e6ac6`) — token invertido y **cifrado** en local
> (Cloud solo metadata), single-seller por índice único (cierra R21), botón Desvincular, y **gate
> físico pasado en sus dos modos**: (1) Cloud cortado por `/etc/hosts` → cobro real con el Posnet y
> la nube inalcanzable (D1 funciona); (2) solo `MP_ACCESS_TOKEN` → el nivel 3 del resolver **cobra,
> no solo lista** (cierra la incógnita del tipo de solución de la app en R24). Bug del A12 encontrado
> y arreglado en vivo (`x-bar-id` aceptaba solo `BAR_CODE`, la web manda UUID → 403; fix `00e6ac6`).
> Detalle en el changelog de la [spec de remediación](./specs/mercadopago/remediacion-integracion-mp.md).

> ✅ **Titularidad del Posnet — resuelto el 2026-07-22.** El lector `PAX_A910__SMARTPOS1493600985`
> estaba en la cuenta del otro desarrollador (los cobros entraban ahí); se transfirió a la cuenta
> propia (`1517393956`) con "Eliminar el lector de mi cuenta" y se pasó a **PDV** atado al store
> `85068168` / POS `135641665` (`COCKTRAILBAR01`). **Reglas que deja el episodio** (valen para
> producción): (1) lector y seller vinculado deben ser de la **misma cuenta de MP**; (2) la
> **titularidad manda sobre el login** — entrar como colaborador no cambia a qué cuenta entra la
> plata; (3) el lector debe estar en **PDV**, no STANDALONE; (4) **OAuth da permiso, no posesión** —
> reclamar/transferir un lector se hace sí o sí desde la app de MP (único paso manual irreductible).

---

## Feature — Gestión de Posnets desde la app 📟 *(va ANTES de la Fase 6)*

🟡 **Código completo (2026-07-23) — pendiente gate físico** →
[`specs/mercadopago/gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (**fuente de verdad
de la feature**, con criterios, plan y tareas T1-T29).

**El defecto** (descubierto 21-07, demostrado en vivo 22-07): la pantalla de Posnets era decorativa a
los fines de cobrar — el cobro resolvía el device desde `MP_POS_DEVICE_ID` y `/admin` escribía en
`mercadopago_cajas_devices`, tabla que ningún cobro leía. Cambiar de Posnet obligaba a editar un
`.env` por SSH. **El arreglo**: el device se resuelve **server-side desde la caja**
(`posnet-resolver.service.ts`, env degradada a último recurso observable), modelo de devices
activo/histórico (una caja estable con QR fijo, el Posnet reemplazable), PDV/listado/rename desde la
app, y panel de salud con 4 chequeos (solo el caso grave bloquea). Detalle y arquitectura en la spec
y en [`ARCHITECTURE.md`](./ARCHITECTURE.md) §11.

- Riesgos: cierra **R23**/**R25**, mitiga **R24**, cubre **R22** (detección + reprovision). Detecta R21 (cerrado en PR 4).
- **Pendiente** (lo hace el dueño con el aparato): gate físico **T29**, E2E manual **T28**, verificación real de listado/PATCH **T14**.
- **Va antes de la Fase 6**: entregar un producto donde cambiar un Posnet exige SSH no es entregable.

### Procedimiento — migrar el Posnet a la cuenta del boliche *(acordado el 2026-07-22, aún manual)*

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

Solo quedan acá los riesgos **abiertos**. Los resueltos (R1-R7, R9, R10, R12, R13, R18, R19, R20,
R21, R23, R25, R27) se sacaron de esta tabla — el detalle de cada resolución está en la spec
correspondiente o en el historial de git:

- **R18/R19/R20/R27** → [`cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md).
- **R21** (dos sellers activos) → cerrado por el **PR 4** de la
  [remediación](./specs/mercadopago/remediacion-integracion-mp.md): "vincular reemplaza" + índice
  único parcial que hace imposible tener dos sellers activos, en local y en Cloud.
- **R23** (sin chequeo de salud MP) y **R25** (`operating_mode` miente) → resueltos por
  [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloques G y C: panel de salud con
  4 chequeos + re-sync del modo real contra MP y `PATCH` a PDV desde la app). Código completo el
  2026-07-23; **gate físico T29 pendiente**.

> Los riesgos R17-R26 salieron de la auditoría, de la implementación de la remediación MP y de la
> verificación contra la API real de Mercado Pago (21 y 22-07); de esos, **R21 se cerró (PR 4)** y
> **R23/R25 se resolvieron** (gestión-posnets, código completo) con **R24 mitigado**.
> R28 salió del análisis de R27
> (resuelto el 22-07) y está **diferido a la Fase 7**, no abierto. El
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
| R22 | **Cambiar de cuenta de Mercado Pago deja huérfanas las cajas ya provisionadas.** `mercadopago_cajas` estampa `seller_user_id` y su `store_id`/`pos_id_mp` viven dentro de la cuenta de ese seller; al migrar, la caja y **el QR estático quedan apuntando a un punto de venta de la cuenta vieja**. | Hay que re-provisionar (y **el QR cambia** — si ya se imprimió, reimprimir). **Ya se materializó** (verificado 22-07, no hipotético): el POS "Barra VIP" `external_id=COCKTRAILBAR01` existe **en las dos cuentas a la vez** (Manuel `135641665` y Matías `135485560`), más un `external_id=BARRAVIP` (POS `135344264`) en el store "Bosko" de Matías. | **Parcialmente cubierto** — [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) (bloque H) implementó (código, T22) la **detección** `isOrphan`, la **re-provisión desde `/admin`** y el **aviso previo de cambio de QR**. **Queda**: el gate físico y el **procedimiento manual de migración de cuenta** (arriba, en la sección de gestión de Posnets) — MP no expone API para transferir hardware. |
| R24 | **El fallback por `MP_ACCESS_TOKEN` puede no ver el lector, y el sistema no tenía forma de saberlo hasta que fallara un cobro.** Su utilidad depende de que el token sea de la **misma cuenta** que el lector y que efectivamente lo vea en `GET /point/integration-api/devices` — si es de otra cuenta, degradar mandaría la plata a otro (se cruza con R21/R22). *(La formulación vieja "la visibilidad de devices es por aplicación de MP" quedó refutada el 22-07: con el mismo token de la env, el listado pasó de `total:0` a `total:1` cuando el device pasó a PDV con store/POS — cambió el estado del device, no la app del token.)* | Si el token es de otra cuenta o no ve el lector, el fallo aparecía recién al cobrar. | **Mitigado** — el **preflight F1** del PR 4 (`db1e31d`) lo calcula al boot (`/users/me` + listado, estado `usable`/`unusable`/`unknown`, guarda de cuenta) y la **fila F1 del panel de salud** de [`gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md) lo muestra antes del cobro (bloque G, código completo). Incógnita menor que queda: por qué el token OAuth listaba el lector en STANDALONE y el de la env no — solo se aclara con una prueba destructiva sobre el único aparato, no se va a hacer. |
| R26 | **`MP_WEBHOOK_SECRET` está vacía** en `apps/api/.env`, así que `POST /api/mercadopago/webhooks` responde **401 fail-closed** (el fail-closed es correcto y deliberado; lo que falta es el secreto). Verificado el 2026-07-22. | Todo el trabajo de **webhooks durables del PR 3 está inerte en este entorno**. No bloquea el cobro por Posnet (que resuelve por polling del payment intent) pero sí el flujo de **QR**, que depende de la notificación de MP. | Abierto — cargar el secreto en el `.env` del entorno de pruebas y volver a verificar el camino de QR antes de darlo por validado. |
| R28 | **`computeTotals` agrega por `paymentMethod` sin mirar ningún estado de cobro** (`apps/api/src/shared/utils/totals.ts:32-40`). En una venta de caja ese campo dice *cómo se cobró*; en un pedido de `/carta` dice *cómo el cliente piensa pagar* (`apps/web/src/app/carta/page.tsx:48,215`, default `"qr"`) — el cobro todavía no pasó. El mismo campo, dos significados, y los totales de la noche los suman igual. Hallazgo derivado del análisis de R27: es la misma familia de defecto (confundir intención con hecho) por otra vía. | Un pedido creado desde `/carta` **infla la facturación de la noche sin que haya entrado un peso**. **Hoy el impacto real es cero**: `/carta`, el ticket virtual y `/barra` están fuera de validación hasta la Fase 7 y nadie crea pedidos por ahí. Se vuelve daño real en el minuto uno del pedido online. | **Diferido a la Fase 7** (no abierto sin dueño): se resuelve al rediseñar el flujo digital del cliente — ver el bullet en "Fase 7 — Pedido online". Queda **explícitamente fuera del alcance** de [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md), que cubre solo la venta de caja; el esquema que deja esa spec (`orders.payment_status`, con `pendiente_de_cobro` reservado) ya prevé el arreglo. ⚠️ Si se habilita `/carta` antes de la Fase 7, este riesgo pasa a abierto. |
| R16 | Los tests de integración (`apps/api/tests/integration/`) pegan contra el MISMO Supabase local que usa el dev server — no hay una DB de test aislada. `cleanNightEvents()`/`cleanOrders`/etc. en `db-helpers.ts` borran/crean sin acotar a un rango/prefijo de test, a diferencia de `cleanDrinks()`/`cleanUsers()` (ya arregladas con `TEST_DRINK_ID_FLOOR`/`TEST_USERNAME_PREFIX`). | Corriendo la suite de integración repetidas veces en una sesión de desarrollo larga, se acumulan decenas de `night_events`/`orders`/`tickets` de test reales en la base compartida. No hay riesgo de perder catálogo/usuarios reales (ya protegidos), pero sí de ensuciar el Historial de Noches con datos falsos si no se corre `cleanup-empty-nights.ts` después. **Volvió a morder el 2026-07-22**: correr la suite de integración borró la noche real de la base compartida. | Abierto — aplicar el mismo patrón de rango/prefijo de test a `night_events`/`orders`/`tickets`, o directamente provisionar una segunda instancia local de Supabase dedicada a tests. |

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
