# Cobro verificado — el sistema registra ventas que Mercado Pago rechazó

**Estado**: `draft` — **evidencia empírica capturada** (2026-07-22 18:31); la pregunta abierta sobre
`payment.id` quedó **resuelta**.
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

> Pendiente — se escribe con `/plan cobro-verificado`.
>
> **Ya no lo bloquea la pregunta del `payment.id`**: quedó resuelta empíricamente el 2026-07-22 (ver
> "Preguntas respondidas") y con ella la forma de la solución. La **única** pregunta que le sigue
> abierta al plan es la **lista completa de valores de `state` de la Point Integration API**
> (pregunta abierta 1), necesaria para saber qué estados son terminales.

---

## Tareas

> Pendiente — `/tasks cobro-verificado`.
