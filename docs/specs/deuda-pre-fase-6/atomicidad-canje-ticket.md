# Atomicidad del canje de ticket

**Estado**: done
**Fecha**: 2026-07-13

---

## Problema / Por qué

`/barra` es el circuito real del boliche: el barman escanea (o tipea) el código del ticket que
trae el cliente y el sistema marca el pedido como `entregado`. Hoy, `TicketsService.redeemTicket`
(`apps/api/src/modules/tickets/tickets.service.ts`) resuelve esto con un patrón
**leer → chequear en memoria → recién ahí escribir**:

1. Busca el ticket (`findByCode`/`findByReadable`).
2. Chequea en memoria si `ticket.redeemedAt` ya tiene valor (ya fue canjeado) y si
   `order.status !== "pendiente"`.
3. Si ambos chequeos pasan, escribe: `ordersService.updateOrderStatus(..., "entregado", ...)` y
   `ticketsRepo.updateRedemption(...)`.

El `UPDATE` real en `tickets.repository.ts` (`SupabaseTicketsRepository.updateRedemption`) no
tiene ninguna condición sobre `redeemed_at` — es un `UPDATE tickets SET ... WHERE code = ?` liso.
Si dos requests llegan casi al mismo tiempo para el mismo código (dos escaneos seguidos, un
doble-tap en el botón de canje manual, o dos barmans escaneando el mismo ticket en `/barra` sin
saberlo), **ambos pueden pasar el chequeo en memoria antes de que cualquiera de los dos escriba**,
porque el chequeo lee un estado que todavía no cambió. Resultado: el pedido queda marcado
`entregado` dos veces, y en el peor caso el barman interpreta el segundo "canje exitoso" como luz
verde para entregar el trago una segunda vez.

Este es el riesgo **R3** documentado en `docs/ROADMAP.md` desde la Fase 2 ("a verificar"), nunca
resuelto. Para quién: el **barman** que opera `/barra` en el momento de mayor presión de la noche
(cola de clientes retirando tragos), y el **admin/dueño** que confía en que "un ticket = un trago
entregado" para que los totales de cierre de noche sean reales.

---

## Objetivo

Que el canje de un ticket sea **atómico**: si dos requests concurrentes intentan canjear el mismo
código de ticket, **exactamente uno** tiene éxito y el otro recibe, de forma determinística, el
mismo error de "ticket ya canjeado" que hoy se muestra para un canje repetido no-concurrente — sin
importar el orden real de llegada ni el timing exacto de las dos requests.

Esto se resuelve a nivel del **estado en la base de datos** (la fuente de verdad), no con locks a
nivel de aplicación en el proceso Node — el punto de decisión final tiene que ser la propia
escritura condicional en Postgres, porque es lo único que ve ambas requests de forma serializada
sin importar en qué hilo/tick de Node se estén ejecutando.

El comportamiento visible para roles que **no** están en una carrera de concurrencia (el caso
normal, un solo canje por ticket) **no cambia en nada**: mismo flujo, mismos mensajes, misma
respuesta.

---

## Historias de usuario

- Como **barman**, si escaneo un ticket que otro compañero ya está canjeando en simultáneo (dos
  puestos de `/barra`, o un doble-tap mío por apuro), quiero que el sistema me deje claro que ya
  se canjeó, no que ambos escaneos "funcionen" y yo entregue el trago dos veces sin darme cuenta.
- Como **admin**, quiero que "cantidad de tickets canjeados" en los totales de la noche sea un
  número real y confiable, sin duplicados invisibles causados por una carrera de canje.
- Como **desarrollador/agente** que en el futuro toque `TicketsService` u `OrdersService`, quiero
  que la protección contra doble-canje esté en el lugar correcto (la escritura a la base), para no
  reintroducir el mismo bug si alguien reescribe el chequeo en memoria sin darse cuenta del riesgo.

---

## Criterios de aceptación

1. **Dado** un ticket sin canjear, **cuando** llegan dos requests de canje para el mismo código
   prácticamente al mismo tiempo (concurrencia real, no secuencial), **entonces** una responde con
   éxito (pedido `entregado`) y la otra responde con el error de "ticket ya canjeado" — nunca las
   dos con éxito, nunca las dos con error.
2. **Dado** el escenario anterior, **cuando** se revisa el pedido asociado después, **entonces**
   el pedido quedó marcado `entregado` una sola vez, con un solo `redeemedBy`/`redeemedAt`
   consistente con la request que ganó la carrera — no hay un segundo intento de transición de
   estado que haya alcanzado a aplicarse parcialmente.
