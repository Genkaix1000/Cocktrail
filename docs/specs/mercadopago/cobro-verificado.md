# Cobro verificado — el sistema registra ventas que Mercado Pago rechazó

**Estado**: `done` — implementada y **gate físico pasado el 2026-07-22**: tarjeta sin fondos contra
el Posnet real → rechazo visible con motivo, sin ticket y sin pedido (4 intents `rejected` /
`cc_rejected_insufficient_amount` persistidos en `mp_orders`, 0 pedidos creados); cobro aprobado de
$101 → pedido ligado a su pago (`mp_payment_id`) con monto verificado.
**Fecha**: 2026-07-22 (última actualización: 2026-07-22, tras la reproducción controlada)
**Origen**: reproducción en vivo del 2026-07-22 — se cobró con el Posnet físico usando una tarjeta
sin fondos, Mercado Pago rechazó el pago, y **Cocktrail imprimió el ticket y registró la venta como
concretada**. El boliche entregó producto sin cobrar y la caja no cuadra.
**Evidencia**: la reproducción se repitió de forma controlada el mismo día y se capturó el payload
crudo de punta a punta — ver [Anexo — Evidencia empírica](#anexo--evidencia-empírica-reproducción-controlada-del-2026-07-22-1831).

> 🚨 **Bloqueante para producción. Tiene prioridad sobre el PR 4 de la remediación
> ([`remediacion-integracion-mp.md`](./remediacion-integracion-mp.md)).** Un sistema que registra
> ventas no cobradas no se puede poner en un boliche, por más ordenado que esté el resto.

---

## Problema / Por qué

### Lo que pasó

Se pasó una tarjeta sin fondos por el Posnet. Mercado Pago la rechazó (`status: "rejected"`,
`status_detail: "cc_rejected_insufficient_amount"`). La cajera vio la pantalla de éxito, el sistema
imprimió el ticket y creó el pedido. Plata que no entró, producto que salió.

**No es un caso raro ni un timing exótico**: es el camino feliz del código con una tarjeta rechazada.
Cualquier rechazo —fondos, límite, tarjeta vencida, robada— produce el mismo resultado.

### Por qué pasa

En la Point Integration API, el campo `state` del payment intent describe el **ciclo de vida del
intent**, no el resultado del pago. `state: "FINISHED"` significa *"el intent terminó"*, y convive
perfectamente con un `payment.status: "rejected"`. Son dos preguntas distintas y el código responde
la que no importa.

El circuito completo, en tres saltos:

1. **El backend nunca consulta el pago real.** `mercadopago.service.ts:286` devuelve el `rawStatus`
   crudo del intent tal cual vino de MP. La consulta al pago existe —`getPaymentWithToken`— pero
   está encerrada en un `if` (`mercadopago.service.ts:281-284`) que solo dispara cuando el estado
   crudo es `CONFIRMATION_REQUIRED` **y** el intent trae `payment.id`. Un `FINISHED` con pago
   rechazado no pasa nunca por ahí — **aunque traiga el `payment.id`, que lo trae** (confirmado
   empíricamente, ver anexo de evidencia).
2. **El frontend decide la venta con esa sola palabra.** `useCheckout.ts:298` hace
   `if (currentState === "FINISHED")` como **única** condición para concretar la venta, guardar la
   constancia, imprimir el ticket y crear el pedido. **Verificado leyendo el código el 2026-07-22**:
   en todo `startPolling` (`useCheckout.ts:279-321`) hay exactamente dos ramas —`FINISHED` concreta
   la venta, `CANCELED` la corta— y **no existe ningún otro camino** que llame a `registerPaidOrder`
   en el flujo del Posnet. Cualquier otro valor de `state` sigue girando en silencio. No es una
   inferencia: es la estructura del `setInterval`.
3. **El backend acepta lo que el navegador le mande.** `POST /api/orders` no pide ninguna prueba de
   pago: recibe un pedido con `paymentMethod: "debito"` y lo registra. La validación del cobro es
   **enteramente del lado del cliente**.

Lo más incómodo del hallazgo: **la función correcta ya está escrita**.
`mapPaymentStatusToNormalized` (`mercadopago.service.ts:30-34`) mapea `approved → FINISHED` y
`rejected|cancelled → CANCELED`. Existe, tiene tests, y se invoca desde un solo lugar. Le faltaba
alcance, no lógica.

*(Aclaración para no perseguir al culpable equivocado: `mapMpStatus` en
`mercadopago-orders.service.ts:329` **no** interviene acá — es del camino de QR.)*

### El bug nació en la documentación

Antes que en el código, el error está escrito:

- `docs/mp/api-point-devices.md:93` — tabla "Estados posibles y qué hacer en cada uno":
  `FINISHED` → `FINISHED` → **"Concretar pedido ✅"**.
- `docs/specs/mercadopago/cobro-posnet-mercadopago.md:90-92` — criterio de aceptación 2: *"cuando
  Mercado Pago responde `FINISHED`, `ON_TERMINAL` o `CANCELED`, entonces el comportamiento visible
  es exactamente el mismo que hoy (sin regresión)"*, es decir, canoniza el comportamiento roto como
  el correcto.

Mientras esas dos líneas sigan escritas, cualquiera —persona o agente— reintroduce el mismo bug con
la conciencia tranquila y la doc de su lado. **Corregirlas es parte del arreglo, no un anexo.**

### Lo que el bug dejó a la vista

Al tirar del hilo aparecieron ocho defectos estructurales más. Ninguno causó el incidente por sí
solo, pero todos son parte de por qué fue posible y de por qué no se detectó:

1. **El intent del Posnet no se persiste en ningún lado** — ni siquiera en `mp_orders`, que solo
   recibe los cobros de QR (R19). Un cobro con Posnet no deja **ningún rastro auditable**: si mañana
   hay que revisar qué se cobró de verdad, no hay contra qué comparar.
2. **El tipo `Order` no tiene ningún campo de pago** (`packages/shared/src/domain.ts:38-56`): no
   existe `paymentStatus`, ni `mpPaymentId`, ni `mpIntentId`. El `status: "pendiente"` describe la
   **entrega en barra**, no el cobro. Una orden creada es literalmente imposible de reconciliar
   contra Mercado Pago.
3. **La impresión del ticket cuelga del rol, no del cobro.** `orders.service.ts:83` imprime si
   `isStaffOrder` — o sea, si el pedido lo cargó alguien del local. Si se cobró o no, no entra en la
   decisión.
4. **El monto nunca se verifica.** En ningún camino de cobro se compara el `transaction_amount`
   aprobado contra el total del carrito. Un desfasaje —por bug propio, por manipulación del cliente
   o por un intent viejo— pasa desapercibido.
5. **La constancia se escribe antes de saber si hubo cobro.** `useCheckout.ts:307-308` guarda la
   "venta cobrada sin registrar" en `localStorage` **antes** de registrar la venta. Combinado con
   este bug, la cajera puede terminar reintentando el registro de una venta **que nunca se cobró**.
6. **El polling del Posnet no tiene deadline.** El de QR corta por `expiresAt`; el del Posnet
   (`useCheckout.ts:279-321`) gira indefinidamente. Un estado inesperado —y hoy cualquier valor de
   `state` que el código no contempla se pasa crudo y se ignora en silencio— deja la caja bloqueada
   sin timeout.
7. **Los mensajes mienten sobre la causa.** Un rechazo por fondos termina mostrando el sentinel
   `"cancelled_by_device"`, que la UI presenta como *"la cancelaron a propósito"*. La cajera lee que
   el cliente se arrepintió cuando en realidad la tarjeta no tenía plata: no se le ocurre pedir otro
   medio de pago.
8. **El navegador cachea las respuestas del polling de un cobro en curso.** *(Defecto nuevo,
   descubierto en la reproducción controlada.)* En el DevTools quedó registrado que casi todas las
   llamadas a `GET /api/mercadopago/pos/intent/{id}` volvieron **`304 Not Modified`** y solo las dos
   últimas `200`. El endpoint (`mercadopago.controller.ts:51-58`) responde con `res.json(...)` sin
   ninguna cabecera de cache, así que el ETag por defecto de Express hace que el navegador revalide
   y reutilice el cuerpo anterior. **En esta reproducción no se demostró daño** —el estado terminal
   llegó igual—, pero el riesgo es real y del peor tipo: consultar el estado de un cobro en curso es
   exactamente el caso en el que una respuesta reutilizada puede hacer que el sistema vea un estado
   viejo. Un endpoint de estado en vivo no puede ser cacheable.

### Alcance del daño

| Camino | Estado |
|---|---|
| **Posnet** (Point Integration API) | 🔴 **Roto y confirmado empíricamente** el 2026-07-22 con tarjeta sin fondos, con payload crudo capturado de punta a punta (ver anexo de evidencia). |
| **QR** (Orders API) | 🟡 **Sin verificar.** Mismo patrón de razonamiento: `useCheckout.ts:367` decide por `status === "processed"` sin mirar `status_detail` ni monto. *Probablemente* se salva porque la Orders API tiene `failed` como estado propio del ciclo, pero **eso no se probó** — ver preguntas abiertas. |

### Por qué los webhooks no salvaban nada

Es tentador pensar que la notificación asincrónica de MP habría corregido el registro. No: hay
**tres barreras acumuladas**, y con que una sola estuviera puesta ya alcanzaba para que no llegara.

1. `MP_WEBHOOK_SECRET` está vacía (R26) → `POST /api/mercadopago/webhooks` responde **401
   fail-closed**. Nada entra.
2. Aunque entrara, `mercadopago-webhooks.service.ts:70` **descarta todo lo que no sea
   `type === "order"`**, y el topic de Point es `payment_intent`. Nada se procesa.
3. Aunque se procesara, `reconcileFromMp` solo actualiza `mp_orders`. **Ningún consumidor del
   frontend escucha `mp.order.updated` y nada revierte una `Order` de dominio.** Nada se corrige.

Conclusión: la verificación **tiene que ser sincrónica**, en el camino del cobro. El webhook puede
ser red de seguridad, nunca el mecanismo primario.

**Para quién**: el dueño (entrega mercadería sin cobrar y la caja no cierra), la cajera (concreta
ventas que no se cobraron y lee mensajes que la desorientan), y quien mantenga el código (no hay
ningún dato persistido con el cual auditar lo que pasó).

---

## Objetivo

Que **una venta se registre si y solo si Mercado Pago confirmó el cobro por el monto correcto**, y
que cuando no se pueda confirmar, el sistema lo diga en vez de asumir que sí.

En términos de comportamiento observable:

1. **Ningún pago rechazado por Mercado Pago se registra como venta concretada**, con ninguna tarjeta
   y por ningún camino de cobro.
2. **Todo cobro no-efectivo queda validado del lado del servidor.** El navegador deja de ser la
   autoridad sobre si se cobró.
3. **Todo cobro deja rastro auditable**, con la referencia del pago de Mercado Pago pegada al pedido
   de dominio.
4. **La cajera entiende qué pasó** y puede actuar en consecuencia (pedir otro medio de pago,
   reintentar, escalar).
5. **La caja nunca queda colgada** esperando un estado que no va a llegar.
6. **La documentación deja de enseñar el bug.**
7. **El estado de un cobro en curso nunca se lee de un cache.** Cada consulta del polling llega al
   backend y devuelve el estado del momento: ninguna respuesta reutilizada puede hacer que el
   sistema decida sobre un estado viejo.

---

## Historias de usuario

- Como **dueño**, quiero que si Mercado Pago rechaza un pago no salga el ticket ni se registre la
  venta, para no regalar mercadería y para que la caja cierre cuadrada.
- Como **dueño**, quiero poder cruzar cada venta con su cobro en el panel de Mercado Pago, para
  auditar la noche sin creerle al sistema por fe.
- Como **cajera**, quiero que la pantalla me diga *"tarjeta rechazada por fondos insuficientes"* y no
  *"la cancelaron"*, para saber que tengo que pedirle otro medio de pago al cliente.
- Como **cajera**, quiero que si el sistema no puede confirmar el cobro me lo diga claramente y me
  deje verificarlo, en vez de darlo por bueno y dejarme el problema para el cierre.
- Como **cajera**, quiero que un cobro que se quedó colgado corte solo y me libere la caja, para no
  perder la cola de un sábado a la noche.
- Como **desarrollador**, quiero que la doc del repo describa el comportamiento correcto, para no
  reimplementar el mismo error creyendo que estoy siguiendo la especificación.

---

## Criterios de aceptación

### A. Verificación del resultado real del cobro — Posnet (bloqueante)

- [ ] **Dado** un cobro con Posnet, **cuando** Mercado Pago devuelve un estado terminal del intent
  que trae una referencia de pago, **entonces** el sistema consulta el **pago real** y decide con el
  resultado de ese pago, no con el estado del intent. Aplica a **cualquier** estado terminal, no
  solo a `CONFIRMATION_REQUIRED`. *(Confirmado: un `FINISHED` con pago rechazado **sí** trae
  `payment.id`, así que el `payment.id` alcanza — no hace falta buscar el pago por
  `external_reference`.)*
- [ ] **Dado** un cobro con una tarjeta sin fondos, **cuando** el intent termina, **entonces** el
  endpoint de estado devuelve **`CANCELED`** — nunca `FINISHED`. *(Reproducción exacta del incidente
  del 2026-07-22: es el criterio que cierra el bug.)*
- [ ] **Dado** un pago aprobado, **cuando** el intent termina, **entonces** el comportamiento es el
  de hoy: venta concretada, ticket impreso, pedido creado. Sin regresión sobre el camino feliz real.
- [ ] **Dado** un estado terminal **sin** referencia de pago, **cuando** el sistema intenta
  resolverlo, **entonces** reintenta un número acotado de veces y, si no logra determinar el
  resultado, **termina en un estado explícito de "cobro no confirmado"** que pide verificación
  humana — **nunca** en "cobrado". Ver D1.
- [ ] **Dado** un valor de `state` que el sistema no conoce, **cuando** llega, **entonces** no se lo
  interpreta como cobrado ni se lo ignora en silencio: queda registrado y tratado como
  indeterminado.

### B. Coincidencia de monto (bloqueante)

- [ ] **Dado** un pago aprobado, **cuando** el sistema va a dar el cobro por bueno, **entonces**
  verifica que el monto aprobado coincida con el total del carrito. Si no coincide, el cobro **no**
  se da por bueno y queda señalado para verificación.
- [ ] El criterio aplica **tanto al Posnet como al QR**. Hoy no se verifica en ninguno de los dos.

### C. La autoridad del cobro es el servidor (bloqueante)

- [ ] **Dado** un pedido con método de pago **no-efectivo**, **cuando** llega a `POST /api/orders`,
  **entonces** el servidor **exige una prueba de pago y la valida contra Mercado Pago** — un pedido
  sin prueba válida se rechaza.
- [ ] **Dado** un cliente que manipula lo que envía el navegador, **cuando** intenta registrar una
  venta no-efectivo sin cobro real detrás, **entonces** el backend la rechaza. La validación no
  puede depender del frontend.
- [ ] **Dado** un cobro con Posnet, **cuando** se crea el intent, **entonces** queda **persistido**
  con su identificador, su monto y su resultado, de modo que el servidor pueda validar la prueba de
  pago sin volver a confiar en el cliente y quede rastro auditable (cierra el lado Posnet de R19).
- [ ] **Dado** un pedido registrado con cobro de Mercado Pago, **cuando** se lo consulta,
  **entonces** expone la **referencia del pago** que lo respalda, de forma que se lo pueda cruzar
  contra el panel de MP sin trabajo manual de detective.

### D. El ticket cuelga del cobro, no del rol (bloqueante)

- [ ] **Dado** un cobro no confirmado, **cuando** el sistema procesa el pedido, **entonces** **no
  imprime ticket y no emite `order.created`**. La condición de impresión deja de ser `isStaffOrder`.
- [ ] **Dado** un cobro confirmado, **cuando** el pedido se registra, **entonces** el ticket sale
  igual que hoy. El cambio no puede romper la venta en efectivo ni el flujo normal de caja.

### E. Mensajes que le sirven a la cajera

- [ ] **Dado** un rechazo de la tarjeta, **cuando** la cajera ve el resultado, **entonces** lee un
  mensaje que distingue el **motivo real** (por ejemplo, *"tarjeta rechazada por fondos
  insuficientes"*) y no *"cancelado desde el dispositivo"*.
- [ ] **Dado** una cancelación deliberada desde el Posnet, **cuando** la cajera ve el resultado,
  **entonces** sigue leyendo que fue una cancelación — los dos casos quedan distinguibles entre sí.
- [ ] **Dado** un cobro que terminó en "no confirmado", **cuando** la cajera ve el resultado,
  **entonces** el mensaje le dice explícitamente que **no debe entregar el producto** hasta
  verificar, y le ofrece un camino para hacerlo.

### F. La caja no se cuelga

- [ ] **Dado** un cobro con Posnet en curso, **cuando** pasa un tiempo máximo acotado sin llegar a
  un resultado, **entonces** el polling corta solo y la caja queda operativa, con un mensaje claro
  de que el cobro no se pudo confirmar. Equivalente al deadline que el QR ya tiene por `expiresAt`.
- [ ] **Dado** ese corte por deadline, **cuando** ocurre, **entonces** el cobro **no** se da por
  concretado (coherente con D1).

### G. QR — verificar antes de asumir

- [ ] **Dado** un pago por QR rechazado, **cuando** se reproduce el caso contra la Orders API real,
  **entonces** queda **verificado empíricamente** si el sistema lo registra como venta o no. El
  resultado se documenta en esta spec.
- [ ] **Dado** que la verificación muestre el mismo defecto, **cuando** se corrija, **entonces** se
  aplican los mismos criterios A y B al camino de QR.
- [ ] El criterio B (coincidencia de monto) aplica al QR **independientemente** del resultado de esa
  verificación.

### H. Documentación

- [ ] **Dado** `docs/mp/api-point-devices.md:93`, **cuando** se lo revisa, **entonces** ya no dice
  que `FINISHED` significa "concretar pedido": describe que `state` es el ciclo de vida del intent y
  que el resultado del cobro se lee del pago.
- [ ] **Dado** `docs/specs/mercadopago/cobro-posnet-mercadopago.md:90-92`, **cuando** se lo revisa,
  **entonces** el criterio de aceptación 2 queda corregido o explícitamente anulado, con una nota
  que apunte a esta spec. Una spec en estado `done` que canoniza un bug es una trampa para el
  próximo que la lea.
- [ ] `docs/ROADMAP.md` refleja el riesgo (R27) y su estado.

### I. El polling no lee estado cacheado

*(Sección agregada tras la reproducción controlada del 2026-07-22 — ver defecto 8.)*

- [ ] **Dado** un cobro con Posnet en curso, **cuando** el navegador consulta
  `GET /api/mercadopago/pos/intent/{id}`, **entonces** la respuesta **no es cacheable**: el endpoint
  manda `Cache-Control: no-store` (o el cliente hace cache-busting) y **ninguna llamada del polling
  vuelve `304 Not Modified`**. Verificable en el DevTools: todas las llamadas del polling en `200`.
- [ ] **Dado** ese mismo endpoint, **cuando** se lo consulta dos veces con el intent en estados
  distintos, **entonces** la segunda respuesta refleja el estado nuevo — nunca el cuerpo anterior.

---

## Fuera de alcance

- **Rediseñar la pantalla de cobro de `/caja`.** Cambian los mensajes y los estados terminales, no
  el layout ni el flujo que ve la cajera.
- **Migrar el Posnet de Payment Intents a Orders API** (R15) — sigue siendo una spec propia. Este
  arreglo tiene que funcionar sobre la API que hoy está en producción.
- **Arreglar los webhooks** (R26 + el filtro `type === "order"`). Quedan como red de seguridad
  deseable, pero esta spec resuelve el problema de forma **sincrónica**, sin depender de ellos —
  justamente porque las tres barreras de arriba muestran que no son confiables hoy.
- **El resto de la remediación MP** (PR 4, 5 y 6): inversión del token, cifrado, single-seller,
  sync, sesiones de caja. Esta spec **se adelanta** a esos entregables, no los reemplaza ni los
  incluye.
- **Gestión de Posnets desde la app** — feature aparte ya en el roadmap.
- **Reconciliación automática contra el panel de MP** al cerrar la noche. Esta spec deja los datos
  necesarios (referencia de pago en el pedido, intent persistido); usarlos para conciliar es el
  PR 5.
- **Reembolsos / devoluciones** (Fase 7 de MP) — si una venta se registró mal, esta spec define el
  procedimiento manual de corrección, no un flujo automático de devolución.
- **El agujero de `computeTotals` y el flujo de `/carta`.** `computeTotals`
  (`apps/api/src/shared/utils/totals.ts:32-40`) suma por `paymentMethod` **sin mirar ningún estado
  de cobro**, así que un pedido creado desde `/carta` —donde `paymentMethod` significa *cómo el
  cliente piensa pagar*, no *cómo se cobró*— infla los totales de la noche sin ningún cobro
  asociado. Es un defecto real y de la misma familia que R27, pero **hoy no causa daño**: `/carta`,
  el ticket virtual y `/barra` están fuera de validación hasta la Fase 7 (ver `docs/ROADMAP.md`) y
  nadie crea pedidos por ahí. Se resuelve cuando se rediseñe el flujo digital del cliente, no acá:
  la prioridad de esta spec es que el cobro de caja funcione. Queda anotado como **R28**, diferido a
  la Fase 7. Consecuencia de diseño: la exigencia de prueba de pago del criterio C cuelga del
  **origen** de la request (venta de caja, con sesión de staff) y no de `paymentMethod` — así
  `/carta` sigue funcionando sin que haya que tocarlo.

---

## Decisiones tomadas

### D1 — Principio rector: ante la duda, NO cobrado

Toda ambigüedad se resuelve del lado de **no dar la venta por concretada**. Un cobro que el sistema
no puede confirmar es un cobro **no confirmado**, nunca un cobro exitoso.

El fundamento es la asimetría de los costos, que no es discutible:

| Error | Consecuencia | Recuperable |
|---|---|---|
| Dar por no cobrado algo que sí se cobró | La cajera verifica, reintenta el registro o corrige a mano. Molesto. | ✅ Sí |
| Dar por cobrado algo que no se cobró | Sale el producto, no entra la plata, la caja no cuadra y **nadie se entera hasta el cierre** — si se entera. | ❌ No |

Por eso `FINISHED` sin referencia de pago **no puede significar "cobrado"**: es indeterminado. Se
reintenta un número acotado de veces y, si no se resuelve, se cierra en un estado explícito de "no
confirmado" que pide verificación humana. Nunca se degrada a éxito por defecto.

Esto invierte el default actual del sistema, que ante cualquier duda concreta la venta.

### D2 — `state` describe el intent; el resultado del cobro se lee del pago

La distinción es la raíz del bug y por eso queda escrita como decisión, no como detalle de
implementación: **el ciclo de vida del intent y el resultado del pago son dos cosas distintas**, y
`FINISHED` responde a la primera.

Consecuencia: la consulta al pago real deja de ser un caso especial de `CONFIRMATION_REQUIRED` y
pasa a ser **el camino normal** ante cualquier estado terminal con referencia de pago. La
normalización usa `mapPaymentStatusToNormalized`, que **ya existe y ya está testeada** — no hay que
escribir lógica nueva de mapeo, hay que darle el alcance que le falta.

**La evidencia del 2026-07-22 fija la forma de la solución** (esto ya no es una hipótesis): el intent
`FINISHED` del pago rechazado trae `payment.id = "170034593080"`, y ese pago consultado por id
devuelve `status: "rejected"`. Entonces:

- **No hace falta buscar el pago por `external_reference`.** El `payment.id` viene adentro del propio
  intent que el polling ya consulta. El mecanismo alternativo —con sus condiciones de carrera— queda
  descartado.
- **El arreglo es sacar la resolución del pago de adentro del `if`.** La condición
  `rawStatus === "CONFIRMATION_REQUIRED"` (`mercadopago.service.ts:281`) tiene que dejar de ser la
  puerta: la consulta al pago se aplica también a `FINISHED` (y a todo estado terminal con
  `payment.id`).
- **La función que decide bien ya está escrita.** `mapPaymentStatusToNormalized`
  (`mercadopago.service.ts:30-34`) mapea `rejected → CANCELED` correctamente. No hay lógica que
  inventar: **existe, funciona, y simplemente no se la llama en el camino que importa**.

### D3 — La autoridad sobre "se cobró" se muda al servidor

Hoy la decisión vive en `useCheckout.ts` y el backend obedece. Eso es incorrecto por dos motivos
independientes: es **manipulable** (cualquiera con el navegador registra ventas sin cobro) y es
**frágil** (un bug de frontend se convierte en pérdida de plata, que es exactamente lo que pasó).

`POST /api/orders` con método no-efectivo pasa a **exigir prueba de pago y validarla server-side**.
Esto tiene dos consecuencias de diseño que se asumen:

- **Hay que persistir el intent del Posnet** — hoy no se guarda en ningún lado, así que el servidor
  no tiene contra qué validar. Resuelve además el lado Posnet de R19.
- **Hay que agregar la referencia de pago a `Order`** — hoy el tipo no tiene ningún campo de pago
  (`domain.ts:38-56`), así que un pedido registrado es irreconciliable. La forma exacta (campos,
  migración, impacto en el sync) se define en `/plan`.

### D4 — El ticket es consecuencia del cobro, no del rol

`orders.service.ts:83` imprime según `isStaffOrder`. Eso confunde *"quién cargó el pedido"* con
*"se cobró"*. El ticket es el comprobante que la cajera le da al cliente para retirar el producto:
emitirlo sin cobro confirmado es exactamente el mecanismo por el cual el boliche entregó mercadería
gratis.

La condición pasa a ser el **cobro verificado**. Sin él no hay ticket ni evento `order.created`.

### D5 — El monto se verifica siempre, en los dos caminos

Un cobro aprobado por un monto distinto al del carrito **no es el cobro de ese carrito**. Hoy no se
compara nunca, ni en Posnet ni en QR. Se agrega como verificación explícita en ambos, incluso
mientras el QR no esté confirmado como roto: es barato, es independiente del bug del `state`, y
cierra una clase entera de errores silenciosos.

### D6 — La constancia de venta se escribe después de saber que hubo cobro

`useCheckout.ts:307-308` guarda la "venta cobrada sin registrar" **antes** de registrar la venta.
La intención original era buena (no perder una venta si falla el registro), pero con este bug se da
vuelta: se puede terminar reintentando el registro de una venta que **nunca se cobró**, y el
reintento además puede duplicar el pedido (R20).

El orden correcto es: **cobro verificado → constancia → registro**. La constancia solo puede existir
para cobros que se confirmaron.

### D7 — Se corrigen las dos afirmaciones falsas de la doc, en el mismo entregable

No es documentación "de yapa": mientras `docs/mp/api-point-devices.md:93` diga *"FINISHED →
Concretar pedido ✅"* y `cobro-posnet-mercadopago.md:90-92` lo tenga como criterio de aceptación
cumplido, **la próxima persona o agente reintroduce el bug siguiendo la spec**. La corrección de la
doc entra en el mismo entregable que el código, no después.

### D8 — Esto va antes del PR 4 de la remediación

El PR 4 (inversión del token, cifrado, single-seller) resuelve que la plata pueda ir a la cuenta
equivocada. Este bug hace que **la plata no entre en ninguna cuenta y el sistema diga que sí**. Es
más grave y es más barato de arreglar. El PR 4 queda inmediatamente después.

---

## Preguntas respondidas

### ✅ RESUELTA (2026-07-22) — ¿Un `FINISHED` con pago rechazado incluye `payment.id`?

**Sí, lo incluye.** Confirmado contra la API real de Mercado Pago en la reproducción controlada del
2026-07-22 18:31 (evidencia cruda en el anexo). El intent
`cda727ee-33f8-4536-9104-33fa1eabafc8` volvió con `state: "FINISHED"` **y** con
`payment: { "id": "170034593080", "installments": 1, "type": "debit_card" }`. Ese pago, consultado
por id, está en `status: "rejected"` / `status_detail: "cc_rejected_insufficient_amount"`.

**Consecuencia de diseño** (detallada en D2):

- **Queda descartado** el camino alternativo de buscar el pago por `external_reference`, con todas
  sus condiciones de carrera. El `payment.id` viaja adentro del mismo intent que el polling ya
  consulta: no hay que ir a buscarlo a ningún lado.
- **El arreglo es de alcance, no de lógica**: sacar la resolución del pago de adentro del
  `if (rawStatus === "CONFIRMATION_REQUIRED")` de `mercadopago.service.ts:281` y aplicarla también a
  `FINISHED`. `mapPaymentStatusToNormalized` (`mercadopago.service.ts:30-34`) **ya mapea
  `rejected → CANCELED` bien** — el problema nunca fue que faltara la función, es que no se la llama
  en el camino que importa.

**Esta pregunta ya no bloquea el plan técnico.**

---

## Preguntas abiertas

Ninguna bloquea escribir el plan técnico, pero **todas hay que responderlas contra la API real
antes de implementar** — este bug nació justamente de asumir cosas sobre la API sin verificarlas.

1. **¿Cuál es la lista completa y oficial de valores de `state` de la Point Integration API?** Hoy
   el código contempla `OPEN`, `ON_TERMINAL`, `FINISHED`, `CANCELED` y `CONFIRMATION_REQUIRED`;
   **cualquier otro valor se pasa crudo y se ignora en silencio**. Sin la lista completa no se puede
   saber cuáles son terminales y cuáles no, y el criterio A queda escrito a ciegas. **Es la única
   pregunta que le queda pendiente al plan técnico.**
2. **¿La Orders API (QR) devuelve `failed` o `processed` ante un rechazo?** De esto depende si el
   camino de QR está roto igual que el del Posnet o si se salva por construcción (criterio G).
3. **¿Qué se hace con las ventas ya registradas que podrían estar mal?** Hoy son datos de prueba y
   el costo es cero, pero **el procedimiento hay que definirlo antes de producción**: cómo se
   detectan (cruce contra el panel de MP), quién las corrige, y si se anulan o se marcan. *(Ya hay
   un caso concreto esperando: el pedido fantasma de $101 de la reproducción — ver "Pendiente de
   limpieza" en el anexo.)*

---

## Anexo — Evidencia empírica (reproducción controlada del 2026-07-22 18:31)

> Esta es la prueba reproducible del bug, capturada de punta a punta contra la API real de Mercado
> Pago. **Es lo primero que conviene leer antes de tocar una línea de código**: los siete puntos
> muestran, en el mismo instante, a Mercado Pago diciendo "rechazado" y a Cocktrail diciendo
> "cobrado".

### 1. El intent, consultado directo a Mercado Pago

`GET /point/integration-api/payment-intents/cda727ee-33f8-4536-9104-33fa1eabafc8`

```json
{"additional_info":{"external_reference":"cocktrail-1784745054244-Balde-Corona-3x2-x1"},
 "amount":10100,"device_id":"PAX_A910__SMARTPOS1493600985",
 "payment":{"id":"170034593080","installments":1,"type":"debit_card"},
 "payment_mode":"card","state":"FINISHED"}
```

`state: "FINISHED"` **con** `payment.id` presente. Este único payload responde la pregunta abierta
sobre `payment.id` y descarta el camino por `external_reference`.

### 2. El pago que ese intent referencia

`GET /v1/payments/170034593080`

| Campo | Valor |
|---|---|
| `status` | **`rejected`** |
| `status_detail` | **`cc_rejected_insufficient_amount`** |
| `transaction_amount` | `101` |
| `date_approved` | `None` |

La plata **no entró**. Y el dato estaba a un `GET` de distancia, con el id servido en bandeja por el
propio intent.

### 3. La pantalla del Posnet

> *"La tarjeta no tiene fondos suficientes para este cobro"*

### 4. La pantalla de Cocktrail, al mismo tiempo

> *"¡Cobro Concretado! El pedido ya fue enviado a la barra"*

Ticket **#1**, hashcode `16d4ba94`, **ticket impreso**.

Los puntos 3 y 4 son simultáneos: el mismo cobro, los dos aparatos, versiones opuestas de la
realidad.

### 5. La fila que quedó en la tabla `orders` local

| Campo | Valor |
|---|---|
| `id` | `bd9cada2-c7ff-40fe-a79d-6891cd6af392` |
| `total` | `101` |
| `payment_method` | `debito` |
| `status` | `pendiente` |
| `created_by` | `caja` |
| `created_at` | `2026-07-22 18:31:58` |

**Suma a la facturación de la noche.** Un pedido por $101 que nadie pagó, contabilizado como venta.

### 6. `mp_orders`: **0 filas**

El camino Posnet **no deja rastro de ningún cobro**: ni del rechazado de $101, ni del aprobado de
$15 de las 17:59 que sí salió bien. **No hay nada contra qué reconciliar** — la evidencia directa
del defecto E1, ahora medida y no inferida.

### 7. Estado intermedio capturado

En un poll anterior (desde el navegador), el mismo intent volvió con:

```json
{"state":"ON_TERMINAL"}   // sin campo `payment`
```

Documenta que **el campo `payment` aparece recién en el estado terminal**: mientras el intent está
en curso no hay pago que consultar, y por eso la resolución del pago tiene que engancharse al estado
terminal (criterio A) y no antes.

### Notas de método (leer antes de reproducir)

- ⚠️ **`GET /v1/payments/search?sort=date_created&criteria=desc` NO lista los pagos de Point.** En
  esta investigación devolvió como más reciente un pago del **21-07**, sin mostrar **ni** el
  rechazado de $101 **ni** el aprobado de $15 del mismo día. Consultar el pago **por id**, sacando
  el id de adentro del intent, **sí** funciona.
  **No concluir "Mercado Pago no registró el pago" a partir de ese search** — es un falso negativo
  del endpoint de búsqueda, no un dato sobre el pago.
- El estado del intent se consulta directo a la Point Integration API
  (`/point/integration-api/payment-intents/{id}`); el resultado del cobro, a `/v1/payments/{id}`.
  Son dos APIs distintas y responden dos preguntas distintas — que es exactamente la confusión que
  originó el bug (D2).

### Limpieza del pedido fantasma *(ya ejecutada)*

- ✅ **Borrado el 2026-07-22**, una vez capturada toda la evidencia de arriba. Se eliminó la fila
  `bd9cada2-c7ff-40fe-a79d-6891cd6af392` de `orders`; su ticket
  (`e552aaf2-192f-41e6-99d4-3482f0e420bb`, código `VK4KBZX4-99a7d4ec`) se fue por `ON DELETE
  CASCADE`. La noche quedó con un único pedido, los $15 del cobro legítimo.
- ⚠️ **Lo que la limpieza NO puede deshacer**: el ticket **ya se había impreso en papel**. O sea que
  existió, en el mundo físico, un comprobante canjeable en la barra por un trago que nunca se pagó.
  Ese es el daño real del bug y ninguna corrección de datos lo revierte — es el argumento de por qué
  la impresión tiene que colgar del cobro verificado (criterio D) y no del alta del pedido.
- Este fue el primer caso concreto del procedimiento que pide la pregunta abierta 3 (qué hacer con
  las ventas ya registradas que podrían estar mal). Acá se resolvió a mano porque eran datos de
  prueba; **en producción hace falta un procedimiento definido**.

---

## Anexo — Trazabilidad del hallazgo

Referencias verificadas sobre el código el 2026-07-22.

### Cadena del bug

| # | Qué | Dónde |
|---|---|---|
| 1 | Devuelve el `rawStatus` crudo del intent al frontend, sin consultar el pago | `apps/api/src/modules/mercadopago/mercadopago.service.ts:286` |
| 2 | La consulta al pago real existe pero solo corre si `rawStatus === "CONFIRMATION_REQUIRED"` | `apps/api/src/modules/mercadopago/mercadopago.service.ts:281-284` |
| 3 | La normalización correcta **ya existe** (`approved → FINISHED`, `rejected\|cancelled → CANCELED`) | `apps/api/src/modules/mercadopago/mercadopago.service.ts:30-34` |
| 4 | `if (currentState === "FINISHED")` como única condición para concretar la venta | `apps/web/src/hooks/useCheckout.ts:298` |
| 5 | La doc que canoniza el error: `FINISHED → FINISHED → Concretar pedido ✅` | `docs/mp/api-point-devices.md:93` |
| 6 | La spec que lo repite como criterio de aceptación cumplido | `docs/specs/mercadopago/cobro-posnet-mercadopago.md:90-92` |

### Defectos estructurales asociados

| # | Qué | Dónde |
|---|---|---|
| E1 | El intent del Posnet no se persiste en ningún lado (ni en `mp_orders`) | — (ausencia; relacionado con R19) |
| E2 | `Order` no tiene ningún campo de pago (`paymentStatus`, `mpPaymentId`, `mpIntentId`) | `packages/shared/src/domain.ts:38-56` |
| E3 | La impresión del ticket depende de `isStaffOrder`, no del cobro | `apps/api/src/modules/orders/orders.service.ts:83` |
| E4 | El monto aprobado nunca se compara contra el total del carrito | — (ausencia, en ambos caminos) |
| E5 | La constancia de "venta cobrada sin registrar" se escribe antes de registrar | `apps/web/src/hooks/useCheckout.ts:307-308` |
| E6 | El polling del Posnet no tiene deadline (el de QR sí, por `expiresAt`) | `apps/web/src/hooks/useCheckout.ts:279-321` |
| E7 | Un rechazo por fondos se muestra como `"cancelled_by_device"` | `apps/web/src/hooks/useCheckout.ts` (sentinel del branch `CANCELED`) |
| E8 | El QR decide por `status === "processed"` sin mirar `status_detail` ni monto | `apps/web/src/hooks/useCheckout.ts:367` |
| E9 | El polling del estado del cobro se cachea en el navegador (`304 Not Modified`): `res.json` sin `Cache-Control` deja actuar al ETag por defecto de Express | `apps/api/src/modules/mercadopago/mercadopago.controller.ts:51-58` |

### Por qué los webhooks no eran red de seguridad

| Barrera | Dónde |
|---|---|
| `MP_WEBHOOK_SECRET` vacía → 401 fail-closed | R26 (`apps/api/.env`) |
| Se descarta todo lo que no sea `type === "order"`; el topic de Point es `payment_intent` | `apps/api/src/modules/mercadopago/mercadopago-webhooks.service.ts:70` |
| `reconcileFromMp` solo actualiza `mp_orders`; nadie escucha `mp.order.updated` ni revierte una `Order` | módulo `mercadopago` + frontend |

### Descartado como causa

- **`mapMpStatus`** (`apps/api/src/modules/mercadopago/mercadopago-orders.service.ts:329`) — es del
  camino de QR (Orders API). No interviene en el cobro con Posnet y **no es responsable** de este
  incidente. Queda anotado para que la próxima investigación no lo persiga.

---

## Plan técnico

> Escrito el 2026-07-22 tras consultar a `architect-reviewer` (boundaries, secuenciación, impacto
> sobre el contrato de `POST /api/orders`) y `supabase-expert` (modelo de datos, migraciones,
> sync). Los dos, por separado, encontraron el mismo problema con el criterio C — está tratado abajo
> en "Corrección del criterio C". Donde los dos coincidieron, el plan afirma; donde algo quedó sin
> comprobar contra el entorno real, está listado al final en "Lo que quedó sin verificar".

### Enfoque

El bug es de **autoridad**, no de mapeo: hoy el navegador decide si se cobró y el backend obedece.
El arreglo mueve esa decisión al servidor y la apoya en un dato persistido, en **tres piezas
separadas** que no hay que colapsar en una:

1. **`MercadoPagoService` sigue siendo un gateway HTTP crudo.** Se le saca la resolución del pago de
   adentro del `if (rawStatus === "CONFIRMATION_REQUIRED")` (`mercadopago.service.ts:281`) y se la
   convierte en una operación propia —`resolveIntentOutcome(intentId, deviceId)`— que devuelve un
   **DTO rico y crudo** (`rawState`, `paymentId?`, `paymentStatus?`, `statusDetail?`,
   `transactionAmount?`, `externalReference?`), **no** un status ya normalizado. El gateway informa;
   no decide.
2. **`PointPaymentsService` (nuevo, dentro del módulo `mercadopago`) es el dueño de la política.**
   Crea y **persiste** el intent, consulta el estado, resuelve el veredicto, compara montos, aplica
   el deadline, persiste el resultado y marca el intent como consumido. El precedente exacto a
   copiar ya está en el repo: `MercadoPagoOrdersService` es literalmente esto para el camino de QR
   (gateway propio + `MpOrdersRepository` + `getActiveEvent` inyectado, `app.ts:139-148`).
3. **`OrdersService` recibe la verificación por un puerto declarado en su propio módulo.** El
   dominio no importa nada de `mercadopago`; recibe una función.

**La regla que reemplaza al `if`** — y es el corazón del arreglo — no es *"resolvé el pago si el
estado es terminal"* sino:

> **Si el intent trae `payment.id`, se consulta el pago y se decide con eso, sea cual sea el
> `state`.**

Esto importa más allá de la elegancia: el punto 7 del anexo de evidencia muestra que `ON_TERMINAL`
llega **sin** campo `payment`, o sea que `payment.id` aparece recién cuando el intent termina. El
propio dato hace de discriminante. **Consecuencia directa: la pregunta abierta 1 (lista completa de
valores de `state`) deja de bloquear el plan** — el `state` sale del camino de decisión y queda solo
como dato registrado (`raw_state`) y como insumo de los mensajes de la UI.

**El veredicto tiene tres valores, nunca un booleano**: `confirmado` / `rechazado` / `indeterminado`
(más `no_aplica` para efectivo). Es el mismo patrón que el repo ya adoptó con `RestoreResult`
(`{ok, failed, error?}`) después del incidente de `drinks` (`ARCHITECTURE.md` §6). Un booleano
obliga a inventar un default, y por D1 el default no puede ser "cobrado".

**Decisión fuerte que simplifica todo lo demás: un cobro no confirmado NO crea una `Order`.** Vive
en `mp_orders`. Meter órdenes "no confirmadas" en `orders` obligaría a tocar `computeTotals`,
`findActive`, el KDS de `/barra`, la máquina de estados de `Order` y el sync — cinco superficies
nuevas de bug. Con esta decisión, **el criterio D se cumple por construcción**: si no hay `Order`,
no hay ticket ni `order.created`.

**`POST /api/orders` no llama a Mercado Pago.** Lee `mp_orders` local. El veredicto se resuelve en el
polling —que ya habla con MP— y se **persiste** ahí. Tres consecuencias que valen la pena: el
registro no le suma latencia ni un modo de fallo nuevo al camino crítico; **el reintento desde la
constancia funciona aunque MP esté caído**, que es exactamente el escenario que la constancia
cubre; y el estado "no confirmado" queda persistido y sobrevive a un F5. El único hueco es que el
proceso muera entre el veredicto y el UPDATE: se mitiga permitiendo que `POST /api/orders`, **solo**
cuando la fila está ausente o indeterminada, haga una re-consulta viva a MP — y si esa consulta
falla, por D1 el resultado es "no confirmado", nunca "cobrado".

**Corrección del criterio C — el criterio, tomado literal, rompe `/carta`.**

`POST /api/orders` es **público** (`orders.controller.ts:32`, sin `authMiddleware`) y sirve dos casos
semánticamente distintos con el mismo campo:

| Origen | Qué significa `paymentMethod` |
|---|---|
| `/caja` | Cómo **se cobró** una venta que ya ocurrió. |
| `/carta` (`apps/web/src/app/carta/page.tsx:48,215`, default `"qr"`) | Cómo el cliente **piensa** pagar en la barra. El cobro todavía no pasó. |

Exigir prueba de pago para todo `paymentMethod !== "efectivo"` deja `/carta` sin funcionar.

**Decisión de alcance**: la exigencia de prueba de pago cuelga del **origen de la request** (venta de
caja = request con sesión de staff) **y** de `paymentMethod !== "efectivo"`, **no** de
`paymentMethod` solo. El discriminante server-side ya existe y no es forjable: `createdBy` sale de la
cookie (`orders.controller.ts:36-38`), no del body. Con eso, **`/carta` sigue funcionando
exactamente como hoy y no se toca una línea suya**.

**Este plan cubre únicamente la venta de caja.** Durante el análisis apareció un agujero preexistente
de la misma familia —`computeTotals` (`shared/utils/totals.ts:32-40`) suma por `paymentMethod` sin
mirar ningún estado de cobro, así que un pedido de `/carta` infla los totales de la noche sin que
haya entrado un peso—, pero **queda explícitamente fuera de alcance** y **no se modifica
`computeTotals`**: `/carta` está fuera de validación hasta la Fase 7 (ver `docs/ROADMAP.md`), nadie
crea pedidos por ahí, y el flujo digital del cliente se rediseña completo en esa fase. Anotado como
**R28**, diferido a la Fase 7. La prioridad de esta spec es que el cobro de caja funcione.

**Flujo completo resultante:**

```
orders.controller
  → OrdersService.createOrder            (recomputa el total desde drinksRepo — orders.service.ts:41-56;
                                          eso ya existe y es media defensa contra carrito manipulado)
  → verifyPayment({ proof, expectedAmount, method })     [PUERTO, declarado en modules/orders]
  → adaptador (modules/mercadopago)
  → PointPaymentsService  →  MpOrdersRepository + MercadoPagoService
```

### Archivos / módulos afectados

**Puerto de verificación (nuevo, en `orders` — la dependencia apunta hacia el dominio):**

- `apps/api/src/modules/orders/payment-verification.port.ts` (nuevo):

```ts
export type PaymentProof = { provider: "mercadopago"; kind: "point_intent" | "qr_order"; id: string };
export type PaymentVerdict =
  | { result: "no_aplica" }
  | { result: "confirmado"; providerPaymentId: string; amount: number }
  | { result: "rechazado"; reason: string; detail?: string }
  | { result: "indeterminado"; reason: string };
export type VerifyPaymentFn = (input: {
  proof: PaymentProof; expectedAmount: number; method: PaymentMethod;
}) => Promise<PaymentVerdict>;
```

- **Tipo función, no interfaz**, por consistencia con los vecinos: `OrdersService` ya recibe así
  `getActiveEvent`, `incrementOrderCounter`, `saveTicket` y `printTicket`
  (`orders.service.ts:21-29`, cableados en `app.ts:84-101`). **`modules/orders/*` nunca importa nada
  de `modules/mercadopago/*`**; los une `app.ts`.
- **Deuda a pagar en el mismo PR**: el constructor de `OrdersService` ya tiene **8 parámetros
  posicionales**; sumar el noveno es el momento de pasarlo a un objeto `deps`.

**Módulo `mercadopago`:**

- `mercadopago.service.ts:281-287` — se saca la resolución del pago del `if` y se expone
  `resolveIntentOutcome()`. `getPaymentIntentStatus` pasa a apoyarse en ella.
- `mercadopago.service.ts:24-27` — el tipo `MpPayment` (hoy `{id, status}`) suma **`status_detail`**
  (necesario para el criterio E) y **`transaction_amount`** (criterio B).
- `mercadopago.service.ts:69-80` — `buildExternalReference` usa `Date.now()` + descripción y
  `external_ref` tiene UNIQUE: **dos cobros del mismo trago en el mismo milisegundo colisionan** y
  tiran 500 en plena caja. Se le suma `randomUUID()` a la semilla.
- `mercadopago.service.ts:236` — el `X-Idempotency-Key` del Point se genera por request y se tira;
  pasa a persistirse (`idempotency_key` es NOT NULL + UNIQUE en `mp_orders`).
- `point-payments.service.ts` (nuevo) — la política: crear+persistir intent, resolver veredicto,
  comparar montos, deadline, consumir. **No se extiende `MercadoPagoService`**: ya tiene 462 líneas y
  tres responsabilidades, atarlo a un repositorio rompe el patrón del módulo y haría que
  `SystemService` (`app.ts:159`) arrastre el repo transitivamente.
- `mercadopago-point-adapter.ts` (nuevo) — implementa `VerifyPaymentFn` sobre `PointPaymentsService`.
- `mercadopago.controller.ts:51-58` — `Cache-Control: no-store` **por ruta** (criterio I) + endpoint
  nuevo `POST /api/mercadopago/pos/intent/:id/resolve`.
- `mp-orders.repository.ts` — columnas nuevas, UPDATE condicional para consumir el intent.

**Módulo `orders`:**

- `orders.service.ts:20-29` — constructor a objeto `deps` + `verifyPayment`.
- `orders.service.ts:80-90` — la impresión deja de colgar de `isStaffOrder` y pasa a colgar de
  `esVentaDeCaja && (verdict === "no_aplica" || verdict === "confirmado")`. **El efectivo pasa por
  el mismo camino** devolviendo `no_aplica` sin llamar a MP: un solo flujo, cero riesgo de regresión.
- `orders.controller.ts:32-49` — el body suma `payment?: { provider, kind, id }`.
- `printer.controller.ts:30-42` — `POST /api/printer/reprint/:orderId` hoy reimprime **cualquier**
  orden sin mirar nada. Es la puerta de atrás del criterio D y hay que cerrarla.
- `shared/middleware/validate.ts:29-42` — `CreateOrderSchema` pasa a `superRefine` (o discriminated
  union). Ojo: `validate()` hace `req.body = result.data`, así que el schema **también filtra** —
  si el campo no está declarado, no llega al service.

**Explícitamente NO se tocan**: `shared/utils/totals.ts` ni nada de `apps/web/src/app/carta/`. Ver
"Decisión de alcance" arriba y R28.

**Frontend:**

- `useCheckout.ts:279-321` — deadline del polling del Posnet, orden **cobro → constancia → registro**
  (D6), y el `paymentAttemptId` que ya existe (`useCheckout.ts:482-485`) pasa a viajar al Posnet
  (hoy solo lo usa el QR).
- `useCheckout.ts` (branch `CANCELED`) — el sentinel `"cancelled_by_device"` deja de tapar los
  rechazos: rechazo y cancelación quedan distinguibles (criterio E).
- `lib/pendingSales.ts` — la constancia de `localStorage` deja de ser el mecanismo primario y pasa a
  ser espejo de lo que ya está persistido en el servidor.

**Documentación (D7, entra en el mismo entregable):**

- `docs/mp/api-point-devices.md:93` y `docs/specs/mercadopago/cobro-posnet-mercadopago.md:90-92`.
- `docs/ROADMAP.md` — R27 y su estado.

### Cambios de datos

**Se reusa `mp_orders`. No se crea una tabla nueva.** El argumento decisivo es la ligadura desde
`orders`: con dos tablas de cobro haría falta una referencia polimórfica sin FK, o dos FK nullables
mutuamente excluyentes — las dos peores opciones. Además, `type TEXT -- 'qr' | 'point'` existe en la
tabla desde `20260717221900_mp_orders.sql:18`: el modelo estaba **inconcluso**, no era ajeno. Los
tres UNIQUE del PR 3 mapean 1:1 al Posnet (`order_id_mp` ← id del intent, `external_ref` ←
`additional_info.external_reference`, `payment_id` ← `payment.id`), queda **un solo camino de
reconciliación** y **un solo push** en el PR 5.

**M1 — `20260722000000_mp_orders_point.sql`**

Columnas nuevas: `device_id TEXT`, `attempt_id TEXT`, `raw_state TEXT`, `payment_status TEXT`,
`payment_status_detail TEXT`, `paid_amount NUMERIC(12,2)`, `verified_at TIMESTAMPTZ`,
`verification_error TEXT`.

- `payment_status_detail` **cierra el criterio E**: hoy ese dato no se guarda en ningún lado, y sin
  él no hay forma de distinguir "fondos insuficientes" de "cancelado a propósito".
- `raw_state` cierra el último bullet del criterio A: hoy `(rawStatus as MpNormalizedStatus) ??
  "PENDING"` (`mercadopago.service.ts:287`) **castea a ciegas y tira el valor original**.
- `paid_amount` es el insumo del criterio B.

Nullables **con CHECK por discriminante**, no nullables sueltos:

- `mp_orders_type_check` — hoy `type` es TEXT libre **en una tabla de plata**.
- `mp_orders_point_requires_device`.
- `mp_orders_processed_requires_paid_amount`:
  `status <> 'processed' OR (paid_amount IS NOT NULL AND payment_id IS NOT NULL)` — que es
  exactamente el estado que produjo el incidente del 22-07.

Se suma **`'rejected'`** al CHECK de `status` (`20260721000200_mp_orders_status_y_replay.sql:9-13`):
hoy no distingue rechazo de cancelación, que es justo la distinción que la cajera necesita.
`'unknown'` ya existe desde el PR 3 y sirve como el "cobro no confirmado" de D1.

Índice sobre `attempt_id` (**no único**, ver abajo) + `GRANT`/`REVOKE` en la misma línea que el resto
de la tabla.

**⚠️ Unidades — riesgo alto y silencioso.** Point manda y devuelve **centavos** (`amount: 10100` en
el anexo, `mercadopago.service.ts:239` hace `Math.round(amount * 100)`); `/v1/payments` devuelve
**pesos** (`transaction_amount: 101`); `mp_orders.amount` hoy guarda **pesos**. Se guardan **pesos en
ambas columnas** y se convierte en el borde de MP. Si se mezclan, el criterio B compara `101` contra
`10100` y **rechaza todos los cobros buenos**.

**M2 — `20260722000100_orders_cobro.sql`**

- `orders.mp_order_id UUID NULL REFERENCES mp_orders(id)`, con UNIQUE parcial. El orden de creación
  juega a favor: **el cobro nace primero**, así que la fila referenciada ya existe cuando se inserta
  la venta. Al revés harían falta dos escrituras no atómicas. `ON DELETE NO ACTION`: borrar un cobro
  que respalda una venta **debe fallar** — `CASCADE` borraría la venta y `SET NULL` rompería la
  auditoría en silencio.
- `orders.payment_status` con CHECK `('cobrado','pendiente_de_cobro','desconocido')`. Los tres
  valores quedan en el esquema, pero **en este alcance la app escribe únicamente `'cobrado'`**:
  `pendiente_de_cobro` queda **reservado para la Fase 7** (es el estado que va a necesitar `/carta`
  cuando se rediseñe el flujo digital) y `desconocido` es **solo** para las filas pre-migración —no
  hay forma de saber retroactivamente cuáles se cobraron—. Que el esquema esté listo no obliga a
  usar el camino ahora; el default para las filas de `/carta` sigue siendo el de hoy.
- **La invariante como constraint, no como código.** Esto es lo que hace el bug irrepetible:

```sql
CHECK (payment_status <> 'cobrado' OR payment_method = 'efectivo' OR mp_order_id IS NOT NULL)
```

  Una venta cobrada no-efectivo sin cobro ligado queda **imposible de insertar**. El escape del
  efectivo es irreductible: nadie puede verificar server-side que entraron billetes.
- `orders.mp_payment_id TEXT` — **denormalización deliberada**, redundante con el join. Se justifica
  por dos motivos: (1) es el string que el dueño pega en el buscador del panel de MP sin trabajo de
  detective (criterio C, último bullet), y (2) sobrevive a un restore parcial (`safePull` no hace
  rollback). Es inmutable una vez aprobado, así que no hay riesgo de drift. Queda documentado como
  tal para que nadie lo "limpie" después.
- **Idempotencia (R20) — dos índices parciales, dos agujeros distintos**:
  `uq_orders_idempotency_key` cubre "reintento del mismo intento lógico" **incluido el efectivo**
  (que no tiene fila en `mp_orders`), y `uq_orders_mp_order_id` cubre "key nueva, mismo cobro real".
  Los dos `WHERE ... IS NOT NULL`.

**Semántica del handler**: SELECT por `idempotency_key` → si existe, devolver **ese pedido con 201 y
el mismo body** (replay, nunca 409); si salta `23505` por carrera, releer y devolver el ganador —el
patrón que `mercadopago-orders.service.ts:190-197` ya usa—; distinguir qué índice se violó por
`error.constraint`, **no por el mensaje**.

**Anti-forgery / anti-replay del intent**:

- **El cliente manda el `intentId`, NUNCA el `paymentId`.** Un `paymentId` es forjable (cualquier
  pago aprobado de la cuenta validaría N ventas), es redundante (el `payment.id` ya viaja adentro del
  intent) y repite el mismo error de diseño que confiar en `state === "FINISHED"`.
- Se busca la fila en `mp_orders` por `order_id_mp` + `type='point'`; si no existe → 400/409 **sin
  llamar a MP**.
- Consumir el intent es un **UPDATE condicional**
  (`WHERE order_id_mp = $2 AND order_id IS NULL`), mismo patrón que `orders.repository.updateStatus`
  con `expectedStatus` (`orders.repository.ts:13-31`).
- **Bonus**: si el intent ya está consumido, se devuelve **la `Order` existente con 200**, no 409.
  El registro se vuelve idempotente por intent y eso **mata R20** por otra vía.

**Tres comparaciones de monto** (criterio B), y cualquier desajuste ⇒ `indeterminado`, nunca
`confirmado`: `expectedAmount` recomputado por `OrdersService` desde `drinksRepo`, `mp_orders.amount`
(lo que se le pidió al Posnet) y `payment.transaction_amount` (lo que MP aprobó).

**`mp_orders.cart_items JSONB`** — se guardan los items del carrito al crear el intent. Hoy el
carrito vive **solo** en `localStorage` (`lib/pendingSales.ts`), así que si la cajera cierra la
pestaña la venta se pierde aunque el cobro haya entrado. Con esto, "no perder la venta" pasa a ser
garantía del servidor y se puede resolver desde cualquier dispositivo (`POST
/api/mercadopago/pos/intent/:id/resolve`). **Trade-off consciente**: mete datos de dominio en una
tabla del módulo de pagos. Queda anotado como deuda, no como accidente.

**M3 — `20260722000200_revoke_anon_legacy.sql` (R18)** — va aparte a propósito: tiene un radio de
impacto distinto al de las otras tres. Mecánica exacta: el `GRANT ALL ON ALL TABLES TO anon` de
`20240101000000_schema.sql:69` es un **snapshot**, no un `ALTER DEFAULT PRIVILEGES`, así que no
alcanza tablas futuras; pero en una corrida **baseline** (`applied.length === 0`) se re-ejecutan
todas las migraciones en orden y esa línea re-abre lo que exista en ese momento. Un REVOKE con
timestamp `20260722…` **gana siempre** en los dos caminos, por orden lexicográfico. Verificado que
**nadie usa la anon key**: `apps/web/src` no tiene una sola referencia a `SUPABASE_*` y los tres
clientes de `shared/supabase.ts` usan `SERVICE_ROLE_KEY`. `ENABLE RLS` sin policies = deny-all salvo
`BYPASSRLS`, que `service_role` tiene.

**M4 — `20260722000300_repair_checksum_drift.sql`** — opcional pero recomendada. Los tres diffs de
checksum detectados son **exclusivamente comentarios**, producto del rename `docs/specs/…` →
`docs/specs/mercadopago/…` del commit `92ab34c`. **Cero DDL.** No condicionan el deploy
(`detectDrift` no aborta), **pero** `isDegraded` devuelve `true` mientras haya drift: el sistema
queda permanentemente degradado y **se pierde la señal** justo en el deploy que arregla un bug de
plata, donde no se va a poder distinguir "aplicó bien" de "algo falló". Se resuelve con un `UPDATE
schema_migrations SET checksum = …`. **Regla que hay que dejar escrita**: prohibido tocar migraciones
ya aplicadas, aunque sea un comentario — este drift lo causó un `sed` de rutas de docs. Un hook o un
test que compare disco contra `schema_migrations` lo evita mejor que la buena voluntad.

Ninguna de las cuatro necesita `-- migrate:no-transaction`: ese directivo es solo para `CREATE INDEX
CONCURRENTLY`, `ALTER TYPE ADD VALUE`, `VACUUM` y `CREATE DATABASE`, y además el runner corre en el
boot, antes de servir tráfico.

**Sync (PR 5) — orden obligatorio por las FK**: `night_events` → **`mp_orders`** → `orders` →
`tickets`. Hoy `pushEventData` (`sync.service.ts:149-186`) va `night_event → orders → tickets`: hay
que **insertar `pushMpOrders(eventId)` entre el 2 y el 3**. `cloud-sync.repository.ts` necesita
`pushMpOrders()` y sumar las cuatro columnas nuevas al map de `pushOrders()`. En `restoreFromCloud`
(`:255-258`), `pullMpOrders()` va entre `night_events` y `orders` o el upsert revienta con `23503`.
En Cloud la columna va **sin FK**: es archivo histórico y la FK solo agregaría modos de fallo.

**No sube al cloud**: los tokens (D3 de la remediación), `mp_webhook_events` (local-only por su
propia migración — guarda payloads con datos del pagador) y cualquier `raw_payment JSONB` si se
agregara. **No se agrega `raw_payment`**: los payloads de `/v1/payments` traen nombre, mail y últimos
4 dígitos del pagador, y alguien lo va a meter en `pushMpOrders()` sin pensarlo.

### Real-time

**No se inventa ningún evento SSE nuevo.** `mp.order.updated` ya existe con `type: "qr" | "point"`
(`shared/sse/sse-manager.ts:31-44`) y cubre exactamente lo que haría falta emitir.

Dos advertencias que hay que tener escritas:

- **Hoy nadie lo consume.** Emitirlo sin cablear un listener no cambia nada observable — es
  preparación, no funcionalidad.
- **Ninguna decisión de negocio puede depender del SSE.** Es un stream global, sin garantía de
  entrega y con filtrado del lado del cliente (`ARCHITECTURE.md` §7). Es la misma lección que dejaron
  los webhooks: red de seguridad, nunca mecanismo primario.

El cambio real en `order.created` es negativo: **deja de emitirse** cuando el cobro no está
confirmado (criterio D), porque directamente no hay `Order`.

### Auth / permisos

Sin roles nuevos y sin cambios en `UserPermissions`. Cuatro ajustes:

- **`POST /api/orders` sigue siendo público.** Lo que cambia es que la exigencia de prueba de pago
  cuelga del **origen**, no del método: se aplica cuando hay sesión de staff (venta de caja) **y**
  `paymentMethod !== "efectivo"`. El discriminante ya es server-side y no es forjable — `createdBy`
  sale de la cookie (`orders.controller.ts:36-38`), nunca del body.
- **`POST /api/mercadopago/pos/intent/:id/resolve`** (nuevo) — `authMiddleware` +
  `requireRole("admin", "caja")` + `mpContextMiddleware`, igual que sus vecinos del controller. Es lo
  que permite recuperar un cobro desde otro dispositivo si la pestaña se cerró.
- **`POST /api/printer/reprint/:orderId`** (`printer.controller.ts:30-42`) pasa a exigir que la orden
  esté en `payment_status = 'cobrado'`. Si no, el criterio D tiene una puerta de atrás abierta.
- **`Cache-Control: no-store` por ruta** en `mercadopago.controller.ts:51-58` (criterio I).
  Explícitamente **no** se usa `app.set("etag", false)` global: apagar el ETag de toda la app para
  arreglar un endpoint es un cambio de radio desproporcionado.

A nivel base, M3 cierra los privilegios heredados de `anon` (R18); las columnas nuevas de M1/M2 caen
bajo los `GRANT`/`REVOKE` que sus tablas ya tienen.

### Riesgos

**Alto — el runner de migraciones es fail-open y acá eso se vuelve peligroso.** Si M1/M2 fallan, el
backend arranca igual (política deliberada del PR 2), pero entonces el INSERT con las columnas nuevas
rompe **cada venta**. Fail-open a nivel migración + fail-closed a nivel operación es lo peor de los
dos mundos. **Mitigación elegida**: leer `apps/api/src/infra/migrations/migrations-status.ts` y, si
las migraciones nuevas no aplicaron, **bloquear el cobro no-efectivo con un mensaje explícito**
—coherente con D1— reusando el banner que el PR 2 ya dejó puesto.

**Alto — el esquema de Cloud no está versionado en el repo y ya divergió.** Los comentarios de
`pullNightEvents` (`sync.service.ts:157-167`) documentan que Cloud tiene `totals` y **no** tiene
`status` ni `keyword`. Si no se crean en Cloud `mp_orders` y las cuatro columnas nuevas de `orders`,
**`pushOrders` falla entera y con ella el cierre de noche**. Es lo único de esta propuesta que puede
romper algo que **hoy funciona**: hay que verificar contra la instancia real antes de mergear.

**Alto — la mezcla de unidades.** Ya está arriba, pero se repite acá porque el modo de fallo es el
peor posible: si `paid_amount` se guarda en centavos, el criterio B rechaza **todos** los cobros
legítimos y la caja deja de funcionar por completo.

**Medio — `testDeviceReachability` ensucia `mp_orders`.** La prueba de Posnet
(`mercadopago.service.ts:348-410`) usa el mismo polling (`:386`). Si se persiste el intent sin más,
**cada test de $15 deja un cobro fantasma** en la tabla de plata. El intent de prueba tiene que
quedar **explícitamente excluido de la persistencia**.

**Medio — colisión de `external_ref`.** `buildExternalReference` (`:69-80`) usa `Date.now()` +
descripción, y la columna tiene UNIQUE desde el PR 3: dos cobros del mismo trago en el mismo
milisegundo tiran 500 en plena caja. Se arregla con `randomUUID()` en la semilla.

**Medio — no atar `mp_orders.idempotency_key` al `paymentAttemptId` del cliente.**
`createPaymentIntentWithToken` (`:196-222`) **crea un segundo intent** cuando auto-recupera del error
2205 ("queued intent"): dos intents para un solo intento lógico. Con la key atada al attempt, el
segundo INSERT violaría el UNIQUE global y **rompería una recuperación que hoy funciona**. Por eso
`attempt_id` va como columna aparte, **no única**, indexada.

**Medio — `bar_id` / `caja_id` pueden quedar NULL en el camino Posnet** (`allowGlobalFallback: true`,
`mercadopago.service.ts:133`). No hay que hacerlas obligatorias en M1.

**Medio — `MercadoPagoOrdersService.getOrderStatus` (`:232-234`) hace short-circuit** si el status ya
es final. Si la verificación de monto del criterio B se agrega ahí, **las filas ya finales no la
ejecutan** nunca.

**Medio — el agujero de `/carta` queda abierto a propósito (R28).** `computeTotals` sigue sumando
por `paymentMethod` sin mirar estado de cobro, así que un pedido de `/carta` seguiría inflando los
totales de la noche sin cobro asociado. Hoy no causa daño —`/carta` está fuera de validación hasta
la Fase 7 y nadie crea pedidos por ahí— y cerrarlo ahora ampliaría el alcance de una spec que es
bloqueante para producción. **Es una deuda con dueño y fecha**, no un descuido: se resuelve al
rediseñar el flujo digital del cliente. La contrapartida es que hay que acordarse de que existe si
alguien habilita `/carta` antes de la Fase 7.

**Tests que van a caer** (verificado sobre el repo, no inferido): todo el `describe` de
`getPaymentIntentStatus` en `mercadopago.service.test.ts:339-385` (ahora un `FINISHED` dispara un
segundo fetch), `:348` y `:386-390` si se mueve `mapPaymentStatusToNormalized`; los tres tests de
impresión de `orders.service.test.ts:111-146`; **todos** los `new OrdersService(...)` si se pasa a
objeto `deps`; `useCheckout.test.ts`; y probablemente `VentaSection.test.tsx`.

**Deuda asumida conscientemente**: `cart_items` mete datos de dominio en una tabla del módulo de
pagos, y `orders.mp_payment_id` es una denormalización. Las dos están justificadas arriba; las dos
tienen que quedar anotadas para que el próximo que las vea no las "arregle".

### Alternativas consideradas

- **Webhooks como mecanismo primario** — descartado, y el argumento es **estructural y permanente**:
  el sistema es local-first y corre detrás del NAT del boliche. Un webhook de MP **no puede llegar a
  esa máquina**. No es que esté mal configurado (R26): es incompatible con el deploy objetivo. Sirve
  como red de seguridad el día que exista un aterrizaje público, nunca como el camino que decide si
  se cobró.
- **`OrdersService` importando `MercadoPagoService` directo** — descartado: rompe el boundary entre
  módulos y, con el checkout online de la Fase 2, obliga a un `switch (provider)` **adentro del
  dominio**.
- **Un `CheckoutService` orquestador por arriba** — descartado: deja `POST /api/orders` abierto sin
  prueba de pago. La garantía sería del router, no una invariante del dominio, y basta con que
  alguien llame al endpoint por otro camino para perderla.
- **Que el cliente mande el `paymentId`** — descartado: es forjable. Un pago aprobado cualquiera de
  la cuenta validaría N ventas distintas.
- **Modelar el cobro pendiente como un `status` más de `Order`** — descartado: contamina cinco
  superficies (`computeTotals`, `findActive`, el KDS de barra, la máquina de estados, el sync).
- **Tabla `pos_payment_intents` propia** — descartado: duplica medio esquema de `mp_orders` y fuerza
  dos caminos de conciliación y dos pushes distintos.
- **Extender `MercadoPagoService` con el repositorio** — descartado: 462 líneas y tres
  responsabilidades ya son demasiadas, y `SystemService` (`app.ts:159`) terminaría arrastrando el
  repo transitivamente.
- **Que el backend pollee y avise por SSE, sacando al browser del loop** — **arquitectónicamente
  mejor** y encaja con local-first, pero exige estado en memoria, timers y recuperación tras un
  reinicio del proceso. Queda anotado como **evolución natural** una vez que el intent esté
  persistido, que es justamente lo que este plan habilita.
- **Colapsar rechazo de tarjeta con cancelación deliberada** (que sería más simple) — descartado: el
  criterio E lo prohíbe explícitamente, y es el defecto 7 del inventario.
- **`app.set("etag", false)` global** para el criterio I — descartado por radio de impacto: se
  resuelve con una línea por ruta.

### Orden de ejecución

Cada paso deja el sistema consistente y es verificable solo.

| # | Contenido | Por qué corta ahí |
|---|---|---|
| **1** | M1 + persistir el intent del Posnet **sin cambiar ninguna lógica de decisión** | Aislado y reversible: el comportamiento observable no cambia. Cierra el lado Posnet de R19 y **desbloquea todo lo demás**. |
| **2** | `resolveIntentOutcome` + `PointPaymentsService`: veredicto de 3 valores, comparación de montos, deadline server-side | **Acá muere el bug** (criterios A, B, F). Todavía no cambia quién tiene la autoridad. |
| **3** | M2 + el puerto + `OrdersService` exigiendo prueba + impresión colgando del veredicto + `reprint` | **Acá muere el agujero de autoridad** (criterios C, D). Es el paso que más superficie toca. |
| **4** | Frontend: deadline, mensajes que distinguen rechazo de cancelación, orden **cobro → constancia → registro** | Criterios E, F y D6. Depende de que el backend ya devuelva el veredicto rico. |
| **5** | `Cache-Control: no-store` (criterio I) | Una línea. **Se puede adelantar** a cualquier punto: no depende de nada. |
| **6** | Documentación: `docs/mp/api-point-devices.md:93`, `cobro-posnet-mercadopago.md:90-92`, R27 en el roadmap | Criterio H / D7. Va en el mismo entregable, no después. |

M3 (R18) y M4 (checksum drift) son independientes del orden y pueden entrar con el paso 1.

**Gate obligatorio antes de dar esto por cerrado**: reproducir el incidente del 22-07 con la misma
tarjeta sin fondos contra el Posnet físico y verificar que **no** sale ticket, **no** se crea
`Order` y la cajera lee el motivo real. Y el camino feliz de $15, para confirmar que no hubo
regresión.

### Lo que quedó sin verificar

Tres cosas que este plan **asume** y hay que comprobar contra el entorno real antes de implementar —
justamente porque este bug nació de asumir cosas sobre una API sin verificarlas:

1. **El esquema de `orders` en Supabase Cloud y si `mp_orders` existe allá.** Es el único riesgo que
   puede romper algo que hoy funciona (el cierre de noche). Se verifica contra la instancia real.
2. **Si hay filas `type='point'` en `mp_orders` en algún entorno.** El anexo dice **0 filas** en
   local, pero si en otro entorno hay alguna, los CHECK de M1 (`point_requires_device`) van a fallar
   al aplicarse.
3. **La lista completa de valores de `state` de la Point Integration API** (pregunta abierta 1).
   **Ya no bloquea el plan** —el discriminante pasó a ser la presencia de `payment.id`— pero sigue
   importando para redactar los mensajes de la UI y para saber qué guardar en `raw_state`.

---

## Tareas

> Implementadas directamente desde el plan técnico el 2026-07-22 (no se corrió `/tasks` por
> separado: el plan de implementación aprobado en Plan Mode hizo de checklist). Registro:

- [x] M1-M4 (`supabase/migrations/20260722000000..000300`): columnas point + CHECKs en `mp_orders`,
  ligadura + invariante en `orders`, REVOKE anon legacy (R18), reparación del checksum drift.
  Aplicadas dos veces contra la base local — idempotentes, runner en `ok`, drift 0.
- [x] `resolveIntentOutcome` en el gateway + `PointPaymentsService` (veredicto, montos en pesos,
  deadline server-side, persistencia) + exclusión de los intents de prueba.
- [x] Puerto `payment-verification.port.ts` en `orders` + adaptador en `mercadopago` +
  `OrdersService` con `deps` y prueba de pago obligatoria para venta de caja no-efectivo
  (422/409) + replay idempotente + impresión colgando del veredicto + guarda de `reprint`.
- [x] Frontend: veredicto en el polling, mensajes distinguibles (rechazo/cancelación/expirado/
  desconocido), deadline local, proof + `idempotencyKey` en el registro, constancias `blocked`
  ante 409 terminal.
- [x] `Cache-Control: no-store` en los endpoints de estado.
- [x] Docs corregidas (`api-point-devices.md`, roadmap) y sync: `pushOrders` sube las 4 columnas
  nuevas; DDL aplicado en Cloud (sin FK) y **cierre de noche verificado de punta a punta** —
  `sync_status: synced` y la fila en Cloud con `payment_status: 'cobrado'`.
- [x] Tests: 602 unit api + 96 integración + 388 web + typecheck, todo en verde.
- [x] **Gate físico pasado (2026-07-22)**: tarjeta sin fondos → rechazo visible, sin ticket, sin
  pedido (verificado en `mp_orders`: 4 rechazos persistidos, 1 cancelación distinguida, 0 pedidos
  fantasma); cobro aprobado de $101 → pedido con `payment_status='cobrado'` y `mp_payment_id`
  ligado, monto verificado.
