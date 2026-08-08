# Cocktrail / BarQR — Roadmap

> Estado del producto y qué sigue. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> El detalle de cada feature cerrada vive en su spec bajo [`docs/specs/`](./specs/README.md); acá va
> el resumen y los punteros.
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Última actualización: 2026-08-08.

---

## Qué es hoy

Sistema de venta para un boliche, con **una persona que vende y cobra circulando por la pista**
("comandera"): tablet + impresora térmica Bluetooth portátil. Registra la venta, cobra en efectivo
o transferencia, imprime el ticket en el momento y el cliente lo retira en la barra.

- **Dos pantallas**: `/caja` (vender y cobrar) y `/admin` (totales en vivo, carta, cierre de noche).
  Dos roles: `admin` y `caja`.
- **Una sola base**: Supabase Cloud. No hay base local ni sincronización.
- **Deploy**: un servicio en Render con los dos procesos (API Express + web Next.js).
  El backend **no puede ser serverless**: el tiempo real usa un `EventEmitter` en proceso.
- **Cobros**: efectivo y **transferencia por Mercado Pago mediante el QR de la caja** — cada caja
  (incluida la comandera) tiene su punto de venta y su QR asociado, que se provisiona desde
  `/admin`. La persona puede llevarlo impreso o mostrarlo en la tablet al cerrar la venta.
  El **Posnet físico sale del uso diario** (no se anda con el lector en la mano), pero **la
  integración y su pantalla en `/admin` quedan intactas**: vincular cuenta, crear caja, asociar
  lector y generar el QR es el mismo flujo.

---

## En curso — deploy en la nube

Spec, plan y tareas: [`specs/deploy-cloud-comandera.md`](./specs/deploy-cloud-comandera.md).

| Bloque | Estado |
|---|---|
| **0 — Backup + baseline de migraciones** | ✅ hecho |
| **A — Limpieza de código muerto** | 🔄 en curso (~6.800 líneas eliminadas) |
| **B — Hardening para exponer a internet** | ⏳ |
| **C — Dockerfile + render.yaml** | 🔄 imagen construyendo y arrancando |
| **D — Deploy y verificación** | ⏳ |
| **E — PWA instalable** | ⏳ |
| **F — Documentación** | 🔄 |

**Decisiones tomadas**: todo en Render (free tier para empezar), un solo servicio con los dos
procesos. Se descartó separar en dos servicios porque `*.onrender.com` está en la Public Suffix
List y los subdominios no comparten cookies; se descartó Vercel porque su plan gratis prohíbe uso
comercial y el tiempo real se cortaría por timeout. Pasar a plan pago (USD 7/mes, elimina el
"sleep" tras 15 min sin tráfico) y agregar dominio propio son cambios de configuración, no de código.

**El plan gratuito no vence**: es indefinido para servicios web (la base de datos *de Render* sí
caduca a los 30 días, pero no aplica: la base es Supabase). El único límite es **750 horas de
servicio despierto por mes** — dormido no consume. Un mes tiene ~730 horas, así que mantenerlo
despierto todo el tiempo agota la cuota sin margen; ver el ping programado en Pendientes.

**Hallazgos del camino** (detalle en la spec):
- La base en la nube tenía los datos reales pero **no la tabla de control de migraciones**: un
  primer arranque las habría aplicado todas como baseline, y dos de ellas borran la carta. Resuelto
  con backup + baseline manual antes de tocar nada.
- **El build de producción nunca había funcionado**: un `import` sin extensión `.js` (ESM la exige)
  hacía que `node dist/server.js` no arrancara. En desarrollo no se veía porque `tsx` lo tapa.
- `packages/shared` expone TypeScript crudo, y Node no procesa TS dentro de `node_modules`: en la
  imagen el paquete va a su lugar del monorepo con un symlink. Si algún día se publica o se separa,
  conviene compilarlo.

---

## Hecho

**Producto**
- **Venta y cobro en `/caja`** con impresión de ticket, historial y cierre de noche.
  → [`specs/05-ui-caja/`](./specs/05-ui-caja/), [`specs/01-tickets-impresora/`](./specs/01-tickets-impresora/)
- **Servicio despierto en horario de boliche** ✅ *(2026-08-08)* — ping cada 10 min desde
  **cron-job.org** contra `/api/theme` (público y liviano), acotado a viernes, sábados y domingos
  de 20 a 6 (hora argentina, configurada en el propio job). Son ~121 h/mes contra un tope de 750:
  **el ping NO puede correr 24/7**, la cuota son 750 h de servicio despierto por mes y un mes tiene
  ~730, así que se consumiría entera y sin margen (y al agotarse Render suspende el servicio hasta
  el mes siguiente). Avisa por mail tras 3 fallos seguidos, lo que además sirve de monitoreo.
- **Impresión Bluetooth (comandera)** ✅ *(2026-08-07)* — la impresora S1 imprime desde `/caja` en
  Chrome vía Web Bluetooth, sin app del fabricante: vinculación, impresión automática al cobrar,
  reimpresión, cola y reconexión. Gates físicos pasados con la tablet real.
  → [`specs/impresion-bluetooth-comandera.md`](./specs/impresion-bluetooth-comandera.md)
  (ahí están los hallazgos de hardware, que son lo caro de reconstruir).