3. **Dado** el flujo normal sin concurrencia (un canje, después otro intento del mismo código
   más tarde), **cuando** se prueba, **entonces** el comportamiento es exactamente el mismo que
   hoy: el segundo intento falla con el mensaje "Ticket ya canjeado a las HH:MM:SS" (con la hora
   real del primer canje).
4. **Dado** que el mismo tipo de carrera podría existir en la transición de estado de la orden
   (`OrdersService.updateOrderStatus`, chequeada hoy también con read-then-write en
   `order.status !== "pendiente"`), **cuando** se audita ese código, **entonces** se confirma si
   comparte el mismo riesgo y, si es así, se corrige con el mismo criterio (escritura condicional
   en la base) — no se da por resuelto el ticket sin mirar la orden, porque ambas escrituras
   ocurren en la misma operación de canje.
5. **Dado** el fix, **cuando** se corre la suite de tests del módulo `tickets` (y `orders` si
   aplica el punto 4), **entonces** hay al menos un test que reproduce la concurrencia real (dos
   llamadas verdaderamente en paralelo, `Promise.all`, contra Supabase local real — no un mock que
   serialice las dos llamadas y esconda la carrera) y confirma el criterio 1.
6. **Dado** el fix, **cuando** se revisan los mensajes de error que ve el barman en `/barra`,
   **entonces** no cambian de redacción para el caso no-concurrente — este trabajo es sobre
   corrección de datos, no sobre UX.

---

## Fuera de alcance

- Cualquier cambio de UI en `/barra` (el componente `PendingOrdersList`, `ManualRedeemModal`,
  `CancelOrderModal` no se tocan salvo que el fix requiera un mensaje de error nuevo para el caso
  de carrera perdida — y en ese caso, es el mismo mensaje que ya existe para "ya canjeado").
- Protección contra **doble-cobro** en caja (`/caja`) — es un problema de dominio distinto
  (pagos, no canje de tickets) y ya se trabajó por separado (ver el fix del error 2205 de
  Mercado Pago Posnet, `docs/ROADMAP.md`).
- Migrar `redeemTicket`/`updateOrderStatus` a una transacción SQL multi-tabla explícita
  (Postgres `BEGIN`/`COMMIT` cruzando `tickets` y `orders`) si una escritura condicional simple
  por tabla ya cierra el riesgo — no agregar complejidad de transacciones distribuidas si no hace
  falta. Se define en `/plan` según lo que encuentre la auditoría del criterio 4.
- Cualquier cambio al esquema de `tickets`/`orders` que no sea estrictamente necesario para la
  escritura condicional (ej. no se agregan columnas nuevas si `redeemed_at IS NULL` / `status`
  alcanzan).

---

## Preguntas abiertas

- ~~Si el criterio 4 confirma que `OrdersService.updateOrderStatus` comparte el mismo riesgo en
  otros call sites...~~ **Resuelto en el Plan técnico**: sí lo comparte (confirmado, `PATCH
  /orders/:id/status` es el mismo código), y el fix se generaliza a todas las transiciones de
  `OrdersService` porque el costo marginal es mínimo (un parámetro nuevo) y cierra el riesgo de
  una sola vez.

---

## Plan técnico

### Enfoque

Ninguna de las dos razas (doble-canje del mismo ticket, canje-vs-cancelación concurrente del mismo
pedido) necesita una transacción SQL multi-tabla ni una función RPC — alcanza con que cada `UPDATE`
sea **condicional** sobre el estado que se está leyendo (`WHERE status = 'pendiente'` /
`WHERE redeemed_at IS NULL`), usando el propio row-level lock de Postgres para serializar. La
pieza clave es el **orden**: `orders.status` actúa como el gate único de la operación completa —
se transiciona la orden primero (condicionado a `pendiente`), y **solo si esa escritura gana la
carrera** se marca el ticket como canjeado. Invertir el orden (ticket primero) reintroduciría el
riesgo de inconsistencia (ticket "canjeado" con una orden que en el medio se canceló). Consultado
con el agente `supabase-expert` (2026-07-13) — ver conversación de esta sesión.

### Archivos/módulos afectados

