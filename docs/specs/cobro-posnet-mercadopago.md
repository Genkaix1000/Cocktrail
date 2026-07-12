# Cobro con Posnet Mercado Pago — cierre y endurecimiento

**Estado**: done
**Fecha**: 2026-07-12

---

## Problema / Por qué

`/caja` ya tiene un cobro con Posnet Mercado Pago funcionando en vivo con el dispositivo físico
real (Point Integration API): la cajera elige un método, el sistema crea una intención de cobro
en el device vinculado, la espera hace polling de estado, y al finalizar registra el pedido.

Hay dos problemas concretos:

1. **El botón "Código QR" miente.** Hoy "Tarjeta" y "Código QR" en `/caja` llaman exactamente a
   la misma función contra el mismo endpoint (`createPaymentIntent`) — no existe ninguna
   diferenciación real entre ambos. Se investigó contra la documentación oficial de Mercado Pago
   (agente `mercadopago-integrator`, fuentes citadas) y se confirmó que la Point Integration API
   del Posnet físico **no admite pedirle al dispositivo que muestre un QR**: el body del
   payment-intent solo acepta `amount` y metadata, sin ningún parámetro de modo de cobro. El QR
   real de Mercado Pago es un producto distinto (Orders API, atado a un `external_pos_id`, no a un
   `device_id` de terminal) que se muestra en **otra pantalla**, nunca en el Posnet. Esto también
   contradice una nota ya existente en `docs/ARCHITECTURE.md` ("Es cobro presencial con lectora
   física, no checkout web ni QR de MP") mientras que dos líneas más arriba del mismo documento
   listan "QR" como método de cobro de caja — el documento se contradice a sí mismo.

2. **Falta manejar `CONFIRMATION_REQUIRED`.** La API real del Posnet tiene un estado, además de
   `OPEN` / `ON_TERMINAL` / `FINISHED` / `CANCELED`, que el código actual no contempla:
   `CONFIRMATION_REQUIRED`. Es un estado **final** (no cambia solo) que ocurre cuando Mercado Pago
   no puede confirmarle al backend si el cobro se concretó o no en el dispositivo. Hoy, si
   ocurriera, el polling de `useCheckout.ts` simplemente no lo reconoce y el flujo queda colgado
   sin feedback para la cajera — riesgo real de perder una venta o de no darse cuenta de que sí se
   cobró.

**Para quién**: la cajera/o (rol `caja`) que cobra con el Posnet durante el turno, y el admin que
necesita que los totales de caja reflejen fielmente lo que pasó con cada cobro.

---

## Objetivo

Que `/caja` solo ofrezca los métodos de cobro que el Posnet puede efectivamente distinguir y
resolver: **Efectivo** y **Tarjeta (Posnet)**. El método "Código QR" deja de existir como opción
del selector de cobro con Posnet — no porque no importe el QR, sino porque hoy no hay forma real
de generarlo desde el dispositivo vinculado (ver Fuera de alcance). Esto es un cambio acotado a la
pantalla de cobro de `/caja`: `"qr"` sigue existiendo como valor válido en el resto del sistema
(el cliente lo declara como preferencia en `/carta`, y `/admin` lo reporta como "Transferencia /
QR"), porque ese uso no tiene relación con el Posnet y no es parte de este problema.

Que un cobro con Posnet que termine en `CONFIRMATION_REQUIRED` se resuelva **solo**, sin que la
cajera tenga que mirar la pantalla del dispositivo ni tomar una decisión manual: el sistema debe
consultar el estado real del pago (Mercado Pago expone un ID de pago en esa respuesta) y decidir
automáticamente si el pedido se concreta o si el cobro se da por no realizado, con el mismo
resultado visible para la cajera que ve hoy para `FINISHED` o `CANCELED` (pantalla de éxito o
vuelta a la selección de método).

Que el historial/reportes de `/admin` (Logs, Historial de Noches) sigan mostrando correctamente
todos los cobros con Posnet ya realizados, sin registros huérfanos ni etiquetas rotas por haber
sacado "QR" como método.

Que el módulo de Mercado Pago quede en un estado que un agente o desarrollador nuevo pueda leer y
extender sin sorpresas: sin duplicación de lógica de headers/manejo de errores entre sus métodos,
sin tipos `any` en las respuestas de la API externa, con validación de configuración en un solo
lugar.

---

## Historias de usuario

- Como **cajera**, quiero ver solo los métodos de cobro que realmente funcionan distinto entre sí
  (Efectivo, Tarjeta) para no confundirme eligiendo una opción de QR que en la práctica hace lo
  mismo que Tarjeta.
- Como **cajera**, quiero que un cobro con Posnet que termine en un estado ambiguo se resuelva
  solo, para no tener que interpretar pantallas de Mercado Pago ni arriesgarme a cobrar dos veces
  por las dudas.
- Como **admin**, quiero que el historial de ventas y los logs sigan siendo correctos y legibles
  después de sacar "QR" como método, para no perder trazabilidad de cobros pasados ni confundir al
  personal con una opción que ya no existe.
- Como **desarrollador/agente** que toque este módulo en el futuro, quiero que el código de
  Mercado Pago sea simple de leer y extender (sin duplicación, sin `any`), para poder agregar con
  confianza un cobro con QR real (Orders API) el día que haya una segunda pantalla para mostrarlo.

---

## Criterios de aceptación

1. **Dado** que la cajera abre el cobro en `/caja`, **cuando** llega a la pantalla de selección de
   método, **entonces** solo ve "Efectivo" y "Tarjeta" — no existe ninguna opción de "Código QR".
2. **Dado** un cobro con Posnet en curso, **cuando** Mercado Pago responde `FINISHED`,
   `ON_TERMINAL` o `CANCELED`, **entonces** el comportamiento visible es exactamente el mismo que
   hoy (sin regresión).
3. **Dado** un cobro con Posnet en curso, **cuando** Mercado Pago responde `CONFIRMATION_REQUIRED`
   y el pago subyacente resulta aprobado, **entonces** el sistema concreta el pedido igual que si
   hubiera recibido `FINISHED`, sin intervención de la cajera.
4. **Dado** un cobro con Posnet en curso, **cuando** Mercado Pago responde `CONFIRMATION_REQUIRED`
   y el pago subyacente resulta rechazado o cancelado, **entonces** el sistema vuelve a la
   selección de método igual que si hubiera recibido `CANCELED`, sin intervención de la cajera.
5. **Dado** un cobro con Posnet en curso, **cuando** Mercado Pago responde `CONFIRMATION_REQUIRED`
   y el pago subyacente todavía está pendiente, **entonces** el sistema reintenta la consulta
   automáticamente antes de resolver, en vez de fallar o colgarse en el primer intento.
6. **Dado** que `"qr"` sigue siendo un valor válido de `PaymentMethod` a nivel dominio (lo usa
   `/carta` como preferencia que declara el cliente, y el reporte "Transferencia / QR" de
   `/admin`), **cuando** se saca la opción de UI del selector de cobro Posnet en `/caja`,
   **entonces** el tipo compartido `PaymentMethod` NO se modifica y ningún reporte, filtro o dato
   existente que dependa de `"qr"` fuera de `/caja` se ve afectado.
7. **Dado** el módulo `mercadopago` (service + controller), **cuando** se lo revisa, **entonces**
   no tiene lógica de headers/manejo de errores duplicada entre métodos, no usa `any` para las
   respuestas de Mercado Pago, y la validación de variables de entorno faltantes está en un solo
   lugar.
8. **Dado** `docs/ARCHITECTURE.md`, **cuando** se lo revisa después de este cambio, **entonces**
   ya no se contradice a sí mismo sobre si `/caja` cobra con QR o no.
9. Todo el comportamiento de los distintos estados de Mercado Pago (`OPEN`, `ON_TERMINAL`,
   `FINISHED`, `CANCELED`, `CONFIRMATION_REQUIRED` con sus tres sub-casos, error de red/HTTP) está
   cubierto por tests automatizados con la API de Mercado Pago mockeada — sin necesidad de tocar
   el dispositivo físico ni generar cobros reales para validar la lógica.

---

## Fuera de alcance

- **QR real de Mercado Pago** (mostrar un código escaneable en una pantalla, vía la Orders API con
  `type: "qr"` y un `external_pos_id`). Es un producto distinto del Posnet físico actual, requiere
  una superficie nueva donde mostrar el QR (no la pantalla del dispositivo) y probablemente
  credenciales/configuración adicionales. Queda anotado como posible feature futura en
  `docs/ROADMAP.md`, no entra en esta iteración.
- **Migrar de Payment Intents (legacy) a la nueva Orders API de Mercado Pago.** El flujo actual ya
  está probado en vivo con el dispositivo físico real; migrar el contrato completo (endpoints,
  estados, body) del único cobro con Posnet que funciona hoy en producción es un riesgo que no se
  justifica en esta iteración. Queda anotado como deuda técnica en el roadmap.
- **Checkout online / pago por link** (Phase 2 del roadmap general) — no tiene relación con esta
  feature, que es exclusivamente sobre el cobro presencial en `/caja`.
- Cambios de layout/estética de la pantalla de cobro más allá de sacar la opción "Código QR" y lo
  que requiera el nuevo estado automático — no es una tarea de rediseño visual.

---

## Preguntas abiertas

Ninguna — las decisiones de alcance, manejo de `CONFIRMATION_REQUIRED` y estrategia de testing ya
se cerraron en la sesión de brainstorming previa a esta spec.

---

## Plan técnico

### Enfoque

Cambio acotado a dos capas: (1) el módulo `mercadopago` en `apps/api` gana un método interno para
resolver pagos vía la Payments API estándar de Mercado Pago y normaliza sus cuatro llamadas HTTP
detrás de un único cliente interno tipado; (2) el flujo de cobro Posnet en `/caja` (`useCheckout`
+ `VentaSection`) pierde la opción "Código QR" y gana el manejo del nuevo estado normalizado. **No
se toca `packages/shared/src/domain.ts`**: el hallazgo clave de esta ronda es que `PaymentMethod`
(`"efectivo" | "qr" | "debito"`) es un tipo de dominio compartido por `/carta` (preferencia real
del cliente) y los reportes de `/admin`, no exclusivo del Posnet — achicarlo rompería esos dos
usos, que están fuera de alcance. La única "reducción" es de opciones de UI en un selector
puntual, no de dominio. No hay migraciones de Supabase: `orders.payment_method` es `TEXT` sin
`CHECK` constraint (confirmado en `supabase/migrations/schema.sql`), así que ni siquiera aplica
tocar el schema.

### Archivos/módulos afectados

**Backend (`apps/api`)**
- `src/modules/mercadopago/mercadopago.service.ts` — refactor interno:
  - Extraer un método privado `pointApiRequest(path, init)` que centralice `baseUrl`, headers
    (`Authorization`, `Content-Type`) y el manejo de error/parseo de `errData` que hoy está
    duplicado en `createPaymentIntent`, `getPaymentIntentStatus`, `cancelPaymentIntent` y
    `checkDeviceConnection`.
  - Agregar `getPayment(paymentId: string)` → `GET https://api.mercadopago.com/v1/payments/{id}`
    (Payments API estándar, mismo `MP_ACCESS_TOKEN`, no requiere `MP_POS_DEVICE_ID`).
  - `getPaymentIntentStatus` pasa a devolver un **status normalizado** de un tipo cerrado
    (`"OPEN" | "ON_TERMINAL" | "FINISHED" | "CANCELED" | "PENDING"`, sin exponer
    `CONFIRMATION_REQUIRED` hacia afuera): si el estado crudo de MP es `CONFIRMATION_REQUIRED`,
    resuelve internamente contra `getPayment(payment.id)` y mapea `approved → FINISHED`,
    `rejected|cancelled → CANCELED`, cualquier otro (`pending`, `in_process`, etc.) → `PENDING`
    (el front sigue pollleando igual que hoy ante `PENDING`, sin cambios de contrato con el
    frontend).
  - Reemplazar los `any` de las respuestas de MP (`matchedDevice: any`, `data`/`errData` sin tipar)
    por tipos mínimos (`MpDevice`, `MpPaymentIntentResponse`, `MpPayment`) que documenten los
    campos que el código realmente lee — no un mapeo exhaustivo de la API de MP.
  - Guard único de configuración: una función `assertConfigured()` (o similar) que reemplace las
    cuatro repeticiones de `if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) throw ...`.
- `src/modules/mercadopago/mercadopago.controller.ts` — sin cambios de contrato HTTP (mismos 3
  endpoints); solo se beneficia de que el service ya no explote con estados no contemplados.
- `src/config/env.ts` — sin cambios (ya son `optional()`, el guard vive en el service).

**Frontend (`apps/web`)**
- `src/components/caja/VentaSection.tsx` — sacar el botón "Código QR" del grid de "Cobro Posnet
  Mercado Pago" (queda un solo botón grande "Tarjeta" en vez del grid de 2 columnas, o el grid
  pasa a 1 columna — decisión visual menor para la implementación). Sacar toda rama
  `paymentMethod === "qr"` en los condicionales de esa pantalla (quedan solo `"efectivo"` y
  `"debito"` dentro de este componente).
- `src/hooks/useCheckout.ts` — `startPosnetPayment` deja de aceptar `"qr"` como método válido de
  entrada (tipo más angosto solo para este hook, ej. `"debito"`, sin tocar `PaymentMethod` del
  dominio); el polling en `startPolling` ya no necesita distinguir `"debito"`/`"qr"` porque el
  service ya le devuelve un status normalizado (no ve `CONFIRMATION_REQUIRED` nunca).
- `src/hooks/useCajaShortcuts.ts` — sacar el atajo `"3"` → `onSelectMethod("qr")` (quedan `1`
  Efectivo, `2` Tarjeta).
- `src/services/mercadopago.service.ts` — sin cambios de contrato (mismos 3 métodos); el tipo de
  retorno de `getPosIntentStatus` se angosta al status normalizado.
- **Sin cambios** en `src/app/carta/page.tsx`, `src/lib/totals.ts`, `src/app/admin/AdminClient.tsx`,
  `src/components/admin/LogsSection.tsx` — todos siguen usando `"qr"` del dominio compartido tal
  cual, porque no tienen relación con el Posnet.

**Documentación**
- `docs/ARCHITECTURE.md` — línea 21 (tabla de pantallas): "Cobro presencial (efectivo / débito
  Posnet / QR)" → sacar "QR" de la lista de métodos que ofrece `/caja`. Línea 278 ya dice
  correctamente "no checkout web ni QR de MP"; queda consistente con la tabla después de este
  cambio.

