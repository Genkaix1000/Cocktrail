# Noches de prueba y borrado de noches

> Estado: `approved` — plan listo · 2026-08-08 · Slug: `noches-de-prueba-y-borrado`

---

## Problema / Por qué

El 2026-08-07 se hicieron pruebas de impresión en el boliche con el sistema en producción. No hay
forma de decirle al sistema "esto es una prueba", así que **esa noche quedó registrada como venta
real**: aparece en el historial de `/admin`, suma en los totales y ensucia el arqueo. Alguien que
mire el panel mañana no tiene manera de distinguir una noche de prueba de una noche de trabajo.

Y una vez registrada, **no hay forma de sacarla**. Los scripts que existen no sirven:
`cleanup-empty-nights` solo borra noches sin ningún pedido, y `reset-data` borra *todo* (incluidos
usuarios y auditoría). Para deshacer una noche puntual hoy hay que entrar a la base a mano.

Esto va a volver a pasar: cada vez que se cambie de impresora (la Goojprt MPT-II está comprada y
pendiente de probar), se toque el ticket o se pruebe un flujo nuevo, hay que probar **en el local,
con el hardware real**. Probar no puede costar un arqueo sucio.

**Rol afectado**: `admin` (le ensucia los números) y quien opere la comandera durante una prueba.

---

## Objetivo

Que **probar el sistema sea gratis en términos de datos**, y que un error se pueda deshacer.

1. **Abrir una noche de prueba**: se comporta igual que una noche real de cara al operador —vende,
   imprime el ticket, numera pedidos, muestra totales, se cierra— pero **no deja ningún rastro
   persistido**. No existe para `/admin`, ni para el historial, ni para el arqueo. Nunca hubo que
   limpiarla porque nunca se escribió.

2. **Saber en todo momento que estás en una prueba**: un aviso permanente e imposible de pasar por
   alto en las pantallas de venta y de administración, para que nadie venda de verdad creyendo que
   está probando ni al revés.

3. **Borrar una noche ya registrada**: cuando alguien se olvidó de tildar "prueba", el admin puede
   eliminar esa noche y todo lo que colgaba de ella, desde el panel, con una confirmación seria. Y
   existe un camino por línea de comandos para el caso en que el panel no esté disponible.

---

## Historias de usuario

- **Como admin** quiero abrir la noche marcándola como prueba, para poder verificar la impresora
  y el flujo de venta en el local sin que esos números entren al arqueo.
- **Como quien opera la comandera** quiero ver claramente que estoy en una noche de prueba, para
  no cobrarle de verdad a un cliente pensando que estaba probando.
- **Como admin** quiero que una noche de prueba no aparezca en ningún lado del panel, para que el
  historial y los totales sean siempre plata real.
- **Como admin** quiero borrar una noche del historial cuando me olvidé de marcarla como prueba,
  para que el arqueo cierre sin tener que entrar a la base de datos.
- **Como admin** quiero que el borrado quede auditado (quién, cuándo, qué noche, cuánta plata se
  fue), para que no sea un agujero silencioso por donde desaparezca facturación.
- **Como dueño** quiero que borrar una noche sea difícil de hacer por accidente, para que nadie
  se lleve puesta una noche real con un toque distraído en la tablet.

---

## Criterios de aceptación

### A. Abrir una noche de prueba

- **A1** — Given que no hay noche activa, When el **admin** abre la noche, Then el diálogo de
  apertura ofrece marcarla como **noche de prueba**, desmarcado por defecto. El rol `caja` sigue
  pudiendo abrir noches, pero **no ve la casilla**: las suyas son siempre reales.
- **A2** — La marca de prueba se decide **al abrir** y no se puede cambiar después. Una noche real
  no se puede convertir en prueba, ni viceversa.
- **A3** — Given una noche de prueba activa, When se registra una venta, Then el pedido se numera,
  el ticket se imprime y los totales en pantalla se actualizan **igual que en una noche real**.
- **A4** — Given una noche de prueba, When se consulta el historial de noches, Then esa noche **no
  aparece**, ni durante ni después de cerrarla.
- **A5** — Given una noche de prueba que se cerró, When se revisa el estado del sistema, Then no
  quedó ningún registro persistido de esa noche ni de sus ventas, pedidos o tickets.
