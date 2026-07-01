# Impresora térmica + Abrir Noche manual (ticket físico en caja)

**Estado**: approved
**Fecha**: 2026-07-01

> Incluye un cambio de alcance acordado con el usuario: la apertura de la noche pasa de automática
> (al arrancar el server / tras cerrar la anterior) a una acción manual explícita de `/admin`, porque
> la palabra clave necesita un momento real de "apertura" para pedirse, y de paso deja `startedAt`
> preciso para medir horas trabajadas a futuro.

---

## Problema / Por qué

Hoy la venta de un trago en `/caja` no imprime nada real: el botón "Imprimir Ticket" abre el diálogo
de impresión del navegador (`window.print()`), y el estado de "impresora conectada" que se muestra en
pantalla es una simulación (un booleano fijo por variable de entorno), no una lectura real del hardware.

El dueño del local ya compró una impresora térmica USB de 58mm (NICTOM IT06) para que, al vender un
trago en caja, salga un **ticket físico real** que el cliente lleva a la barra para retirar su trago —
sin pasos extra para la cajera, y sin que una falla de impresión le impida seguir cobrando.

Además, como todavía no existe (ni entra en esta feature) ningún sistema de escaneo o validación en la
barra, el ticket físico tiene que dejar claro a simple vista que corresponde al día/noche vigente, para
que alguien no pueda reutilizar un ticket de otra noche sin que el barman tenga que operar ninguna
pantalla ni loguearse en ningún sistema.

## Objetivo

- Al confirmar una venta hecha por una cajera logueada en `/caja`, se imprime automáticamente un ticket
  físico en la impresora térmica, sin acción extra de la cajera.
- El ticket es legible a simple vista, con la lista de tragos pedidos bien grande (lo que importa para
  prepararlos/entregarlos).
- El ticket identifica de forma visual y simple que corresponde a la noche vigente (para que no se pueda
  reutilizar un ticket de otro día), sin que el barman escanee ni se loguee en nada.
- `/caja` muestra el estado real de la impresora (conectada o no) y permite disparar una impresión de
  prueba en cualquier momento.
- Si la impresión falla (sin papel, desconectada, etc.), la venta queda registrada igual — la cajera
  puede reintentar la impresión del mismo ticket las veces que haga falta, sin rehacer el cobro.
- Se puede reimprimir un ticket ya vendido desde el historial de `/caja`.
- La noche se abre con una **acción manual explícita** de la administradora desde `/admin` (ya no
  automática al arrancar el server ni al iniciar sesión), para que el inicio real del turno quede
  registrado con precisión.
- Al abrir la noche, la administradora define una palabra clave obligatoria, que queda impresa en cada
  ticket vendido durante esa noche (se puede corregir después si hace falta, mientras la noche siga
  activa).

## Historias de usuario

- Como cajera, quiero que al cobrar un trago se imprima el ticket físico automáticamente, para no tener
  que hacer ningún paso extra ni depender del navegador.
- Como cajera, quiero ver si la impresora está conectada y poder hacer una impresión de prueba, para
  saber si hay que avisar de un problema antes de que se acumulen ventas sin imprimir.
- Como cajera, quiero que si falla la impresión la venta no se pierda, y poder reintentar imprimir el
  mismo ticket, para no tener que cobrar de nuevo.
- Como cajera, quiero poder reimprimir un ticket de una venta anterior desde el historial, por si el
  cliente lo pierde o se traba la impresora.
- Como administradora, quiero definir una palabra clave al abrir la noche, para que el ticket físico de
  esa noche se pueda distinguir de tickets de otras noches sin necesitar ningún sistema de validación.
- Como administradora, quiero abrir la noche manualmente cuando arranca el turno real, para que quede
  registrado con precisión cuándo empezó (y no automáticamente al prender la máquina o al loguearme).
- Como cliente, quiero recibir un ticket físico legible con lo que pedí, para saber qué retirar en la
  barra.

## Criterios de aceptación

1. Dado que una cajera confirma una venta en `/caja` con un medio de pago válido, cuando se registra el
   pedido, entonces se dispara automáticamente la impresión del ticket físico, sin botón adicional.
2. Dado un pedido que se originó de forma anónima (no vinculado a un usuario de staff logueado), cuando
   se confirma, entonces **no** se imprime ningún ticket físico automáticamente (ese circuito queda
   fuera de esta feature).
