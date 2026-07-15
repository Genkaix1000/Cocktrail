# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Las fases/features cerradas sin nada pendiente se resumen en 1-3 líneas acá — el detalle
> completo (qué se hizo, por qué, cómo se verificó) queda en su spec bajo `docs/specs/`.
> Última actualización: 2026-07-14.

---

## Fase actual — MVP local-first para el boliche de prueba

**Objetivo**: que el sistema funcione completo en una máquina local del boliche (mini-PC/laptop),
sin depender de internet, con caja + reconciliación a la nube al cerrar la noche. El pedido por LAN
(`/carta` + `/barra`) está programado y corre, pero su validación queda para la Fase 7 (ver nota abajo).

**Estado**: completa y validada con datos reales — monorepo pnpm, Supabase local como fuente de
verdad, sync local→cloud, 2 roles (`admin/caja`), Mercado Pago real (Posnet físico), SSE,
impresora térmica, apertura/cierre de noche manual. Flujo caja→cierre→sync validado de punta a
punta el 2026-07-10 (efectivo) y el 2026-07-13 (Posnet físico).

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
"Abrir Noche" pasó a manual con palabra clave obligatoria. Detalle: `docs/specs/impresora-termica.md`.

- [ ] Corte automático de papel — fuera de alcance (comandera sin cuchilla, se corta a mano).

---

## Fase 2 — Auditoría API 🔍 *(completa)*

`apps/api` con tests reales (Vitest+Supertest, 9 módulos, unitarios+integración), 2 hallazgos de
seguridad corregidos (`/api/system/*` sin auth, credencial `cajavip` hardcodeada), `OrderStatus`
colapsado a 3 valores, y deuda estructural resuelta (`emit` inyectado, `auth.service.ts`
partido, `SyncService`/`system.controller.ts` desacoplados). Detalle: `docs/specs/auditoria-api.md`,
`docs/specs/deuda-estructural-fase2.md`.

- [ ] Fuera de alcance de esta fase (sin tests/auditoría todavía): módulos `printer`, `cash-sales`
  (eliminado después, ver Deuda pre-Fase 6), `audit-logs`, `sse`.

---

## Fase 3 — Auditoría Web 🎨 *(completa)*

Los 3 god-components (`AdminClient` 3418→724, `CajaClient` 2182→447, `BarraClient` 1517→863
líneas) modularizados en hooks + subcomponentes con tests de caracterización. Detalle:
`docs/specs/auditoria-web.md`. Hallazgos documentados al cierre — todos resueltos en 3B/3C.

---

## Fase 3B — Auditoría Web: componentes sueltos + deuda de Fase 3 🎨 *(completa)*

22 componentes sueltos auditados (109 tests nuevos), bug real corregido (`CloseNightModal` con
timers sin cancelar podía disparar el cierre real sobre un componente desmontado), y los 5
hallazgos de la Fase 3 resueltos. Detalle: `docs/specs/auditoria-web-componentes.md`. Hallazgos
documentados al cierre — todos resueltos en 3C o en features posteriores.

---

## Fase 3C — Deuda documentada de Fase 3B 🎨 *(completa)*

Servicios de `apps/web/src/services/*.ts` auditados (46 tests), `Toast` compartido, modales
migrados a montaje condicional, god-components de settings partidos, y `CashSaleModal` (feature
muerta, nunca conectada desde el primer commit) eliminada. Detalle:
`docs/specs/fase-3c-deuda-web-componentes.md`.

---

## Feature — `useSSE` centralizado (deuda de Fase 3B) 🔌 *(completa)*

`useEventState` (hook compartido Admin+Caja) reemplaza la duplicación byte-a-byte de reconexión
SSE y `refetch()` entre ambos shells, con 4 hallazgos reales corregidos durante la implementación.
Detalle: `docs/specs/usesse-centralizado.md`.

---

## Feature — Simplificar Dashboard de `/admin` 📊 *(completa)*

Dashboard + Estadísticas fusionados en una sola vista (3 `MetricCard`, Ventas por Hora, Top
Productos, Donut de pagos, Hora Pico, Comparativa), `Ticket Promedio` eliminado de todos lados,
código/tabs muertos sacados. Detalle: `docs/specs/simplificar-dashboard-admin.md`.

---

## Feature — Simplificar Historial de Noches 📉 *(completa)*

De 8 tarjetas + 2 widgets a 3 `MetricCard` + Trago Estrella + un único selector de detalle/
comparación (reemplaza Comparador + tabla paginada + popup). Detalle:
`docs/specs/simplificar-historial-noches.md`.

---

## Feature — Dashboard sin noche abierta + fix torta + detalle de noche 📊 *(completa)*

Sin noche abierta, el Dashboard muestra los datos reales de la última noche cerrada (sin
"-100%" engañoso); la torta de canales ya no pinta colores con total $0; el detalle de una noche
en Historial suma Tickets Emitidos/Top Trago/Duración y no repite el bloque de sesiones cuando
hubo una sola. Detalle: `docs/specs/dashboard-sin-noche-abierta.md`.