- **A6** — Given una noche de prueba activa, When el proceso del servidor se reinicia o se duerme,
  Then la noche se pierde por completo y el sistema queda sin noche activa. **Es el comportamiento
  esperado**, no un error (ver Supuestos).

### B. Aviso visible

- **B1** — Given una noche de prueba activa, When se entra a la pantalla de venta, Then hay un
  aviso permanente y visualmente distinto (color de alerta) que dice que es una noche de prueba y
  que **nada se va a guardar**.
- **B2** — Lo mismo en el panel de administración, mientras la noche de prueba esté activa.
- **B3** — El aviso no se puede cerrar ni ocultar; desaparece solo al cerrarse la noche.
- **B4** — El ticket impreso durante una noche de prueba **se distingue a simple vista** de un
  ticket real, para que nadie lo presente en la barra como comprobante válido.

### C. Cobros durante una noche de prueba

- **C1** — Given una noche de prueba activa, When se intenta cobrar por Mercado Pago (QR o Posnet),
  Then el sistema lo rechaza con un mensaje claro: *"Noche de prueba: solo efectivo"*.
- **C2** — El cobro en efectivo funciona normalmente y suma a los totales en pantalla.
- **C3** — Ninguna noche de prueba puede generar movimientos reales de dinero.

### D. Borrar una noche registrada

- **D1** — Given el historial de noches en el panel, When el usuario es admin, Then cada noche
  cerrada ofrece la acción de eliminarla. Para el rol `caja` la acción **no existe**.
- **D2** — Given que el admin pide borrar una noche, When se abre la confirmación, Then debe
  **escribir la fecha de esa noche** y **volver a ingresar su contraseña** —el mismo nivel de
  fricción que ya tiene el cierre de noche— antes de que el botón se habilite.
- **D3** — La confirmación muestra **qué se va a perder**: fecha, cantidad de pedidos y total
  facturado de esa noche.
- **D4** — When se confirma, Then se elimina la noche junto con todos sus pedidos, tickets y ventas
  en efectivo asociados. No queda nada colgando ni referencias rotas.
- **D5** — Given una noche que tuvo cobros por Mercado Pago, When se la borra, Then esos cobros
  **se borran también**, pero la confirmación advierte antes **cuántos son y por cuánta plata**.
  El borrado nunca es silencioso.
- **D6** — La **noche activa no se puede borrar**. Primero hay que cerrarla.
- **D7** — Todo borrado queda registrado en la auditoría con: quién lo hizo, cuándo, qué noche
  (fecha e identificador) y el total que se eliminó.
- **D8** — Given que se borró una noche, When el panel se refresca, Then el historial y los totales
  acumulados ya no la incluyen.

### E. Camino por línea de comandos

- **E1** — Existe un comando para borrar una noche indicando su fecha o su identificador.
- **E2** — Antes de borrar, el comando muestra a qué base está apuntando, qué noche va a borrar y
  cuánto se va a perder, y **exige una confirmación tipeada explícita** (mismo patrón que los
  scripts que ya existen).
- **E3** — Sin confirmación explícita, el comando no borra nada.
- **E4** — El borrado por comando **también queda auditado**, igual que el del panel.

### F. Deshacer la noche del 2026-08-07

- **F1** — La noche de pruebas del 2026-08-07 queda eliminada de la base de producción usando el
  camino de la sección E, con su registro de auditoría correspondiente.
- **F2** — Después de eso, el historial y los totales de `/admin` reflejan únicamente noches reales.

---

## Fuera de alcance

- **Marcar noches ya registradas como "de prueba" retroactivamente.** Una noche registrada por
  error se borra, no se re-etiqueta.
- **Recuperar una noche borrada.** El borrado es definitivo; el resguardo es el backup de la base,
  no una papelera dentro de la app.
- **Cobros de Mercado Pago en noches de prueba** (queda bloqueado; ver Supuestos).
- **Un entorno de pruebas separado.** Sigue habiendo una sola base. Esto no resuelve **R16** (los
  tests de integración pegando contra producción), que necesita su propio proyecto Supabase.
- **Persistir la noche de prueba entre reinicios.**
- **Modo prueba en `/admin` para la carta, usuarios o configuración de Mercado Pago.** El alcance
  es la noche de venta.
- **El modo demo existente (`/admin?demo=true`)**, que muestra números inventados en el dashboard.
  Es un problema distinto y ya está anotado como riesgo abierto en el roadmap.
- **Borrado masivo o por rango de fechas.** Una noche por vez.