3. Dado que la impresora no está conectada o falla al imprimir, cuando se intenta imprimir el ticket
   automático, entonces la venta queda igual registrada y cobrada, y `/caja` muestra un aviso con la
   opción de reintentar la impresión de ese mismo ticket.
4. Dado que la cajera reintenta la impresión desde el aviso de error, cuando la impresora vuelve a estar
   disponible, entonces sale el ticket sin duplicar ni modificar la venta original.
5. Dado un pedido ya cobrado en el historial de `/caja`, cuando la cajera elige "Reimprimir Ticket",
   entonces se genera una nueva impresión física idéntica en contenido a la original.
6. El ticket impreso muestra, como mínimo y de forma legible: nombre del local, la lista de tragos
   pedidos (cantidad + nombre) en letra grande, el número de venta de esa noche, la fecha/hora, y la
   palabra clave de la noche vigente.
7. Dado que no hay una noche activa, cuando la administradora intenta abrir una noche nueva desde
   `/admin` sin completar la palabra clave, entonces el sistema no permite confirmar la apertura (campo
   obligatorio). Una vez abierta, la palabra clave se puede corregir mientras la noche siga activa.
8. Dado que no hay ninguna noche activa (recién cerrada, o el sistema recién arrancó y todavía nadie
   abrió una), cuando alguien intenta crear un pedido en `/carta` o vender en `/caja`, entonces el
   sistema lo rechaza con un mensaje claro indicando que la noche no está abierta todavía.
9. Dado que se cierra una noche (manual desde `/admin`, o automáticamente por cambio de día calendario
   al arrancar el server), cuando termina el cierre, entonces **no** se crea ninguna noche nueva de
   forma automática — queda sin noche activa hasta que la administradora abra una manualmente.
10. Al abrir una noche, el `startedAt` registrado es el momento real en que la administradora confirma
    la apertura (no el momento de arranque del servidor ni de un login), para que quede una base de
    datos precisa de cuándo empezó cada turno.
11. El número de venta impreso en el ticket reinicia en 1 en cada noche nueva (reutiliza el
    comportamiento ya existente del sistema para la numeración de pedidos).
12. `/caja` muestra un indicador real (no simulado) de si la impresora está conectada, y permite disparar
    una impresión de prueba en cualquier momento, independientemente de una venta.
13. La impresión del "QR de mesa" en `/admin` no se ve afectada por esta feature (sigue funcionando
    igual que hoy).

## Fuera de alcance

- Cualquier mecanismo de escaneo, validación o canje de tickets en `/barra` (físicos o virtuales) — se
  define en la Fase 4 del roadmap, junto con el pedido online (ver `docs/ROADMAP.md`).
- Tickets virtuales / pedido por la web (Fase 4).
- Selección manual entre múltiples impresoras — se asume una sola impresora térmica conectada al local.
- Corte automático de papel (es una comandera simple, sin cuchilla; se corta a mano).
- Cualquier cambio al flujo de impresión del QR de mesa en `/admin` (usa una impresora distinta, no la
  térmica).
- Mostrar/calcular la **duración del turno** (horas trabajadas) en el resumen de cierre de noche —
  esta feature solo garantiza que `startedAt` quede preciso; un reporte de horas es una feature aparte
  si hace falta más adelante.

## Preguntas abiertas

- ¿Hace falta un límite de longitud/formato para la palabra clave, para que entre bien en el ticket sin
  recortarse?
- Si en algún momento hay más de una caja activa en simultáneo compartiendo la misma impresora, ¿cómo se
  resuelve el acceso concurrente al dispositivo? (Hoy se asume una sola caja activa por vez.)

---

## Plan técnico

### Cambio de alcance: "Abrir Noche" manual

**Hoy no existe un paso manual de "abrir la noche".** `events.service.ts` crea la noche (`night_event`)
sola en dos momentos: al arrancar el server si no hay una `activo`, e inmediatamente después de
`closeEvent()` (crea la siguiente sin pausa ni pantalla intermedia). Esto hace que `startedAt` refleje
"cuándo prendió la máquina", no "cuándo arrancó el turno real" — el usuario pidió corregir esto para que
las horas trabajadas se puedan calcular bien a futuro.

**Diseño**: se elimina la auto-creación de noche tanto en el boot (`initialize()`) como después de
`closeEvent()`. En su lugar:
- Cuando no hay noche `activo`, el sistema queda sin evento activo — `createOrder()` ya tiene el guard
  existente (`Conflict("No hay un evento activo...")`) que ahora se vuelve el mecanismo real de bloqueo,
  no un caso límite.