---

## Feature — Reemplazar export CSV por PDF profesional 📄 *(completa)*

Un solo botón "Exportar" (Historial de Noches) genera un PDF con `@react-pdf/renderer` (portada
con logo, facturación semanal/mensual, detalle noche por noche) en vez de CSV. Detalle:
`docs/specs/export-pdf-historial.md`.

---

## Fase 4 — E2E post-refactor 🧪 *(deprioritizada, 2026-07-13)*

**Decisión**: no se arranca por ahora — cada feature ya se verificó de punta a punta manualmente/
con `e2e-playwright-tester` al cerrarse, y esa cobertura se considera suficiente por el momento.

- [ ] Definir alcance si se retoma más adelante.

---

## Fase 5 — Pulir UI de caja ⚡ *(completa)*

Cobro en caja más rápido: buscador con autocompletar, atajos de teclado (Enter/1-2-3/Monto
exacto), delay artificial de 800ms sacado. Detalle: `docs/specs/pulir-ui-caja.md`.

---

## Deuda pre-Fase 6 🧹 *(en progreso, 2026-07-13)*

**Objetivo**: cerrar los riesgos/deuda reales documentados en la tabla de Riesgos antes de
arrancar el empaquetado (Fase 6). La Fase 4 (E2E formal) y la Fase 7 (pedido online) quedan
explícitamente afuera de esta ronda.

Resuelto: atomicidad del canje de ticket (R3), hardening de Kong/demo keys (R7), deuda
estructural de Fase 2, restore de emergencia desde Supabase Cloud, `cash_sales` eliminado (feature
muerta, nunca conectada a la UI), `audit_logs` aplicado en cloud (R13), y 15 campos/2 componentes
sin consumidor eliminados de `useAdminAnalytics`/`lib/analytics.ts` (R12). Detalle:
`docs/specs/atomicidad-canje-ticket.md`, `docs/specs/hardening-kong-demo-keys.md`,
`docs/specs/restaurar-backup-desde-cloud.md`.

- [ ] **Limpieza de lint a nivel repo** (R11) → spec
  [`limpieza-lint-repo.md`](./specs/limpieza-lint-repo.md).

---

## Fase 6 — Empaquetado y producto 📦

**Objetivo**: que el dueño abra la app con **doble-click**, sin instalar Docker ni Node ni levantar
nada a mano.

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
> **Ojo**: para *probar en el boliche* NO hace falta esperar al empaquetado — se hace setup una sola
> vez en la mini-PC y todos entran por navegador a la IP de la LAN. El empaquetado es para el producto.

- [ ] Elegir shell de empaquetado (Tauri vs Electron vs Node SEA + binarios).
- [ ] **App "doble-click"** = Node embebido + Postgres embebido (sin Docker).
- [ ] Integrar la impresora térmica (Fase 1) dentro del paquete.
- [ ] Multi-tenant (slug por boliche) + RLS en Supabase.

### Dejar la base limpia antes de entregar

Resuelto: `pnpm --filter cocktrail-api db:reset` (local/cloud, confirmación tipeada para cloud) y
auto-seed de historial demo sacado del boot. Ver `apps/api/src/scripts/reset-data.ts`.

- [ ] Correr `db:reset --target=cloud` recién el día de la entrega real (no antes, para no perder
  datos de prueba útiles mientras se sigue developeando).

### Acceso simple (sin escribir IP/localhost) — surgió al planear el setup con una sola tablet

**Contexto**: el boliche de prueba tiene **una sola tablet** — no hay mini-PC + tablet + laptop
separadas. Admin/caja van a operarse desde la misma compu que corre el servidor; la tablet queda
para `/barra` (o lo que se decida). Escribir `http://<ip>:3000` a mano no es práctico para el uso
diario. Ideas evaluadas, de más simple a más "parece una app" — no bloquean nada, son pulido de UX
de acceso, candidatas para esta fase o para la Fase 5:

- [ ] **Hostname en vez de IP**: `avahi-daemon` (mDNS) en la mini-PC para que responda a
  `cocktrail.local` en vez de una IP que puede cambiar. Complementar con **reserva de IP fija por
  DHCP** en el router para que nunca cambie aunque se desactive el mDNS.
- [ ] **PWA instalable en la tablet**: agregar `manifest.json` + íconos a `apps/web` para que
  "Agregar a pantalla de inicio" deje un ícono real (`display: standalone`, sin barra de
  direcciones) en vez de un bookmark de navegador — toca el ícono y abre a pantalla completa como
  una app nativa.
- [ ] **Accesos directos "app mode" en la PC**: acceso de escritorio con
  `chrome --app=http://localhost:3000/admin` (y otro para `/caja`) — ventana sin barra de URL,
  se puede anclar a la barra de tareas, se siente como programa aparte sin empaquetar nada.
- [ ] **Modo kiosco en la tablet (opcional, más robusto)**: apps tipo "Fully Kiosk Browser"
  (Android) para que la tablet arranque directo en `/barra` a pantalla completa sin que nadie
  tenga que tocar nada — común en KDS de bares/restaurantes.