### Cambios de datos

Ninguno. No hay migración de Supabase (columna `TEXT` sin `CHECK`), no hay cambio en
`packages/shared/src/domain.ts`, no hay impacto en el sync local↔cloud (`sync.service.ts` sincroniza
`orders` tal cual están, y el valor `"qr"` sigue siendo válido en la fila). El offline-first no se
ve afectado: el cobro con Posnet ya requiere que el backend local llegue a `api.mercadopago.com`
(no funciona sin internet), comportamiento preexistente que esta feature no cambia.

### Real-time (SSE)

Sin cambios. El flujo de Posnet no emite ni consume eventos SSE — es puro request/response +
polling HTTP desde `useCheckout.ts`. La creación del pedido al finalizar (`ordersService.create`)
ya emite `order.created` como hoy; eso no se toca.

### Auth/permisos

Sin cambios. Los 3 endpoints de `mercadopago.controller.ts` mantienen `authMiddleware` +
`requireRole("admin", "caja")` tal como están. No hay `UserPermissions` granular involucrado (el
cobro Posnet no tiene un permiso separado del rol `caja` en sí).

### Riesgos

- **Cambio de contrato interno de `getPaymentIntentStatus`**: hoy el frontend lee `st.state ||
  st.status` crudo de MP. Si el service empieza a devolver un status ya normalizado, hay que
  auditar los 3 lugares de `VentaSection.tsx`/`useCheckout.ts` que comparan contra strings
  literales (`"FINISHED"`, `"ON_TERMINAL"`, `"CANCELED"`, `"ERROR"`) para que sigan siendo válidos
  con el nuevo tipo cerrado — riesgo de regresión silenciosa si se desalinea un nombre.