- Nuevo endpoint `POST /api/events/open` (solo admin): recibe `{ keyword: string }`, valida que no haya
  ya una noche activa, valida que `keyword` no esté vacía, crea el `night_event` con `startedAt =
  Date.now()` en ese momento y la `keyword` seteada desde el arranque.
- `PATCH /api/events/current/keyword` sigue existiendo para corregir la clave mientras la noche está
  activa (confirmado con el usuario: se puede editar después de abierta).
- El auto-cierre por cambio de día calendario (`initialize()`, noche vieja de un día anterior) se
  mantiene igual, pero **ya no crea la noche siguiente** al cerrarla — queda sin noche activa hasta que
  la admin abra una manualmente al llegar.

### Enfoque

Reemplazar el mock de impresora (`PRINTER_CONNECTED`) por un módulo nuevo que escribe bytes ESC/POS
crudos directo al device node (`/dev/usb/lp*`), sin CUPS ni librerías externas. El disparo automático se
inyecta en `OrdersService` como una función opcional (mismo idioma que `generateTicketCodeString`/
`saveTicket` ya usa), no como un evento sobre el bus SSE — la impresión es una acción 1-a-1 que necesita
manejo de error controlado y capacidad de reintento/reimpresión explícita, no un fan-out de notificación.
La palabra clave de la noche viaja como columna nueva en `night_events`, obligatoria para abrir la noche
y editable después mientras siga activa. La apertura de la noche pasa a ser una acción explícita de
`/admin`, eliminando la auto-creación en boot y post-cierre.

### Archivos/módulos afectados

**Backend — módulo nuevo `apps/api/src/modules/printer/`**
- `printer.service.ts` — detecta el device (glob `/dev/usb/lp*`, primero escribible), arma los bytes
  ESC/POS (init, texto normal/doble alto-ancho, feed final), expone `getStatus()`, `printTicket(order,
  nightEvent)`, `printTest()`. Atrapa **toda** excepción internamente (device ausente, permisos, error de
  escritura) y nunca la propaga — devuelve `{ success, message }`.
- `printer.charset.ts` — tabla de mapeo UTF-8 → CP437 (á é í ó ú ñ Ñ ¿ ¡, resto de acentos usados en
  nombres de tragos).
- `printer.controller.ts` — rutas propias: `GET /api/printer/status`, `POST /api/printer/test`,
  `POST /api/printer/reprint/:orderId` (lee el pedido del `OrdersRepository`, no recrea nada).
- Sin capa `repository`: no hay persistencia que abstraer, es un recurso de hardware único (mismo
  criterio que ya usa `mercadopago.service.ts`, que tampoco tiene repository).

**Backend — módulos existentes tocados**
- `apps/api/src/modules/orders/orders.service.ts`: nuevo parámetro opcional en el constructor
  `printTicket?: (order: Order, nightEvent: NightEvent) => Promise<void>`, invocado al final de
  `createOrder()` **solo si `createdBy !== "Cliente"`**. El wrapper que atrapa errores vive en `app.ts`
  (donde se arma la función), no dentro de `orders.service.ts`.
- `apps/api/src/modules/events/events.service.ts`: se elimina la auto-creación de `night_event` en
  `initialize()` (boot) y al final de `closeEvent()`. Nuevo método `openEvent(keyword: string)` que
  valida que no haya noche activa y que `keyword` no esté vacía, y crea el `night_event` con
  `startedAt = Date.now()` real. Nuevo método `setKeyword(nightEventId, keyword)` para corregirla
  mientras la noche sigue activa. `getCurrentEvent()`/`getEventStatus()` deben devolver un estado "sin
  noche activa" en vez de asumir que siempre hay una (hoy el código asume `this.event` siempre existe).
- `apps/api/src/modules/events/events.repository.ts`: leer/escribir la columna `keyword`.
- `apps/api/src/modules/events/events.controller.ts`: nuevo endpoint `POST /api/events/open` (admin,
  body `{ keyword }`) y `PATCH /api/events/current/keyword` (admin — ver Auth/permisos).
- `apps/api/src/modules/orders/orders.service.ts` y `apps/api/src/app.ts`: donde hoy se asume que
  `getActiveEvent()` puede devolver `null` (el guard `Conflict` ya existe), verificar que el mensaje de
  error llegue intacto hasta el frontend.