- **`/admin`**: dashboard, historial de noches, gestión de carta, export a PDF.
- **Impresión USB** (ticketera fija) por WebUSB y por el shell Android `apps/caja-android`.
- **Noches de prueba y borrado de noches** ✅ *(2026-08-08)* — el admin puede abrir una noche
  marcada como prueba: vende, imprime y cierra igual, pero **no persiste nada** (vive en memoria
  del proceso; Mercado Pago queda bloqueado y el ticket sale con leyenda). Y puede **borrar una
  noche registrada** desde `/admin` o por CLI, de forma atómica y auditada.
  → [`specs/noches-de-prueba-y-borrado.md`](./specs/noches-de-prueba-y-borrado.md)

**Mercado Pago** (integración real, con gates físicos pasados)
- **Cobro verificado** — la venta se concreta solo si MP confirmó el cobro, con la invariante como
  CHECK en la base. → [`specs/mercadopago/cobro-verificado.md`](./specs/mercadopago/cobro-verificado.md)
- **Remediación de la integración** (6 PRs). → [`specs/mercadopago/remediacion-integracion-mp.md`](./specs/mercadopago/remediacion-integracion-mp.md)
- **Gestión de Posnets desde `/admin`** con panel de salud. → [`specs/mercadopago/gestion-posnets.md`](./specs/mercadopago/gestion-posnets.md)
- **Cobro por QR verificado en vivo**: confirma por polling con el mismo veredicto server-side que
  el Posnet. Regla operativa: no cerrar la pestaña de `/caja` durante un cobro QR en curso.

**Calidad**
- Auditorías de API y web cerradas. → [`specs/02-auditoria-api/`](./specs/02-auditoria-api/),
  [`specs/03-auditoria-web/`](./specs/03-auditoria-web/)
- Runner de migraciones propio con advisory lock, checksums y detección de drift.
- Suite: ~760 tests de API + ~530 de web.

**Validado en el boliche real**: 2 noches de operación (tickets, cobros con Posnet, admin, cierre
de noche). Funcionó; el problema que apareció fue de negocio —varias barras y una sola caja fija—
y llevó al modelo comandera.

---

## Pendiente

- **Terminar el deploy** (bloques B a F de la spec).
- **Mostrar el QR de la caja en la tablet al cerrar la venta**: hoy el QR se provisiona y se
  imprime desde `/admin`; falta la pantalla que lo muestre en el momento del cobro para que el
  cliente escanee sin papel. El mecanismo de cobro por QR ya existe y está verificado.
- **Cola offline en la PWA** (vender sin señal y sincronizar después): no está y es una feature en
  sí misma. Hoy sin internet no se puede vender.
- **Varias comanderas a la vez**: `BAR_CODE` sale del entorno y `bar_sessions` tiene un
  `UNIQUE(bar_id)`. Con una alcanza; varias en paralelo necesitan diseño.
- **Cambiar la impresora por una Goojprt MPT-II** *(comprada / a probar)*. La S1 actual es una
  impresora de **fotos** usada como impresora de tickets: solo acepta imágenes, así que hacen falta
  ~30.000 bytes para imprimir cuatro renglones (9s con un trago, 28s con ocho). La MPT-II entiende
  **ESC/POS por Bluetooth de bajo consumo**, o sea que se le manda **texto**: ~500 bytes, casi
  instantáneo, y además expone un canal para preguntarle si está lista.
  - Está mapeada en [`NielsLeenheer/WebBluetoothReceiptPrinter`](https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter):
    `filters: [{ name: 'MPT-II', services: ['000018f0-…'] }]`, escritura `00002af1-…`,
    estado `00002af0-…`, lenguaje `esc-pos`.
  - **Antes de escribir código**: en Chrome de la tablet, `chrome://bluetooth-internals` → Devices
    → Scan, y confirmar que el aparato anuncie el servicio **`18F0`**. Los clones cambian el nombre
    pero suelen mantener el servicio; si el nombre difiere, se ajusta el filtro y listo.
  - Implementación: es **un transporte más** en `apps/web/src/lib/printing/transports/`, al lado de
    los que ya hay. El contenido del ticket ya está separado del cómo se imprime, así que no toca
    la pantalla de caja. La S1 se conserva como alternativa.
- **El interruptor "sandbox" de Mercado Pago no hace nada**: `app_config.mercado_pago.sandbox` se
  guarda, se valida y se muestra como toggle en la pantalla de Pagos de `/admin`, pero **ningún
  módulo de `modules/mercadopago/` lo lee** — el cobro sale por la cuenta real esté como esté.
  Hoy figura en `true` en producción sin ninguna consecuencia. Es una trampa: alguien puede tocarlo
  creyendo que entra en modo prueba y cobrar de verdad. Decidir: sacarlo del panel, o que
  efectivamente cambie el entorno de MP.