- `apps/api/src/modules/orders/orders.repository.ts` — `updateStatus` gana un parámetro
  `expectedStatus?: OrderStatus`. Si se pasa, el `UPDATE` agrega `.eq("status", expectedStatus)`.
  Cambia `.select().single()` → `.select().maybeSingle()` (0 filas afectadas ya no debe tirar un
  error de PostgREST, tiene que poder distinguirse como "perdí la carrera"). Firma de retorno pasa
  de `Promise<Order>` a `Promise<Order | undefined>` (`undefined` = no se cumplió la condición).
- `apps/api/src/modules/orders/orders.service.ts` — `updateOrderStatus` pasa `expectedStatus:
  order.status` (el valor que ya leyó, mismo que usa hoy para validar `STATUS_TRANSITIONS`) al
  repository. Si vuelve `undefined`, re-lee la orden actual (`findById`) para armar el mismo
  mensaje de error que hoy (`Conflict` con el estado real) — el chequeo `STATUS_TRANSITIONS` en
  memoria se mantiene igual como validación previa de UX (mensaje más claro para transiciones
  inválidas de negocio), la condición en la base es la que garantiza la atomicidad real.
- `apps/api/src/modules/tickets/tickets.repository.ts` — `updateRedemption` agrega
  `.is("redeemed_at", null)` al `UPDATE` y cambia a `.maybeSingle()`. Retorno pasa a
  `Promise<Ticket | undefined>`.
- `apps/api/src/modules/tickets/tickets.service.ts` — `redeemTicket` invierte el orden de
  escritura: primero `ordersService.updateOrderStatus(order.id, "entregado", username, {...})`
  (ahora atómico); si tira `Conflict` (perdió la carrera o transición inválida), se propaga tal
  cual — no se toca `tickets`. Si tiene éxito, recién ahí `ticketsRepo.updateRedemption(...)`. Si
  esta segunda escritura devolviera `undefined` (no debería pasar dado que la invariante 1:1
  ticket↔orden y el gate en `orders` ya lo previenen, pero es defensa en profundidad), se loguea
  como error interno (`console.error`) sin romper la respuesta al barman — la orden ya quedó
  `entregado` correctamente, que es lo que le importa a `/barra`.
- `apps/api/src/modules/orders/orders.controller.ts` (`PATCH /orders/:id/status`, cancelación
  manual desde `/admin`/`/barra`) — sin cambios de código: se beneficia automáticamente porque usa
  el mismo `OrdersService.updateOrderStatus`.
- Tests nuevos/actualizados: `tickets.service.test.ts`, `tickets.repository.ts` (si tiene test
  propio — confirmar), `orders.service.test.ts`, `orders.repository.ts` (ídem). Al menos un test
  de integración (`apps/api/tests/integration/`) con `Promise.all` de dos canjes reales contra
  Supabase local levantado, para cumplir el criterio 5 de la spec (no mockear la carrera).

### Cambios de datos

Ninguno. No hace falta migración nueva de esquema — `tickets.redeemed_at` y `orders.status` ya
existen y ya son las columnas correctas para las condiciones `WHERE`. No se toca
`packages/shared/src/domain.ts` (los tipos `Order`/`Ticket` no cambian de forma).

### Impacto en sync / offline-first

Ninguno. Son los mismos `UPDATE` de siempre contra el Postgres **local** (fuente de verdad),
solo con una cláusula `WHERE` adicional y `.maybeSingle()` en vez de `.single()`. `pushEventData`
(sync local→cloud al cerrar la noche) sigue empujando el estado final ya consistente — no cambia
el contrato de sync. Sin dependencia de red externa, sigue funcionando 100% offline.

### Real-time (SSE)

Sin cambios de contrato: `OrdersService.updateOrderStatus` sigue emitiendo `order.updated` una
sola vez por transición exitosa (`emit({ type: "order.updated", order: updated })`), igual que
hoy. La diferencia es que ahora, si dos requests concurrentes compiten, **solo la ganadora** llega
a ese `emit` — antes, en el escenario de carrera, existía el riesgo (no confirmado si se manifestó
en producción, pero real en el código) de que ambas emitieran el evento. Ver que `/barra` y
`/admin` (via `useEventState`) sigan reflejando bien un solo `order.updated` en el test de
integración concurrente.

### Auth/permisos

Sin cambios. El endpoint de canje (`POST /api/tickets/redeem`) ya requiere rol `admin`/`barman`
(`docs/ARCHITECTURE.md` §4); `PATCH /orders/:id/status` ya tiene su propio guard de rol. Esta spec
no toca superficie de autorización, solo la atomicidad de la escritura.