- **`PENDING_CONFIRMATION` con reintentos**: si `getPayment` tarda en reflejar el resultado real
  (demora de MP en propagar el estado del pago), el polling existente de 3s ya cubre el reintento
  de forma natural — no hace falta un mecanismo nuevo de backoff, pero si en la práctica tarda
  demasiado, la cajera vería el mismo "esperando pago" sin límite; conviene un tope de reintentos
  razonable (a definir en `/tasks`) antes de mostrar error.
- **Deuda ya conocida y explícitamente NO tocada acá** (ver `docs/ROADMAP.md`): migración a Orders
  API, y el checkout online real vía QR (Phase 2). Este plan no adelanta nada de eso a propósito.
- **Riesgo bajo de romper `/carta` o reportes de `/admin`**: mitigado al no tocar
  `packages/shared/src/domain.ts` ni ningún archivo fuera de `/caja` y del módulo `mercadopago`.

### Alternativas consideradas

- **Sacar `"qr"` de `PaymentMethod` a nivel dominio** (lo que sugería la spec original antes de
  este plan): descartado — rompería `/carta` (preferencia real del cliente) y el reporte
  "Transferencia / QR" de `/admin`, que no tienen relación con el Posnet. Verificado con grep
  exhaustivo de todos los usos de `"qr"` en el repo antes de descartar esta opción.
  Se corrigió la spec (criterio de aceptación 6) para reflejar esto.
