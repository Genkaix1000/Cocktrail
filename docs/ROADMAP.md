# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Las fases/features cerradas sin nada pendiente se resumen en 1-3 líneas acá — el detalle
> completo (qué se hizo, por qué, cómo se verificó) queda en su spec bajo
> [`docs/specs/`](./specs/README.md), organizada por fase (`01-tickets-impresora/`,
> `02-auditoria-api/`, …). Los planes técnicos correspondientes viven en `docs/plans/` con
> las mismas subcarpetas. Cada sección de abajo linkea su carpeta y sus documentos.
> Última actualización: 2026-07-21.

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

## Remediación de la integración Mercado Pago 🔧 *(en progreso, 2026-07-21)*

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
| 3 | Integridad del cobro: idempotencia real, timeouts, webhooks durables, constancia de ventas cobradas sin registrar | ✅ `e3f1a29` — **falta el gate**: cobro real con Posnet físico (bloqueado, ver abajo) |
| 4 | **Invertir la dirección del token**: cobrar deja de depender de Supabase Cloud (D1). Cifrado de tokens, modelo single-seller (vincular reemplaza + Desvincular), validación server-side de barra/dispositivo | ⏳ pendiente |
| 5 | Conciliación: los cobros MP suben a la nube al cerrar la noche | ⏳ pendiente |
| 6 | Sesiones de caja (que hoy se auto-bloquean) + cableado del CRUD de PDVs + docs | ⏳ pendiente |

> 🟡 **Bloqueo actual (2026-07-21) — titularidad del Posnet, NO es la cuenta del dueño.** El gate del
> PR 3 (cobro real de $15) está frenado por una causa mundana: **el Posnet nuevo ya estaba registrado
> en la cuenta de Mercado Pago del otro desarrollador** (Matías Asin, `ASMA4106894` /
> `logzone@outlook.com`), probablemente de cuando desarrolló la integración. **No hace falta esperar
> a la cuenta del dueño del boliche para destrabarlo.**
>
> Diagnóstico verificado por API y en el panel de MP:
>
> - En el panel del lector, el campo **"Cuenta"** muestra `log****@outlook.com` → la **titularidad**
>   es de esa cuenta, y está asignado a su caja "Local - QR #1".
> - **Cerrar sesión no libera la titularidad**: el lector aparece "Sin sesión activa" y aun así sigue
>   figurando en esa cuenta. Por eso, al reconfigurarlo con otra cuenta, MP responde *"Tu cuenta no
>   tiene permiso para iniciar sesión — Podés ingresar usando una cuenta vinculada a este
>   establecimiento"*.
> - Como Manuel es **colaborador** de esa cuenta (con su mismo email), el lector sí se configura
>   desde ese contexto — pero entonces **los cobros entran a la cuenta del colaborado**. Comprobado:
>   un cobro de prueba de $15 quedó registrado en las ventas de esa cuenta.
> - Estado al momento: los **dos** lectores (`…1494025317` y `…1493600985`) están en esa cuenta, en
>   modo **STANDALONE**; la cuenta de prueba de Manuel quedó con **cero** lectores.
>
> **Salida**: que el otro desarrollador **dé de baja el lector de su cuenta** (o el trámite de cambio
> de titularidad de MP). Liberado el aparato, se reclama desde el menú del equipo con la cuenta que
> corresponda y se cierra el gate.
>
> **Reglas que deja este episodio** (aplican también a la puesta en producción):
> 1. El **lector y el seller vinculado a Cocktrail tienen que ser de la misma cuenta de MP**.
> 2. La **titularidad manda sobre el login**: entrar como colaborador con tu email no cambia a qué
>    cuenta entra la plata.
> 3. El lector debe estar en **modo PDV**, no STANDALONE, para recibir cobros de un sistema externo.

---

## Feature — Gestión de Posnets desde la app 📟 *(nueva, va ANTES de la Fase 6)*

**Por qué existe esta entrada**: se descubrió el 2026-07-21, al intentar usar un Posnet nuevo, que
**la pantalla de Posnets del admin es decorativa a los fines de cobrar**. El cobro resuelve el
dispositivo desde la variable de entorno `MP_POS_DEVICE_ID` (`mercadopago.service.ts:178`); dar de
alta o vincular un Posnet desde `/admin` **solo escribe en una tabla que ningún camino de cobro
lee**. Consecuencia concreta y verificada: **cambiar de Posnet físico obliga a editar un `.env` y
reiniciar el backend** — imposible para el dueño del boliche.

La spec de remediación contempló los *síntomas* (que el botón de prueba apunta al device equivocado,
que el CRUD de PDVs está sin cablear, que `x-device-id` no se valida) pero **no la causa**: no existe
el camino "device vinculado en la base → el cobro va a ese device".

**Modelo objetivo** (decidido el 2026-07-21):

- **La caja (PDV) es la unidad estable.** Su `external_pos_id` y su **QR son estáticos y no cambian
  nunca** — el QR vive en `mercadopago_cajas.qr_image`, atado al punto de venta en MP, **no al
  hardware**. Esto es lo que ancla la auditoría y lo que el cliente escanea.