- `apps/api/src/modules/system/system.controller.ts`: el campo `printer` de `GET /api/system/status` pasa
  a llamar `printerService.getStatus()` en vez de leer `env.PRINTER_CONNECTED`. Se **elimina**
  `GET /api/system/printers` (CUPS/`lpstat`, código muerto real, no se usa en ningún lado).
- `apps/api/src/config/env.ts`: se elimina `PRINTER_CONNECTED`.
- `apps/api/src/app.ts`: DI del nuevo `PrinterService` + construcción del callback inyectado a
  `OrdersService` + inyección de `printerService` en `createSystemController(...)` (mismo patrón que
  `mpService` hoy).

**Frontend**
- `apps/web/src/app/caja/CajaClient.tsx`: `triggerPrint()` deja de llamar `window.print()`, pasa a
  disparar el flujo real (el ticket recién vendido ya se imprimió solo; el botón queda para
  reintentar/reimprimir vía `POST /api/printer/reprint/:orderId`). Estado de impresora real vía
  `GET /api/printer/status` en el lugar donde hoy se muestra el mock. Aviso + botón "Reintentar
  impresión" cuando la impresión automática falla (la respuesta de `POST /api/orders` puede incluir
  `printed: boolean` para decidir si mostrar el aviso).
- `apps/web/src/app/admin/AdminClient.tsx`: nueva pantalla/panel **"Abrir Noche"** (visible cuando no hay
  noche activa) con el campo obligatorio de palabra clave; y, con la noche ya activa, el mismo campo
  queda editable para corregirla. **No se toca** `handleQrPrint()` (`window.print()` del QR de mesa,
  impresora distinta).
- `apps/web/src/app/caja/CajaClient.tsx` — `confirmOrder()`: hoy el `catch` solo hace
  `console.error(err)`, sin mostrar nada en pantalla. Se agrega manejo de error visible (banner) para
  que el mensaje "No hay un evento activo" (noche no abierta) y cualquier otro error de venta lleguen a
  la cajera — hoy fallan en silencio.
- `apps/web/src/services/system.service.ts`: quitar `getPrinters()`; nuevo `printer.service.ts` en el
  frontend para `getStatus`, `test`, `reprint`.

### Cambios de datos

- Migración nueva `supabase/migrations/<timestamp>_add_keyword.sql`:
  ```sql
  ALTER TABLE night_events ADD COLUMN IF NOT EXISTS keyword TEXT;
  ```
  Nullable, sin default (la define un humano; no tiene sentido inventarla). Mismo estilo que
  `20260626175947_add_closed_by.sql`.
- Agregar la entrada correspondiente en `docker-compose.yml` (`init-scripts/14-add_keyword.sql`, siguiente
  número libre después de `13-create_audit_logs`). **Ojo**: `docker-entrypoint-initdb.d` solo corre en el
  primer boot de un volumen nuevo — si ya hay un volumen de Postgres bootstrapeado en desarrollo, hay que
  aplicar el `ALTER TABLE` a mano contra esa instancia.
- `packages/shared/src/domain.ts`: `NightEvent` suma `keyword?: string`.
- **Sync local→cloud**: agregar `keyword` al `eventRecord` que arma `pushEventData` en
  `sync.service.ts`, para que quede como dato de auditoría histórica en cloud. Esto requiere que el
  esquema de Supabase Cloud (fuera de este repo) tenga la columna agregada **antes** de habilitar el
  push — si no, el `upsert` falla y la noche queda en `sync_status: failed` indefinidamente (falla soft,
  no corrompe nada local, pero hay que documentar el paso manual en cloud). Se aprovecha para señalar
  (no arreglar en este plan) que `closed_by` tampoco viaja hoy al cloud — deuda preexistente, separada.
- No hay impacto en RLS (todo el acceso es vía `service_role`, sin RLS de cliente en ninguna fase actual).

### Real-time

Para la impresión: no se agrega ningún evento SSE nuevo. Se descartó reusar `sse-manager.ts` para
disparar la impresión (ver "Alternativas consideradas"). La respuesta HTTP de `POST /api/orders` alcanza
para que `/caja` sepa si imprimió o no (`printed: boolean`).