- **Manejar `CONFIRMATION_REQUIRED` con botones manuales para la cajera** ("¿se cobró sí/no"):
  descartado en el brainstorming — la respuesta de MP trae `payment.id`, que permite resolverlo
  automáticamente contra la Payments API sin depender de que la cajera interprete la pantalla del
  Posnet.
  - **Migrar a Orders API para tener un único contrato "moderno"**: descartado — mayor superficie
  de cambio en el único flujo de cobro con Posnet que ya funciona en producción, sin necesidad
  real para resolver los dos problemas de esta spec (botón QR falso + `CONFIRMATION_REQUIRED` sin
  manejar).

---

## Tareas

### Backend — módulo `mercadopago`

- [x] Definir tipos mínimos para las respuestas reales de Mercado Pago que el service ya lee hoy
  (`MpDevice`, `MpPaymentIntentResponse` con `status`/`state`/`payment.id`, `MpPayment` con
  `status`) en `apps/api/src/modules/mercadopago/mercadopago.service.ts` (o un `.types.ts` al
  lado si crece), reemplazando los `any` existentes. *(Sugerido: consultar al subagent
  `mercadopago-integrator` la forma exacta del JSON real de `GET /v1/payments/{id}` y de
  `payment-intents` con `payment.id`, para no adivinar campos.)*