- **El Posnet es hardware reemplazable colgado de una caja.** Un dispositivo se vincula a **una sola
  caja y no se mueve entre cajas** (preserva la trazabilidad de los cobros históricos), pero **una
  caja sí puede cambiar de dispositivo**: si el aparato se rompe o lo reemplazan, se vincula el nuevo
  a la misma caja, el anterior queda desvinculado e histórico (no se borra) y **el QR ni se entera**.
- Pueden convivir **varios Posnets dados de alta** (p.ej. uno de backup), pero **uno solo activo por
  caja**. El cobro resuelve el dispositivo desde la caja; `MP_POS_DEVICE_ID` queda como fallback.

- [ ] El cobro (`createPaymentIntent`) resuelve el `deviceId` desde el Posnet vinculado a la caja,
  con la env como fallback. Hoy la env es la única fuente.
- [ ] Vincular / cambiar / desvincular un Posnet desde `/admin`, con el invariante "un device pertenece
  a una caja para siempre" y "una caja tiene a lo sumo un device activo".
- [ ] **Listar los Posnets de la cuenta de MP** (`GET /point/integration-api/devices`): hoy la app
  consulta ese endpoint dos veces pero siempre filtra por un ID conocido y descarta el resto, así que
  **no hay forma de descubrir el ID de un aparato nuevo desde la app** — hay que sacarlo del equipo o
  del panel de MP. Un endpoint que exponga la lista resolvería el alta a ciegas.
- [ ] Quitar el prefijo hardcodeado `PAX_A910__SMARTPOS` del formulario de alta (`PagosSection.tsx:151`):
  hoy solo se puede registrar ese modelo.
- [ ] El botón "Test $15" debe disparar al Posnet de la fila, no siempre al de la env (ya estaba como
  criterio G de la remediación, PR 6).

📁 Docs: sin spec propia todavía — el contexto está en
[`specs/mercadopago/`](./specs/mercadopago/) (PR 6 de
[`remediacion-integracion-mp.md`](./specs/mercadopago/remediacion-integracion-mp.md)).

> **Relación con la remediación**: el PR 6 de la spec de MP cablea la pantalla de PDVs; esta feature
> le da la funcionalidad que hoy no existe. Conviene hacerlas juntas o esta inmediatamente después.
> **Va antes de la Fase 6** porque entregar un producto empaquetado donde cambiar un Posnet exige
> editar un archivo de configuración por SSH no es entregable.

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

---

## Backlog / más adelante

- [ ] Métricas avanzadas (hora pico, ticket promedio).
- [ ] Edición de carta avanzada, fidelidad/puntos, propinas.

---

## Riesgos / deuda técnica conocida

Solo quedan acá los riesgos **abiertos**. Los resueltos (R1-R7, R9, R10, R12, R13) se sacaron de
esta tabla — el detalle de cada resolución está en la spec correspondiente o en el historial de
git.

> Los riesgos R17-R21 salieron de la auditoría y de la implementación de la remediación MP. El
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
| R21 | **Hoy hay dos sellers de Mercado Pago activos** en Cloud (la cuenta de prueba de Manuel y la del otro desarrollador). `findFirstActive()` toma el **más viejo**, y da la casualidad de que el más viejo es el correcto. | Si se vincula otra cuenta, el sistema puede **cobrar con la cuenta equivocada en silencio** — la plata iría a otro. Verificado en vivo el 2026-07-21. | Abierto — lo cierra el PR 4 de la remediación (D9: vincular reemplaza + botón Desvincular). |
| R22 | **Cambiar de cuenta de Mercado Pago deja huérfanas las cajas ya provisionadas.** `mercadopago_cajas` estampa `seller_user_id` y su `store_id`/`pos_id_mp` viven **dentro de la cuenta de ese seller**, pero no existe ninguna lógica de re-provisión ni de limpieza cuando se vincula otra cuenta (verificado: nadie llama a `cajasRepo.deleteById` por cambio de seller). | Al migrar a la cuenta del dueño, la caja y **el QR estático quedan apuntando a un punto de venta de la cuenta vieja**. Hay que re-provisionar a mano, y **el QR cambia** — si ya se imprimió, hay que reimprimirlo. | Abierto — resolver junto con el PR 4 (que es el que cambia la cuenta) o con la feature de gestión de Posnets. |
| R23 | **El sistema no detecta ni avisa cuando la vinculación de MP quedó incoherente**: seller de una cuenta y lector de otra, lector en modo STANDALONE en vez de PDV, o caja provisionada en una cuenta que ya no es la activa. El cobro simplemente falla con un error de MP. | Diagnosticar el problema del 2026-07-21 llevó horas de consultas manuales a la API. En producción, un sábado a la noche, eso es la caja parada sin saber por qué. | Abierto — un chequeo de "salud de la vinculación MP" en `/admin` (seller único activo · lector en la misma cuenta · lector en PDV · caja provisionada en la cuenta activa) lo haría evidente de un vistazo. |
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