---

## Supuestos (decisiones ya tomadas)

1. **La noche de prueba no persiste nada.** Se descartaron las alternativas de "guardar marcada con
   una bandera y filtrarla en el panel" y "guardar y borrar al cerrar". El usuario eligió que no
   toque la base en absoluto: si no se escribe, no hay nada que filtrar ni que limpiar, y no hay
   riesgo de que un filtro mal puesto la deje ver en algún reporte.
2. **La marca se elige al abrir la noche**, con una casilla en el diálogo de apertura. No hay
   interruptor global de "modo prueba" en Ajustes, justamente para que no quede prendido de una
   noche para la otra.
3. **Mercado Pago queda bloqueado en noche de prueba.** El registro de un cobro de MP depende de que
   la noche exista en la base, y en una noche de prueba no existe. En vez de dejar que falle de
   manera confusa, se rechaza de entrada con un mensaje claro. Si algún día hay que probar un cobro
   real de MP, se abre una noche normal y después se la borra con la funcionalidad de la sección D.
4. **La noche de prueba se pierde si el proceso reinicia.** Vive en la memoria del servidor, y el
   plan gratuito de Render duerme el servicio a los 15 minutos sin tráfico. Aceptado: una prueba
   dura un rato y se hace con la pantalla abierta.
5. **El borrado de noches vive tanto en el panel como en la línea de comandos.** El panel porque el
   caso real es "me olvidé de tildar prueba" y hay que resolverlo desde el local; el comando porque
   la noche del 2026-08-07 hay que borrarla ya y porque sirve de salida de emergencia.

---

## Preguntas abiertas

- **P2 — ¿La numeración de pedidos de una noche de prueba arranca de cero?** Si comparte contador
  con las noches reales, una prueba dejaría huecos en la numeración real. Propuesta: contador
  propio, que arranca en 1 y muere con la noche.
- **P3 — ¿Cómo se distingue el ticket de prueba en el papel?** Una leyenda tipo `*** PRUEBA ***`
  arriba y abajo es lo más barato y lo más legible. A confirmar con el ticket real impreso.
- **P5 — ¿Hace falta un tope de seguridad para el borrado?** Por ejemplo, exigir un paso extra si
  la noche supera cierto monto. Probablemente innecesario dado el nivel de fricción de **D2**.

### Resueltas

- **P1 — cobros de Mercado Pago al borrar una noche** → **se borran también**, con advertencia
  explícita de cuántos son y por cuánto. Razón: las pruebas se hacen contra la cuenta de MP del
  desarrollador, no la del dueño, así que no hay conciliación real que proteger. *(2026-08-08)*
- **P4 — quién puede abrir una noche de prueba** → **solo el rol `admin`**. El rol `caja` sigue
  pudiendo abrir noches, pero siempre reales: no ve la casilla. *(2026-08-08)*

---

## Notas de encuadre

- Esta spec **no contradice la arquitectura vigente**, pero sí toca un punto sensible: hoy hay
  **una sola base (Supabase Cloud) con escritura directa en tiempo real**, sin base local ni
  sincronización. No existe un entorno donde probar sin riesgo, y por eso hace falta esto.
- Relacionado con **R16** del roadmap (los tests de integración apuntan a producción y ya borraron
  datos reales dos veces). Esta feature **no lo resuelve**, pero baja la frecuencia con la que hace
  falta "probar contra la base real a mano".

---

# Plan técnico

> 2026-08-08 · Encuadrado contra el código real (no contra `docs/ARCHITECTURE.md`, que fue corregido
> en este mismo movimiento junto con la limpieza del sync muerto).

## Enfoque

Dos mitades independientes, que se pueden implementar y mergear por separado.

**Noche de prueba** → la rama "prueba vs real" vive **en la capa de repositorio, no en los
servicios**. Se introduce un store en memoria y tres decoradores (`TestAware*Repository`) que
envuelven a los `Supabase*Repository` de eventos, pedidos y tickets. Cuando la noche activa está
marcada como prueba, el decorador escribe y lee del store; si no, delega al de Supabase. Los
servicios (`EventsService`, `OrdersService`, `TicketsService`) **no se tocan**: siguen creyendo que
hablan con la base. Así no hay `if (esPrueba)` desparramados por la lógica de venta, que es
exactamente donde un olvido costaría una noche real escrita en memoria o una de prueba escrita en la
nube.