- [x] Extraer `pointApiRequest(path, init)` privado en `mercadopago.service.ts` que centralice
  `baseUrl`, headers (`Authorization`, `Content-Type`) y el parseo/relanzado de error, y migrar
  `createPaymentIntent`, `getPaymentIntentStatus`, `cancelPaymentIntent`, `checkDeviceConnection`
  para que lo usen (elimina la duplicación actual de las 4 llamadas `fetch`).
- [x] Extraer un guard único `assertConfigured()` (o similar) que reemplace las 4 repeticiones de
  `if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) throw new Conflict(...)` dispersas en el
  service.
- [x] Agregar `getPayment(paymentId: string)` en `mercadopago.service.ts` → `GET
  https://api.mercadopago.com/v1/payments/{id}` usando `pointApiRequest`/mismo `MP_ACCESS_TOKEN`.
- [x] Cerrar el tipo de retorno de `getPaymentIntentStatus` a `"OPEN" | "ON_TERMINAL" | "FINISHED"
  | "CANCELED" | "PENDING"` (nunca `CONFIRMATION_REQUIRED` hacia afuera): cuando el estado crudo de
  MP sea `CONFIRMATION_REQUIRED`, llamar a `getPayment(payment.id)` y mapear `approved → FINISHED`,
  `rejected|cancelled → CANCELED`, cualquier otro (`pending`, `in_process`, ...) → `PENDING`.
- [x] Revisar `mercadopago.controller.ts`: confirmar que no depende de ningún campo crudo de MP que
  haya cambiado de forma (debería seguir funcionando sin cambios de código, solo re-testear).

### Frontend — flujo de cobro `/caja`

- [x] `apps/web/src/services/mercadopago.service.ts`: angostar el tipo de retorno de
  `getPosIntentStatus` al status normalizado que ahora devuelve el backend.
- [x] `apps/web/src/hooks/useCheckout.ts`: quitar `"qr"` como valor aceptado por
  `startPosnetPayment`/`startPolling` (tipo local angosto, sin tocar `PaymentMethod` de
  `@cocktrail/shared`); simplificar el manejo de estado ahora que nunca llega
  `CONFIRMATION_REQUIRED` crudo al frontend.