**Requisitos mínimos de la mini-PC** (ya evaluados, el stack Docker de este repo está recortado a
`db` + `rest` (PostgREST) + `kong` — no es el Supabase completo, así que el piso de hardware es
bajo): CPU x86_64 dual-core (~1.8GHz, ej. Intel N100/Celeron), 4GB RAM mínimo (8GB recomendado),
SSD 64GB+ (evitar HDD/eMMC por las escrituras de Postgres), Linux (Debian/Ubuntu) para que Docker
arranque solo con el sistema, y que el SO **nunca entre en suspensión/hibernación** durante el
turno. Con una sola tablet + una PC la carga concurrente es mínima — casi cualquier mini-PC de los
últimos años sobra.

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

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R8 | La impresora térmica **no reporta "sin papel"** — verificado en vivo: con el rollo vacío/sin papel, `GET /api/printer/status` sigue devolviendo `connected: true` y la venta marca `printed: true` aunque no salió nada. La impresora no expone protocolo bidireccional confiable (por eso se evitó CUPS), así que el software solo confirma que el device node existe y acepta la escritura, no que el papel esté presente. | La cajera puede creer que el ticket salió cuando en realidad no imprimió nada (papel agotado). | Abierto — mitigación operativa por ahora: revisar visualmente el rollo antes de empezar el turno. Una detección real requeriría lectura de estado bidireccional (fuera de alcance, ver plan técnico de `docs/specs/impresora-termica.md`). |
| R11 | `pnpm --filter web lint` sobre **todo** `apps/web` reporta errores preexistentes (reglas `react-hooks/refs`, `react-hooks/purity`, `react-hooks/set-state-in-effect` de una versión más estricta de `eslint-plugin-react-hooks`/reglas del React Compiler). Persisten en: `apps/carta/page.tsx`, `LogsSection.tsx`, `AnimatedNumber.tsx`, `Sparkline.tsx`, `Toast.tsx`, `orderStatus.ts`. No es una regresión de ninguna fase — las specs siempre corrieron `eslint` solo sobre los archivos tocados, nunca `eslint .` sobre el árbol completo. | Cosmético/mantenibilidad — no rompe build ni tests, pero el criterio "`eslint` en 0" de las specs nunca se cumplió a nivel repo completo. | En progreso — spec `limpieza-lint-repo` |
| R14 | QR real de Mercado Pago (mostrar un código escaneable, vía la Orders API con `type: "qr"` + `external_pos_id`) no está implementado — confirmado con la doc oficial de MP que el Posnet físico (Point Integration API) no puede mostrar QR en su pantalla; es un producto distinto atado a otra superficie. | Ninguno hoy (se sacó la opción de UI que prometía algo que no existía). Si se quiere QR real hace falta una pantalla nueva donde mostrarlo y probablemente credenciales/config adicionales. | Abierto — ver también Fase 7 ("Mercado Pago online"), que ya cubre esto como feature futura. |
| R15 | `modules/mercadopago` sigue sobre la Payment Intents API (legacy) de Mercado Pago, no la Orders API moderna que MP recomienda para nuevas features. | Ninguno funcional hoy — el flujo probado en producción con el Posnet real sigue andando. Riesgo a futuro si MP deprecara la API legacy. | Abierto — migración deliberadamente no abordada; el flujo actual es el único probado en vivo y migrar el contrato completo no se justificaba en esa iteración. |
| R16 | Los tests de integración (`apps/api/tests/integration/`) pegan contra el MISMO Supabase local que usa el dev server — no hay una DB de test aislada. `cleanNightEvents()`/`cleanOrders`/etc. en `db-helpers.ts` borran/crean sin acotar a un rango/prefijo de test, a diferencia de `cleanDrinks()`/`cleanUsers()` (ya arregladas con `TEST_DRINK_ID_FLOOR`/`TEST_USERNAME_PREFIX`). | Corriendo la suite de integración repetidas veces en una sesión de desarrollo larga, se acumulan decenas de `night_events`/`orders`/`tickets` de test reales en la base compartida. No hay riesgo de perder catálogo/usuarios reales (ya protegidos), pero sí de ensuciar el Historial de Noches con datos falsos si no se corre `cleanup-empty-nights.ts` después. | Abierto — aplicar el mismo patrón de rango/prefijo de test a `night_events`/`orders`/`tickets`, o directamente provisionar una segunda instancia local de Supabase dedicada a tests. |

---

## Cómo trabajamos (SDD nativo)

Para features nuevas usamos **Spec-Driven Development nativo** (sin herramientas externas):
1. `brainstorming` (skill) para explorar el intent.
2. `/spec` → escribe la spec en `docs/specs/<feature>.md` (el *qué* y el *por qué*).
3. `/plan` → plan técnico sobre esa spec.
4. `/tasks` → checklist accionable.
5. Implementar (Plan Mode de Claude Code para los cambios grandes).

Ver `docs/specs/README.md` y los comandos en `.claude/commands/`.