**Borrado de noches** → una **función de Postgres** (`delete_night`) invocada por RPC. El requisito
duro es la atomicidad: hay que borrar en 4 tablas con dos claves foráneas sin cascada, y
`supabase-js` no tiene transacciones (serían 4 requests HTTP sueltos). PostgREST corre cada RPC en
una única transacción, así que la función es todo-o-nada gratis. La misma función sirve al endpoint
del panel y al script de línea de comandos.

---

## Archivos y módulos afectados

### Parte 1 — Noche de prueba

**Nuevos**

| Archivo | Qué hace |
|---|---|
| `apps/api/src/modules/events/test-night/test-night-context.ts` | Objeto chico con `activeTestNightId: string \| null`. Única fuente de verdad de "¿la noche activa es de prueba?". Se setea al abrir y se limpia al cerrar y en `initialize()`. |
| `apps/api/src/modules/events/test-night/test-night-store.ts` | Store en memoria: la `NightEvent`, sus `Order[]` y sus `Ticket[]`. Se vacía al cerrar. |
| `apps/api/src/modules/events/test-night/test-aware-events.repository.ts` | Decorador de `EventsRepository`. `create` con `isTest` → store; `getActive`/`update`/`findById`/`delete` enrutan por id; `listClosed` **siempre** va a Supabase (la prueba nunca entra al historial). |
| `apps/api/src/modules/orders/test-aware-orders.repository.ts` | Decorador de `OrdersRepository`. Enruta por `eventId` en `create`/`listForEvent`/`findActive`; `findById` mira primero el store. `listAll` **siempre** Supabase. |
| `apps/api/src/modules/tickets/test-aware-tickets.repository.ts` | Ídem para tickets, enrutando por la orden dueña. |
| `apps/web/src/components/shared/TestNightBanner.tsx` | Banner fijo de alerta. Mismo patrón que `MigrationsBanner.tsx`. |

**Modificados**

| Archivo:línea | Cambio |
|---|---|
| `packages/shared/src/domain.ts:80-88` | `NightEvent` suma `isTest?: boolean`. |
| `apps/api/src/app.ts:71-208` | Cableado: envolver los tres repos con sus decoradores, compartiendo un único `TestNightContext`. **Ojo `app.ts:218`**: `SystemService` recibe `eventsRepo` directo — pasarle el decorado, no el crudo. |
| `apps/api/src/modules/events/events.service.ts:139-160` | `openEvent(keyword, isTest)` propaga la marca al repo y setea el contexto. |
| `apps/api/src/modules/events/events.service.ts:165-215` | `closeEvent` limpia contexto y store. **La regla "noche en $0 se borra" (`:198-208`) no aplica** a una prueba: no hay nada que borrar. |
| `apps/api/src/modules/events/events.service.ts:63-93` | `initialize()` limpia el contexto: tras un reinicio no hay noche de prueba (criterio **A6**). |
| `apps/api/src/modules/events/events.controller.ts:70-86` | `POST /api/events/open` acepta `isTest` en el body (zod). Guard admin-only **para el flag**, con el patrón inline de `/event/close:51`: si `role === "caja"` e `isTest`, `Forbidden`. Abrir noche normal sigue permitido para ambos. |
| `apps/api/src/modules/orders/orders.controller.ts:38-42` | Saltear `logAction` si la noche es de prueba (`logAction` es función libre, no inyectada → chequeo en el call-site). |
| `apps/api/src/modules/printer/printer.service.ts:68-78` | `buildTicketContent` setea `brand: "*** PRUEBA — SIN VALOR ***"` cuando `nightEvent.isTest`. **Reusa el campo `brand` que ya existe** (precedente: `buildTestContent:80-86`) → cero cambios en `buildTicketBytes` ni en `raster.ts`. |
| `apps/api/src/modules/mercadopago/mercadopago-orders.service.ts:106-112` | Rechazar con 409 y mensaje *"Noche de prueba: solo efectivo"*. |
| `apps/api/src/modules/mercadopago/point-payments.service.ts:123-140` | Ídem. |
| `apps/web/src/components/admin/OpenNightModal.tsx:21-43` | Checkbox "noche de prueba" (solo `mode="open"`), con texto de advertencia. |
| `apps/web/src/services/events.service.ts:32-37` | `openEvent(keyword, isTest?)`. |
| `apps/web/src/app/caja/CajaClient.tsx:85-99, 244-265` | El form inline de abrir noche de `/caja` **no** lleva checkbox (P4: solo admin). |
| `apps/web/src/app/admin/AdminClient.tsx:562` | Montar `<TestNightBanner />` junto a `MigrationsBanner` / `MpFallbackBanner`. |
| `apps/web/src/app/caja/CajaClient.tsx:206-219` | Banner en el topbar, al lado del chip "Clave: …". |
| `apps/web/src/hooks/useCheckout.ts:254-315` | Ocultar/inhabilitar los métodos de cobro MP en noche de prueba, con el motivo visible. Defensa en profundidad; el server ya rechaza. |