Para "Abrir Noche": acá sí tiene sentido el bus SSE, porque es un evento de dominio con fan-out real (le
importa a `/caja`, `/carta` y `/admin` a la vez). Se agrega un tipo de evento nuevo `event.opened`
(análogo al `event.closed` que ya existe), emitido desde `EventsService.openEvent()`. `/caja` lo escucha
para sacar cualquier aviso de "noche cerrada" apenas la admin abre.

### Auth/permisos

- `GET /api/printer/status`, `POST /api/printer/test`, `POST /api/printer/reprint/:orderId`: mismo nivel
  que el resto de acciones de caja — `authMiddleware` + `requireRole("admin", "caja")`.
- `POST /api/events/open` y `PATCH /api/events/current/keyword`: `admin` únicamente. Se evalúa si reusar
  el permiso granular `closeNight` existente (ya que hoy es quien gestiona el ciclo de la noche) o no
  exigir permiso granular y dejarlo solo para rol `admin` — a decidir en `/tasks` si hace falta más
  granularidad.
- No se toca ningún permiso de `barman` — el módulo `printer` no expone nada a `/barra` (fuera de
  alcance, confirmado en la spec).

### Riesgos

- **Manejo de error no bloqueante es el riesgo real, no la arquitectura de capas**: tanto el callback
  inyectado en `orders.service.ts` como `printerService.printTicket()` deben atrapar toda excepción sin
  propagarla — un solo `throw` sin capturar en esa cadena rompería el cobro, justo lo que la spec quiere
  evitar. Cubrir con un test que fuerce el device ausente/sin permisos y confirme que `createOrder()`
  igual devuelve 201.
- **Mismatch de esquema cloud** si se sube `keyword` al sync sin haber agregado la columna en Supabase
  Cloud primero (ver "Cambios de datos").
- **Migración no aplica en volúmenes ya bootstrapeados** de Postgres local en desarrollo (hay que
  correrla a mano una vez).
- **Código muerto a limpiar en el mismo cambio** (no dejarlo para después): `GET /api/system/printers`
  (CUPS/`lpstat`) y `PRINTER_CONNECTED` en `env.ts` quedan huérfanos tras esta feature.
- **Concurrencia de acceso al device node**: si en algún momento hay más de una caja imprimiendo a la vez
  (pregunta abierta de la spec), escrituras concurrentes a `/dev/usb/lp*` podrían mezclarse. Hoy se asume
  una sola caja activa; si esto cambia, hay que serializar los `write()` (cola simple en memoria).
- **Eliminar la auto-creación de noche es un cambio de comportamiento observable en producción**: hoy la
  operación nunca se detiene por falta de noche activa (siempre hay una). Después de este cambio, si la
  admin se olvida de abrir la noche, `/caja` y `/carta` van a rechazar toda venta hasta que la abra —
  es el comportamiento buscado, pero hay que probarlo bien en LAN antes de llevarlo al local real para
  que no sea una sorpresa la primera noche.
- **`EventsService` asume hoy que `this.event` siempre existe** (no maneja el caso `null` en
  `getCurrentEvent()`/`getEventStatus()`/etc.) — hay que revisar cada lugar que lee `this.event` para que
  tolere "sin noche activa" sin tirar un error no controlado.

### Alternativas consideradas

- **Reusar `sse-manager.ts` (EventEmitter) para disparar la impresión al emitir `order.created`**:
  descartada. El bus SSE es fan-out de notificación (n suscriptores desconocidos, sin propagación
  controlada de errores); la impresión es una acción 1-a-1 que necesita `try/catch` explícito y
  capacidad de reintento/reimpresión bajo demanda, que no encaja en el modelo de "evento de dominio que
  ya pasó".
- **Agregar una capa `printer.repository.ts`**: descartada. No hay persistencia que abstraer (un solo
  recurso de hardware fijo); agregarla sería una interfaz con un método que nunca va a tener una segunda
  implementación real.
- **Dejar la auto-creación de noche como está y solo agregar la palabra clave como campo opcional**:
  descartada a pedido del usuario — sin un "Abrir Noche" real, `startedAt` sigue reflejando el arranque
  del server/login en vez del inicio real del turno, que es justamente lo que se quiere corregir.
- **CUPS como capa de impresión**: descartada — ya validamos que el backend USB bidireccional de CUPS
  falla silenciosamente con este clon de impresora (ver historial de la sesión de setup físico).

---

## Tareas

### 1. Datos / migración — `supabase-expert`