- [x] `apps/web/src/components/caja/VentaSection.tsx`: sacar el botón "Código QR" del bloque "Cobro
  Posnet Mercado Pago" y todas las ramas `paymentMethod === "qr"` de esa pantalla (quedan
  `"efectivo"` y `"debito"`); ajustar el grid de 2 columnas a como corresponda con un solo botón
  Posnet.
- [x] `apps/web/src/hooks/useCajaShortcuts.ts`: sacar el atajo `"3"` → `onSelectMethod("qr")`
  (quedan `1` Efectivo, `2` Tarjeta).
- [x] Confirmar que `apps/web/src/app/carta/page.tsx`, `apps/web/src/lib/totals.ts`,
  `apps/web/src/app/admin/AdminClient.tsx` y `apps/web/src/components/admin/LogsSection.tsx`
  quedan intactos (no deberían tocarse — es la verificación de que el alcance se mantuvo acotado).

### Documentación

- [x] `docs/ARCHITECTURE.md` línea ~21 (tabla de pantallas, fila Caja): sacar "QR" de "Cobro
  presencial (efectivo / débito Posnet / QR)".
- [x] `docs/ROADMAP.md`: anotar como deuda/futuro explícito (1) QR real de Mercado Pago vía Orders
  API como posible feature futura, y (2) migración de Payment Intents legacy → Orders API como
  deuda técnica, si no están ya anotadas.

### Tests

- [x] `apps/api/src/modules/mercadopago/mercadopago.service.test.ts` (nuevo): `fetch` mockeado
  cubriendo `createPaymentIntent`/`cancelPaymentIntent`/`checkDeviceConnection` (casos ok + error
  HTTP) y `getPaymentIntentStatus` para `OPEN`, `ON_TERMINAL`, `FINISHED`, `CANCELED`, y
  `CONFIRMATION_REQUIRED` con sub-casos `approved` (→ `FINISHED`), `rejected`/`cancelled` (→
  `CANCELED`) y `pending`/`in_process` (→ `PENDING`), más el caso de red/HTTP fallando.
- [x] ~~`apps/api/src/modules/mercadopago/mercadopago.controller.test.ts`~~ — descartado: se
  confirmó que ningún módulo de `apps/api` tiene tests de controller (todos son `*.service.test.ts`
  / `*.repository.test.ts`), pese a tener `supertest` instalado sin uso. Introducir el primer test
  de controller del repo solo para este módulo sería un patrón nuevo sin necesidad real (el
  controller no tiene lógica propia más allá del guard de rol genérico ya cubierto por
  `auth.middleware`).
- [x] Actualizar `apps/web/src/hooks/useCheckout.test.ts` (si existe) o crear uno: cubrir que
  `startPosnetPayment` ya no acepta `"qr"`, y que el polling reacciona igual ante el status
  normalizado (sin lógica nueva de `CONFIRMATION_REQUIRED` del lado del cliente).
- [x] Actualizar `apps/web/src/components/caja/VentaSection.test.tsx`: sacar asserts sobre el botón
  "Código QR" / atajo `3`, agregar assert de que solo aparecen Efectivo y Tarjeta.
- [x] Actualizar `apps/web/src/hooks/useCajaShortcuts.test.ts`: sacar el caso del atajo `3`.
- [x] Correr `pnpm typecheck` (api + web) y `pnpm --filter cocktrail-app test` / test de `apps/api`
  hasta que todo pase en verde. `tsc --noEmit` limpio en ambos paquetes; `apps/web` 309/309 tests;
  `apps/api` — `mercadopago.service.test.ts` 28/28; las 19 fallas restantes de la corrida completa
  son de `tests/integration/*` preexistentes (requieren Supabase local con estado real, no tocan
  ningún archivo de esta feature — confirmado con `git status`).
- [ ] *(Opcional, post-implementación)*: pedirle a `e2e-playwright-tester` que recorra `/caja` con
  el Point API mockeada a nivel red (no el dispositivo físico real) para confirmar que el selector
  de método y el flujo completo hasta "Pedido Concretado" siguen andando de punta a punta en el
  navegador.