### Parte 2 — Borrado de noches

**Nuevos**

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260808120000_delete_night.sql` | Las 4 funciones: `night_mp_order_ids`, `preview_night`, `delete_night`, `find_nights_by_ar_date`. SQL completo ya diseñado y revisado (ver **Cambios de datos**). |
| `apps/api/src/modules/events/night-deletion.service.ts` | `preview(eventId)` y `delete(eventId, expectedArDate, operator)` — envuelven los `supabase.rpc(...)`. |
| `apps/api/src/scripts/delete-night.ts` | CLI. `pnpm --filter cocktrail-api db:delete-night <fecha|--id uuid>`. |
| `apps/web/src/components/admin/HistorialSection.tsx` | Confirmación de borrado con `SafeDeleteModal`: resumen de lo que se pierde + mantener-apretado + toast con Deshacer (DELETE diferido). Reemplaza a `DeleteNightModal`. |

**Modificados**

| Archivo:línea | Cambio |
|---|---|
| `apps/api/src/modules/events/events.controller.ts` | `GET /api/events/:id/deletion-preview` y `DELETE /api/events/:id`, ambos `requireRole("admin")`. El DELETE validó la contraseña como `/event/close`; desde el 2026-08-10 se eliminó la re-auth por contraseña para habilitar mantener-apretado + deshacer (la fecha sigue validada en el server). |
| `apps/web/src/components/admin/HistorialSection.tsx:58` | Acción "eliminar noche" por noche cerrada, visible solo para `role === "admin"`. |
| `apps/web/src/services/events.service.ts` | `getDeletionPreview(id)` y `deleteNight(id, fecha)`. |
| `apps/api/package.json:10` | Script `db:delete-night`. |

---

## Cambios de datos

### Migración `20260808120000_delete_night.sql`

Cuatro funciones, todas `SECURITY INVOKER` con `SET search_path = public, pg_temp`, `REVOKE` a
`PUBLIC/anon/authenticated` y `GRANT EXECUTE` solo a `service_role`.

> **Por qué INVOKER y no DEFINER**: `service_role` ya tiene `BYPASSRLS` + `ALL PRIVILEGES`
> (`20260722000200_revoke_anon_legacy.sql`), así que `DEFINER` no habilita nada y sí agregaría
> superficie de escalada en una función que borra plata. El `REVOKE` explícito a `anon`/`authenticated`
> **es obligatorio**: Supabase tiene DEFAULT PRIVILEGES que les dan `EXECUTE` a toda función nueva.

**Secuencia de borrado** — es la única que no viola claves foráneas:

```
0. SELECT … FOR UPDATE   sobre la noche (lock + validar status)
1. calcular el set de mp_order_ids       ← ANTES de borrar orders
2. neutralizar mp_webhook_events pendientes que apunten a esos cobros
3. DELETE FROM orders      WHERE event_id = X   -- cascada → tickets
4. DELETE FROM cash_sales  WHERE event_id = X
5. DELETE FROM mp_orders   WHERE id = ANY(set)
6. DELETE FROM night_events WHERE id = X
7. INSERT INTO audit_logs                        ← misma transacción
```

Las cuatro sutilezas que hacen falta y no son obvias:

1. **`mp_orders.event_id` es nullable y nunca tuvo backfill** (`20260721000100_mp_orders_event_id.sql:3`).
   Hay cobros de la noche con `event_id NULL`; la única pista es `orders.mp_order_id`. El set de
   cobros a borrar es la **unión** de ambas fuentes, menos cualquiera referenciado por una venta de
   otra noche (guarda contra datos sucios).
2. **`mp_webhook_events` no tiene FK a `mp_orders`** — se liga por `data_id` (texto). Los pendientes
   se marcan `processed_at = now()` con un `last_error` explicativo en vez de borrarse: si quedaran
   pendientes, `replayPending()` los reintentaría contra una fila inexistente en cada arranque. Se
   conserva la evidencia.
3. **La fecha se calcula con huso argentino explícito**:
   `(started_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`. **Nunca** `started_at::date`
   — el servidor corre en UTC y todo lo posterior a las 21:00 caería al día siguiente. Es el mismo
   criterio de `claveDiaArgentina` (`apps/api/src/shared/utils/fechas.ts`), corregido en el commit
   `91246a2`.
4. **`total_facturado` excluye los `'cancelado'`**, igual que `computeTotals`
   (`packages/shared/src/domain.ts:174`). `orders.total` es `INT` (pesos) y
   `mp_orders.paid_amount` es `NUMERIC(12,2)`: el resumen respeta ambos, y para MP usa
   `paid_amount` (la autoridad post-`20260722000000`) contando solo `status = 'processed'`.

**Guardas dentro de la función**: aborta si la noche no existe; aborta si `status = 'activo'`
(criterio **D6**); aborta si `p_expected_ar_date` no coincide con la fecha real de la noche;
`FOR UPDATE` serializa contra un cierre de noche o un segundo borrado concurrente.

### Sin cambios de esquema para la noche de prueba

**No hay migración**: la noche de prueba no toca la base. Ese es todo el punto.

### Tipos en `packages/shared`

`NightEvent` suma `isTest?: boolean` (opcional → las filas de la base lo dejan `undefined`, que es
lo correcto: nada persistido es de prueba).

### Impacto en sync local↔cloud / offline

**Ninguno.** Ese módulo ya no existe: hay una sola base con escritura directa desde el pivot del
2026-08-03. La cola offline de la PWA sigue pendiente en el roadmap y **no interactúa** con esto.

---

## Real-time (SSE)

Los eventos y sus payloads **no cambian**. Lo que cambia es de dónde salen los datos:

| Evento | Camino en noche de prueba |
|---|---|
| `event.opened` | Se emite igual. El `NightEvent` del payload lleva `isTest: true` → el front prende el banner sin pedir nada más. |
| `order.created` / `order.updated` | Se emiten igual; la `Order` sale del store en memoria. |
| `event.closed` | Se emite igual con el `EventSummary` calculado sobre el store. |

⚠️ **Punto de cuidado**: `useEventState` (`apps/web/src/hooks/useEventState.ts:69-97`) dispara un
`refetch()` de `GET /api/state` ante `order.created`, `event.opened` y `event.closed`. Como
`snapshot()` (`events.service.ts:290-302`) pasa por `ordersRepo.listForEvent()` y ese repo ya está
decorado, devuelve el store en memoria y **no se pisa nada**. Es la validación de que la
intercepción va en la capa de repositorio y no en el servicio.

`SystemService.getStatus()` usa `eventsRepo.getActive()` directo (`system.service.ts:157`): con el
decorador cableado, reporta la noche de prueba correctamente en lugar de `null`.

---

## Auth y permisos

- **Roles**: `Role = "admin" | "caja"` (`packages/shared/src/domain.ts:1`). No existe un tipo
  `UserPermissions` en shared: los "permisos" son un objeto derivado del rol, armado inline en
  `apps/api/src/modules/auth/auth.controller.ts:69-72`. **No hace falta inventar permisos nuevos.**
- **Abrir noche de prueba** → solo `admin`. Patrón: mantener `requireRole("admin","caja")` en la
  ruta (abrir noche normal sigue siendo de ambos) + chequeo inline `if (role === "caja" && isTest)
  throw new Forbidden(...)`, copiando `/event/close:51`.
- **Borrar noche** → `requireRole("admin")` declarativo + re-autenticación con contraseña vía
  `authenticate(username, password, usersRepo)`, el mismo mecanismo de `/event/close:56`. La
  confirmación tipeada de la fecha se valida **en el servidor** (`p_expected_ar_date`), no solo en
  la UI.
- **Auditoría**: el `INSERT INTO audit_logs` va dentro de la transacción de `delete_night`, así que
  el rastro no puede perderse por un fallo parcial. `audit_logs` no tiene FK a nada → **el registro
  del borrado sobrevive al borrado**. Nota: hoy abrir y cerrar noche **no se auditan**; conviene
  sumar `logAction` en esos dos caminos de paso (barato y cierra un hueco real).

---

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El contexto de prueba queda pegado** y una noche real termina escribiéndose en memoria (se pierde toda la facturación). Es el peor caso de esta feature. | El contexto guarda un **id**, no un booleano: los decoradores enrutan comparando el id de la noche, así que una noche nueva jamás matchea. Se limpia en `closeEvent` y en `initialize()`. Tests de integración específicos para esto. |
| 2 | **Se borra la noche equivocada.** Irreversible: `mp_orders` es la única evidencia server-side de un cobro (invariante R27), y los tickets se van por cascada. | `p_expected_ar_date` obligatoria desde el CLI; confirmación tipeada validada en el server; `status = 'activo'` bloqueado; el CLI vuelca la noche a JSON antes de borrar; `--dry-run` por defecto. |
| 3 | **La noche de prueba se pierde si Render duerme el proceso** (15 min sin tráfico en el plan free). | Aceptado y documentado (**A6**). El banner puede avisarlo. |
| 4 | **Deriva de esquema en la nube**: esa base la creó el sync viejo, no el runner de migraciones. Ya mordió con la columna `totals` (commit `9c81f82`). | Verificar la migración contra la nube antes de aplicarla; las funciones usan `CREATE OR REPLACE` y no tocan tablas. Riesgo bajo: no hay DDL de columnas. |
| 5 | **R16 sigue abierto**: los tests de integración pegan contra producción. Esta feature agrega tests que *borran noches*. | Los tests nuevos del borrado deben ser **unit con la RPC mockeada**, nunca integración contra la nube. |
| 6 | La reimpresión (`printer.controller.ts:32`) lee `ordersRepo.findById()`. | Cubierto: el decorador de orders mira primero el store. |
| 7 | `cash_sales` es **tabla muerta** (ningún código la escribe ni la lee). | `delete_night` la limpia igual, por si hay filas históricas. No hace falta interceptarla en modo prueba. |
| 8 | Una noche de prueba abierta **impide abrir la real** (el modelo es de una sola noche activa). | Es correcto y deseable. El banner lo hace obvio; cerrar la prueba es un click. |

---

## Alternativas consideradas

- **Columna `night_events.is_test` + filtrar en el panel** — descartada por el usuario. Habría sido
  la más simple, pero deja la noche de prueba viva en la base y depende de que *todos* los reportes
  filtren bien; un olvido en un query la muestra como venta real.
- **Guardar normal y borrar en cascada al cerrar** — descartada: si el proceso se cae a mitad, los
  datos de prueba quedan como reales, que es el problema que veníamos a resolver.
- **`if (esPrueba)` dentro de los servicios** — descartada: son ~10 puntos de intercepción
  (`events.service`, `orders.service`, `tickets.service`, `printer.controller`, `orders.controller`).
  Un olvido en cualquiera rompe la garantía. En la capa de repositorio son 3 archivos y la garantía
  es estructural.
- **Cuatro `DELETE` desde `supabase-js`** — descartada por atomicidad: son 4 requests HTTP, y un
  fallo a mitad deja las ventas borradas con los cobros MP vivos. Estado no recuperable.
- **Cliente `pg` con `BEGIN`/`COMMIT` desde el backend** — viable (`pg` ya es dependencia), pero
  `DATABASE_URL` está documentado como *"SOLO lo usa el runner de migraciones"*
  (`apps/api/src/config/env.ts:27`) y en Render apunta al pooler. Abrir esa puerta para una
  operación destructiva es peor negocio que una función en la base.
- **Un proyecto Supabase separado para pruebas** — es la solución *correcta* a **R16**, pero es otra
  feature (credenciales, seed, deploy) y no resuelve el caso real de esta spec: probar **en el
  boliche, con el hardware y los datos reales**.

---

## Orden sugerido de implementación

1. **Migración + CLI de borrado** → permite deshacer la noche del 2026-08-07 hoy mismo (**F1**).
2. **Endpoint + modal de borrado en `/admin`** (**D**).
3. **Noche de prueba**: contexto, store y decoradores en el backend (**A**, **C**).
4. **Frontend de la noche de prueba**: checkbox, banner, bloqueo de MP, leyenda del ticket
   (**A1**, **B**).

Los bloques 1-2 y 3-4 son independientes y se pueden mergear por separado.

---

**Siguiente paso**: `/tasks noches-de-prueba-y-borrado`.