- **Impresión más rápida por Bluetooth clásico (SPP) en el APK**: alternativa si el camino MPT-II
  no prosperara. El Bluetooth clásico es inaccesible desde el navegador, así que exigiría volver al
  APK para la comandera.
- **Pedido del cliente por QR**: se desactivó y se borró. Si vuelve, vuelve como feature nueva.
- **Migrar el Posnet a la cuenta MP del dueño**: procedimiento manual (MP no expone API para
  transferir hardware entre cuentas); relevante solo si se retoma el cobro con lector.
- **Conectar el webhook de GitHub en Render**: el servicio declara `autoDeploy: yes` sobre
  `develop`, pero **el push no dispara nada** — todos los deploys históricos son `trigger: "api"`.
  Hasta arreglarlo, cada deploy hay que lanzarlo a mano desde el dashboard o por API.
- **Dropear las columnas muertas del sync**: `night_events.sync_status` (ojo: tiene `DEFAULT` y el
  CHECK `night_events_sync_status_check`, hay que tirar el constraint en el mismo movimiento),
  `night_events.synced_at` y `mercadopago_sellers.cloud_synced_at`. Ya no se leen desde TypeScript.
  El DROP tiene que ir junto con sacar los pasos que las **crean** en `repair-cloud-schema.ts`, y
  verificado contra la nube antes (mismo riesgo que la columna `totals`, commit `9c81f82`).
- **Limpieza de lint a nivel repo**: `eslint` sobre todo `apps/web` reporta errores preexistentes.

---

## Riesgos y deuda abierta

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R16 | **Los tests de integración pegan contra la misma base que la aplicación.** Ya borró datos reales dos veces. Con una única base en la nube, "la base de test" **es producción**. Desde el 2026-08-08 pesa más: existe la función `delete_night`, así que el daño posible de una corrida distraída creció. | Alto: una corrida distraída puede borrar la noche en curso. | **Abierto, prioritario.** Mitigaciones: no correr la suite de integración apuntando a la nube, y los tests del borrado son unit con la RPC mockeada. Solución de fondo: proyecto Supabase aparte para tests. |
| R29 | Un seller de Mercado Pago de otro desarrollador figura activo en la base de la nube (algo lo reactivó después de expirarlo). | No afecta el cobro, pero ensucia el archivo y se cruza con el modelo de un solo seller activo. | Abierto — re-expirar y verificar que ningún entorno viejo siga escribiendo. |
| R8 | **Ninguna impresora reporta "sin papel"**: ni la USB ni la Bluetooth exponen estado confiable. El sistema confirma que aceptó la escritura, no que haya salido papel. | La cajera puede creer que el ticket se imprimió. | Abierto — mitigación operativa: revisar el rollo antes del turno. |
| — | **Modo demo accesible en producción**: `/admin?demo=true` muestra datos de facturación inventados sin ningún cartel que lo aclare. | Confusión: un link o bookmark con esa query muestra números falsos como reales. | Abierto — decidir: borrarlo, o limitarlo a desarrollo con un banner visible. Verificado el 2026-08-08: el mock **no se filtra** al camino normal, está bien gateado por la query. |
| R14 | El QR de cobro está asociado a la caja y se provisiona desde `/admin`, pero no hay pantalla que lo muestre en la tablet al cerrar la venta. | La comandera depende de llevar el QR impreso. | Abierto — ver Pendientes. |
| R15 | `modules/mercadopago` usa la Payment Intents API (legacy), no la Orders API que MP recomienda. | Ninguno hoy; riesgo si MP deprecara la legacy. | Abierto — migración no justificada por ahora. |
| R17 | Los controllers de Mercado Pago validan a mano con `typeof` en vez del helper con zod que ya existe. | Inconsistencia y validación más débil en endpoints de cobro. | Abierto — refactor diferido. |
| R22 | Cambiar de cuenta de Mercado Pago deja huérfanas las cajas provisionadas y **cambia el QR estático**. | Hay que re-provisionar y reimprimir el QR. | Parcialmente cubierto — detección y re-provisión desde `/admin` implementadas; queda el procedimiento manual. |
| R26 | Los webhooks de Mercado Pago estaban inertes porque MP no alcanzaba la LAN del boliche. **Con URL pública pasan a ser alcanzables por primera vez.** | Oportunidad más que riesgo, pero hay que verificarlo (endpoint fail-closed sin el secreto). | A verificar en el deploy. |

*Cerrados recientemente*: **R28** (los totales sumaban pedidos de `/carta` sin cobrar) — dejó de
existir al borrarse esa ruta.

---

## Cómo trabajamos (SDD nativo)

Features nuevas: `brainstorming` → `/spec` (el qué y el por qué) → `/plan` (técnico) → `/tasks`
(checklist) → implementar (Plan Mode para cambios grandes).

Las specs nacen en la raíz de `docs/specs/` y se archivan en la subcarpeta de su fase al cerrarse.
Ver [`docs/specs/README.md`](./specs/README.md) y `.claude/commands/`.