- [ ] **[supabase-expert]** Crear `supabase/migrations/<timestamp>_add_keyword.sql`:
      `ALTER TABLE night_events ADD COLUMN IF NOT EXISTS keyword TEXT;` (nullable, sin default).
- [ ] Agregar la línea correspondiente en `docker-compose.yml` (`init-scripts/14-add_keyword.sql`,
      siguiente número libre tras `13-create_audit_logs`).
- [ ] Aplicar el `ALTER TABLE` a mano contra el volumen de Postgres local ya bootstrapeado en desarrollo
      (la migración de `docker-entrypoint-initdb.d` no corre sola en un volumen existente).
- [ ] Agregar `keyword?: string` a `NightEvent` en `packages/shared/src/domain.ts`.
- [ ] Dejar anotado en `docs/DEPLOY.md` o similar el paso manual pendiente: correr el `ALTER TABLE`
      equivalente en el proyecto de Supabase Cloud antes de habilitar el sync de este campo (si no, el
      `upsert` de `pushEventData` va a fallar con `sync_status: failed`).

### 2. Backend — módulo `events` (Abrir Noche manual)

- [ ] `events.repository.ts`: leer/escribir la columna `keyword` en los métodos existentes de
      get/create/update.
- [ ] `events.service.ts`: eliminar la auto-creación de `night_event` en `initialize()` (boot) y al final
      de `closeEvent()`.
- [ ] `events.service.ts`: nuevo método `openEvent(keyword: string)` — valida que no haya noche `activo`
      y que `keyword` no esté vacía; crea el `night_event` con `startedAt = Date.now()` real.
- [ ] `events.service.ts`: nuevo método `setKeyword(nightEventId, keyword)` para corregirla mientras la
      noche sigue activa.
- [ ] `events.service.ts`: revisar todo lugar que lee `this.event` asumiendo que siempre existe
      (`getCurrentEvent()`, `getEventStatus()`, `incrementOrderCounter()`, etc.) y manejar el caso
      "sin noche activa" sin tirar un error no controlado.
- [ ] `events.service.ts`: emitir el evento SSE nuevo `event.opened` desde `openEvent()` (mismo patrón
      que `emit({ type: "event.closed", ... })` ya usado en `closeEvent()`).
- [ ] `events.controller.ts`: nuevo `POST /api/events/open` (`authMiddleware` + `requireRole("admin")`,
      body `{ keyword }`).
- [ ] `events.controller.ts`: nuevo `PATCH /api/events/current/keyword` (mismo nivel de permiso).
- [ ] Verificar/agregar test o prueba manual de que `POST /api/orders` sigue devolviendo el `Conflict`
      ("No hay un evento activo...") con mensaje claro cuando no hay noche abierta — el guard ya existe
      en `orders.service.ts`, solo confirmar que no se rompió con los cambios anteriores.

### 3. Backend — módulo nuevo `printer`

- [ ] Crear `apps/api/src/modules/printer/printer.charset.ts` — tabla de mapeo UTF-8 → CP437 (acentos y
      ñ/Ñ usados en nombres de tragos).
- [ ] Crear `apps/api/src/modules/printer/printer.service.ts`:
      - Detección del device (glob `/dev/usb/lp*`, primero escribible).
      - `getStatus()` — no escribe nada, solo confirma si el device existe/es escribible.
      - `printTicket(order, nightEvent)` — arma bytes ESC/POS (init, texto normal + doble alto/ancho,
        feed final) con el layout acordado (BOSKO grande, tragos grandes, número/fecha/clave/código
        normal, código HMAC truncado a 4 chars).
      - `printTest()` — imprime un ticket de prueba fijo.
      - Todo el módulo atrapa **cualquier** excepción internamente y devuelve `{ success, message }` —
        nunca propaga hacia el llamador.
- [ ] Crear `apps/api/src/modules/printer/printer.controller.ts`:
      - `GET /api/printer/status`, `POST /api/printer/test`, `POST /api/printer/reprint/:orderId`
        (lee el pedido vía `OrdersRepository`, no recrea nada).
      - `authMiddleware` + `requireRole("admin", "caja")`.
- [ ] `orders.service.ts`: agregar parámetro opcional en el constructor
      `printTicket?: (order: Order, nightEvent: NightEvent) => Promise<void>`, invocarlo al final de
      `createOrder()` **solo si `createdBy !== "Cliente"`**.