### Riesgos

- **Mensaje de error para el perdedor de la carrera**: hoy, un canje repetido no-concurrente
  muestra `"Ticket ya canjeado a las HH:MM:SS"` con la hora real (lee `ticket.redeemedAt` de la
  fila ya actualizada). En el caso de carrera pura, el perdedor pierde en el gate de `orders`, no
  en `tickets` — su mensaje de error va a ser el de "transición inválida" (`Conflict` con el
  estado real de la orden, ya `entregado`), **no** literalmente "Ticket ya canjeado a las...". Es
  un mensaje distinto pero igual de claro (le dice al barman que el pedido ya se entregó). Si se
  quiere el mensaje idéntico en ambos casos, hay que decidirlo en `/tasks` — no es necesario para
  cerrar el riesgo real (doble entrega física), es un detalle de copy.
- **Otros callers de `OrdersRepository.updateStatus`** fuera de `OrdersService.updateOrderStatus`
  (si los hubiera) quedan sin el nuevo parámetro por default (`expectedStatus` opcional, backward
  compatible) — no rompen, pero tampoco ganan la protección salvo que se les pase explícitamente.
  Confirmar en `/tasks` que no hay otro call site directo del repository que se salte el service.
- **Tests de integración con concurrencia real** son más lentos y ligeramente flaky por naturaleza
  (dependen de timing real contra Postgres) — mitigar con `Promise.all` de exactamente 2 llamadas
  (no requiere timing fino, Postgres serializa los locks de fila igual) en vez de intentar
  sincronizar milisegundos a mano.

### Alternativas consideradas

- **Función RPC transaccional (Postgres `SECURITY DEFINER`, `BEGIN`/`COMMIT` envolviendo ambos
  UPDATEs)**: descartada para esta spec — dos UPDATEs condicionales con el orden correcto ya dan
  atomicidad determinística sin necesitar una transacción explícita, y el proyecto no usa RPC en
  ningún otro lado hoy (agregar el primer stored procedure es una superficie nueva de
  mantenimiento — migraciones que aplicar a mano contra cloud, permisos `GRANT EXECUTE`, sync de
  schema manual — que no se justifica para este caso). Se anota como patrón a reconsiderar si en
  el futuro aparece una invariante que cruce 3+ tablas sin una columna "gate" natural común (ver
  nota del `supabase-expert` en la sesión).
- **Locks a nivel de aplicación (mutex en memoria por `orderId`/`ticketCode`)**: descartado — no
  serializa entre múltiples instancias del proceso Node (aunque hoy corre una sola instancia por
  local, es una limitación real e innecesaria) y el propio Postgres ya resuelve esto mejor sin
  ese código extra.
- **Optimistic locking con columna de versión (`version INT`)**: descartado — agrega una columna y
  lógica de reintento que no aporta nada sobre el enfoque de "condición sobre el campo de negocio
  que ya existe" (`status`/`redeemed_at` ya son, en efecto, la versión que importa acá).

---

## Tareas

### Backend — `orders` (el gate)

- [ ] `apps/api/src/modules/orders/orders.repository.ts` — agregar `expectedStatus?: OrderStatus`
  a la firma de `updateStatus` (interfaz `OrdersRepository` + implementación
  `SupabaseOrdersRepository`). Si viene, encadenar `.eq("status", expectedStatus)` al `UPDATE`.
  Cambiar `.select().single()` → `.select().maybeSingle()`. Cambiar el tipo de retorno de
  `Promise<Order>` a `Promise<Order | undefined>`.
- [ ] `apps/api/src/modules/orders/orders.service.ts` — `updateOrderStatus` pasa
  `expectedStatus: order.status` (el valor recién leído) al repository. Si el resultado es
  `undefined`, re-leer la orden (`findById`) y lanzar `Conflict` con el estado real (mismo
  mensaje que hoy: `` `El pedido está en un estado (${current.status}) que no se puede entregar.` ``
  o el mensaje equivalente para la transición que corresponda). Ajustar el `return type` de la
  función si hace falta (sigue devolviendo `Order`, ya no `Order | undefined`, porque acá ya se
  resolvió el caso `undefined` con el `throw`).
- [ ] Revisar (grep) que no haya otro caller de `OrdersRepository.updateStatus` que salte por
  encima de `OrdersService.updateOrderStatus` — si lo hay, decidir si también necesita
  `expectedStatus` o si queda documentado como excepción.

### Backend — `tickets` (defensa en profundidad + orden invertido)

- [ ] `apps/api/src/modules/tickets/tickets.repository.ts` — `updateRedemption` agrega
  `.is("redeemed_at", null)` al `UPDATE`, cambia a `.maybeSingle()`, retorno pasa a
  `Promise<Ticket | undefined>` (interfaz `TicketsRepository` + implementación
  `SupabaseTicketsRepository`).
- [ ] `apps/api/src/modules/tickets/tickets.service.ts` — invertir el orden en `redeemTicket`:
  mover la llamada a `ordersService.updateOrderStatus(...)` **antes** de
  `ticketsRepo.updateRedemption(...)`. Si `updateRedemption` devuelve `undefined` (caso borde, no
  debería ocurrir dado el gate en `orders`), loguear con `console.error` sin romper la respuesta
  (la orden ya quedó `entregado` correctamente).
- [ ] Confirmar que el chequeo `if (ticket.redeemedAt)` en memoria (líneas actuales ~74-81 de
  `tickets.service.ts`) se mantiene como **fail-fast de UX** (mensaje rápido sin ir a la base para
  el caso obvio no-concurrente) pero ya no es la única protección — dejar un comentario corto
  explicando por qué sigue ahí pese a que la atomicidad real vive en el `UPDATE` condicional.

### Tests

- [ ] `apps/api/src/modules/orders/orders.repository.test.ts` (o donde corresponda) — test
  unitario: `updateStatus` con `expectedStatus` que no matchea devuelve `undefined` sin tirar
  error; con `expectedStatus` que matchea, actualiza normal.
- [ ] `apps/api/src/modules/orders/orders.service.test.ts` — test: `updateOrderStatus` propaga
  `Conflict` con el estado real cuando el repo devuelve `undefined` (mockeado).
- [ ] `apps/api/src/modules/tickets/tickets.service.test.ts` — actualizar mocks al nuevo orden de
  llamadas (orders antes que tickets) y a las nuevas firmas `Promise<T | undefined>`. Agregar caso:
  si `ordersService.updateOrderStatus` tira `Conflict`, `ticketsRepo.updateRedemption` **no** se
  llama (verificar con spy).
- [ ] **Test de integración con concurrencia real** (nuevo, en
  `apps/api/tests/integration/`, contra Supabase local levantado — no mocks): crear una orden +
  ticket real, disparar `Promise.all([redeemTicket(code, "barman1"), redeemTicket(code,
  "barman2")])`, y verificar: exactamente una de las dos promesas resuelve OK y la otra rechaza
  con `Conflict`; el pedido en la base quedó `entregado` una sola vez, con un `deliveredBy`
  consistente con la que ganó. Este es el criterio de aceptación 1 y 5 de la spec — no dar la
  tarea por completa sin este test corriendo en verde contra la DB real.
- [ ] (Opcional, mismo patrón) test de integración para la raza 4 (canje concurrente con
  cancelación vía `PATCH /orders/:id/status`) si el tiempo lo permite — no bloqueante para cerrar
  la spec, pero cubre el criterio 4 de forma más completa.

### Verificación de cierre

- [ ] `pnpm typecheck` (api + web) en verde.
- [ ] `pnpm --filter cocktrail-api test:unit` y `pnpm --filter cocktrail-api test:integration`
  (requiere Supabase local levantado, `docker compose up -d` / `supabase start`) en verde.
- [ ] Actualizar `docs/ROADMAP.md`: marcar R3 como resuelto en la tabla de Riesgos y en la sección
  "Deuda pre-Fase 6", con fecha y una línea de qué se hizo (mismo formato que el resto de riesgos
  resueltos).
- [ ] Cambiar el estado de esta spec de `draft` a `done` en el header del archivo.
- [ ] (Opcional, si hay tiempo) pedir una pasada rápida de `e2e-playwright-tester` sobre `/barra`
  para confirmar que el flujo normal de canje (no-concurrente) se ve exactamente igual que antes
  desde la UI — esta spec no cambia UX, solo correctness de backend.

---

**Siguiente paso**: implementar siguiendo este checklist (Plan Mode recomendado si se quiere
revisar el diff completo antes de aplicar, dado que toca 2 módulos backend + su capa de tests).
Ir marcando `- [x]` a medida que se completa cada tarea.