- [ ] `app.ts`: DI de `PrinterService`; armar el callback wrapper (con `try/catch`) que se inyecta en
      `OrdersService`; inyectar `printerService` en `createSystemController(...)`.
- [ ] `system.controller.ts`: reemplazar el campo `printer` de `GET /api/system/status` por una llamada
      real a `printerService.getStatus()`. **Eliminar** `GET /api/system/printers` (CUPS/`lpstat`).
- [ ] `config/env.ts`: eliminar `PRINTER_CONNECTED`.

### 4. Frontend — servicios

- [ ] Crear `apps/web/src/services/printer.service.ts` (`getStatus`, `test`, `reprint`).
- [ ] `apps/web/src/services/system.service.ts`: quitar `getPrinters()`.
- [ ] `apps/web/src/services/events.service.ts`: agregar `openEvent(keyword)` y `setKeyword(keyword)`.
- [ ] `apps/web/src/services/orders.service.ts` (o donde corresponda): confirmar que la respuesta de
      `create()` puede exponer `printed: boolean` si el backend lo agrega a la respuesta de
      `POST /api/orders`.

### 5. Frontend — componentes

- [ ] `apps/web/src/app/admin/AdminClient.tsx`: panel **"Abrir Noche"** (visible cuando no hay noche
      activa) con campo obligatorio de palabra clave + botón de confirmar; con la noche ya activa, el
      mismo campo queda editable para corregirla.
- [ ] `apps/web/src/app/caja/CajaClient.tsx`: reemplazar el estado mockeado de impresora por
      `GET /api/printer/status`; agregar botón "Imprimir ticket de prueba".
- [ ] `apps/web/src/app/caja/CajaClient.tsx`: `triggerPrint()` deja de llamar `window.print()` — pasa a
      usar `POST /api/printer/reprint/:orderId` (ticket recién vendido y reimpresión desde historial).
- [ ] `apps/web/src/app/caja/CajaClient.tsx`: agregar aviso visible + botón "Reintentar impresión" cuando
      la impresión automática falla.
- [ ] `apps/web/src/app/caja/CajaClient.tsx` — `confirmOrder()`: **arreglar el `catch` que hoy solo hace
      `console.error(err)`** — mostrar el error en pantalla (banner), para que "noche no abierta" y
      cualquier otro error de venta se vean.
- [ ] Confirmar que `apps/web/src/app/admin/AdminClient.tsx` — `handleQrPrint()` (QR de mesa) **no se
      toca**.

### 6. Real-time

- [ ] Sumar `event.opened` al tipo `DomainEvent` (o donde esté tipado el bus SSE en
      `shared/sse/sse-manager.ts` / `packages/shared/src/domain.ts`).
- [ ] `apps/web/src/lib/useSSE.ts` o los componentes que lo consumen: manejar `event.opened` (ej. sacar
      cualquier aviso de "noche cerrada" en `/caja` apenas se abre una nueva).

### 7. Documentación

- [ ] Actualizar `docs/ARCHITECTURE.md`: tabla de módulos (§4, sumar `printer`), esquema (§5, nueva
      migración), real-time (§7, evento `event.opened`), modelo de dominio (§10, `NightEvent.keyword`).
- [ ] Actualizar `docs/ROADMAP.md`: mover el ítem de impresora térmica de "Fase 1" a hecho; documentar
      el cambio de comportamiento de apertura de noche (automática → manual).

### 8. Verificación

- [ ] `pnpm typecheck` (api + web) sin errores.
- [ ] Prueba manual end-to-end con la impresora física ya conectada: abrir noche con palabra clave →
      vender en `/caja` → sale el ticket físico con el layout acordado → desenchufar la impresora y
      reintentar → reimprimir desde el historial → cerrar noche → confirmar que no se abre una nueva
      sola → abrir la siguiente manualmente.
- [ ] Confirmar que `/carta` y `/caja` muestran un error claro si se intenta vender sin noche abierta.
- [ ] **[e2e-playwright-tester]** (opcional, si se decide automatizar) smoke test de `/caja` + `/admin`
      cubriendo abrir noche → vender → cerrar noche. **No** incluye `/barra` (fuera de alcance).

---

Al implementar: usar **Plan Mode** dado el tamaño del cambio (toca datos, dos módulos backend nuevos/
modificados, y varios componentes frontend). Ir tildando `- [x]` a medida que se completa cada tarea.
