# Gestión de Posnets desde la app — la pantalla de Pagos es decorativa

**Estado**: `draft`
**Fecha**: 2026-07-22
**Origen**: descubierto el 2026-07-21 al intentar usar un Posnet nuevo; **demostrado empíricamente el
2026-07-22** — se hizo un cobro real con el Posnet físico que funcionó perfectamente mientras
`/admin → Pagos` mostraba **"0 Posnets"**, **"No hay Posnets registrados"** y **"Sin Posnet
vinculado"**. El cobro y la pantalla viven en universos separados.

> 📟 **Va ANTES de la Fase 6 (empaquetado).** Entregar un producto donde cambiar un Posnet exige
> editar un `.env` y reiniciar el backend por SSH no es entregable.

---

## Problema / Por qué

### La demostración

El 2026-07-22 se cobró de verdad, con el aparato de verdad, y salió bien. Al mismo tiempo, en la
misma máquina, la pantalla de Pagos del admin afirmaba que **no había ningún Posnet**. Las dos cosas
eran ciertas: **el cobro y la pantalla no comparten ningún dato**.

No es un bug de renderizado ni un caché desactualizado. Son dos caminos que nunca se tocaron.

### Por qué pasa

El cobro resuelve el dispositivo desde una **variable de entorno**:

```
mercadopago.service.ts:178   const resolvedDeviceId = deviceId || env.MP_POS_DEVICE_ID;
```

y con ese id arma el path del payment intent
(`/point/integration-api/devices/{id}/payment-intents`, `:233`). El `deviceId` opcional que recibe
viene de `req.mpContext`, o sea del header `x-device-id` (`mp-context.middleware.ts:17-24`) — que
**hoy el frontend solo manda desde `bar-sessions.service.ts:51`, y con el UUID de la pestaña, no con
un id de Posnet de Mercado Pago**. En la práctica, entonces, **la env es la única fuente real**.

Dar de alta o vincular un Posnet desde `/admin` escribe en `mercadopago_cajas_devices` — una tabla
que **ningún camino de cobro lee**. Verificado el 2026-07-22: esa tabla está **vacía** en la base
local mientras el cobro funcionaba.

La spec de remediación ([`remediacion-integracion-mp.md`](./remediacion-integracion-mp.md))
contempló los *síntomas* (el botón de prueba apunta al device equivocado, el CRUD de PDVs está sin
cablear, `x-device-id` no se valida) pero **no la causa**: no existe el camino
*"device vinculado en la base → el cobro va a ese device"*.

### La consecuencia concreta

**Cambiar de Posnet físico obliga a editar un archivo `.env` y reiniciar el backend.** El dueño de
un boliche no puede hacer eso. Si el aparato se rompe un sábado a la noche, la caja queda parada
hasta que alguien entre por SSH.

Y hay un segundo costo, menos visible pero igual de caro: **diagnosticar por qué un Posnet no cobra
lleva horas**. El episodio del 21-07 se resolvió a fuerza de consultas manuales a la API de Mercado
Pago — cuenta del lector, modo de operación, store, POS, aplicación del token. En producción, con
cola en la barra, eso es la caja parada sin saber por qué (R23).

### La restricción irreductible: OAuth da permiso, no posesión

Antes de diseñar nada hay que dejar esto escrito, porque condiciona todo el resto:

**Mercado Pago no expone ningún endpoint para reclamar ni transferir un lector entre cuentas.** Eso
se hace sí o sí desde la app de MP o desde el propio aparato. Vincular por OAuth **nunca va a
"traer" el Posnet**, y **esta spec no puede automatizar ese paso**.

Todo lo demás sí. Una vez que el lector está en la cuenta, el token de OAuth alcanza para:

- **listarlo** (`GET /point/integration-api/devices`),
- **pasarlo a modo PDV** (`PATCH /point/integration-api/devices/{id}` con `{"operating_mode":"PDV"}`),
- **crear la sucursal y la caja**, y
- **obtener el QR estático**.

O sea: el flujo objetivo tiene **un único paso manual irreductible** — que el dueño reclame el lector
en su cuenta desde la app de MP. **Todo lo que sigue debe poder hacerse desde `/admin`.**

### Estado real verificado (2026-07-22) — línea de base

Esto ya está comprobado contra la API real y contra la base local. **No hace falta re-investigarlo**;
es el punto de partida de la implementación.

| Qué | Valor |
|---|---|
| Lector | `PAX_A910__SMARTPOS1493600985`, cuenta `1517393956` |
| POS | `135641665` — "Barra VIP", `external_id=COCKTRAILBAR01` |
| Store | `85068168` |
| Modo de operación | **`PDV`** — se pasó **a mano** el 2026-07-22 con `PATCH /point/integration-api/devices/{id}` body `{"operating_mode":"PDV"}` |
| `mercadopago_cajas` (local) | **1 fila**: `bar_id` → `bars."Barra VIP"` (`BARRA-01`), `store_id 85068168`, `pos_id_mp 135641665`, `external_pos_id COCKTRAILBAR01`, con `qr_image` y `qr_template` guardados |
| `mercadopago_cajas_devices` (local) | **vacía** |
| `bars` (local) | **1 fila**: `Barra VIP` / `BARRA-01`, con `seller_user_id` en `NULL` |

Que el lector esté en PDV **por un `curl` manual** y que la tabla de devices esté vacía es,
justamente, el resumen de esta spec: el sistema cobra por fuera de sus propias pantallas.

### Los defectos a cubrir

Nueve, cada uno con su criterio de aceptación más abajo.

1. **El cobro no resuelve el device desde la caja.** La env es la única fuente real
   (`mercadopago.service.ts:178`). Debe resolverlo desde el Posnet vinculado a la caja, con
   `MP_POS_DEVICE_ID` degradado a **último recurso**.
2. **No hay forma de descubrir el ID de un aparato nuevo desde la app.** El endpoint
   `GET /point/integration-api/devices` se consulta **dos veces** —
   `mercadopago-provisioning.service.ts:623` (`findDeviceInMp`) y `mercadopago.service.ts:429`
   (`checkDeviceConnection`)— pero **siempre filtrando por un ID conocido y descartando el resto**.
   Hace falta exponer la lista para poder dar de alta sin sacar el número del aparato o del panel de
   MP.
3. **No hay forma de poner un lector en modo PDV desde la app.** Es el `PATCH` de arriba, y hoy va a
   mano con `curl`. **Sin PDV el cobro por sistema no funciona**: un lector en `STANDALONE` rechaza
   los payment intents. Dar de alta un Posnet desde `/admin` **no lo deja operativo**.
4. **`operating_mode` es un campo que miente** (R25). La columna tiene `DEFAULT 'PDV'` y **ningún
   CHECK** (`20260715000300_mercadopago_cajas_devices.sql`, con el comentario *"validar en app, no
   con CHECK"* — validación que nunca se escribió). Al registrar sí se lee de MP, pero con un
   fallback optimista (`mpDevice.operating_mode ?? "PDV"`,
   `mercadopago-provisioning.service.ts:438,477`) y **después nadie lo vuelve a sincronizar**: la
   tabla puede afirmar PDV mientras el aparato real está en STANDALONE.
   *(Matiz verificado: sí existe un aviso vivo de "no está en PDV" en `usePosnetStatus.ts:54-56`,
   pero se alimenta de `checkDeviceConnection`, que filtra por `env.MP_POS_DEVICE_ID` — o sea que
   avisa sobre el device de la env, no sobre el de la caja.)*
5. **Prefijo de modelo hardcodeado.** `PagosSection.tsx:151` construye el id como
   `` `PAX_A910__SMARTPOS${sufijo}` `` y `:504` lo renderiza como label fijo del input. **Solo se
   puede registrar ese modelo de terminal.**
6. **La card "Sucursal" muestra un nombre que no es el de MP.** El backend devuelve `name: "Bosko"`
   como **literal hardcodeado** (`mercadopago-provisioning.service.ts:109`), y la UI lo muestra
   junto al `store_id` real (`PagosSection.tsx:258-281`, duplicado en `PdvSection.tsx:224-252`).
   En Mercado Pago esa sucursal se llama literalmente **`GARCIAMANUEL20231019090947`** — el nickname
   del usuario, puesto por el provisioning automático. El dueño debería poder ponerle un nombre
   humano **y que ese nombre sea el que viaja a MP**.
7. **El botón "Test $15" dispara siempre al device de la env.** `PagosSection.tsx:182` recibe el
   `deviceId` de la fila y **no lo pasa** a `mercadopagoService.testDeviceCharge()`, y el resultado
   se guarda en `testResult` (`:57`) pero **nunca se renderiza** (`:183`). Ya estaba como criterio G
   del PR 6 de la remediación; acá se lo vuelve verificable de punta a punta.
8. **No existe ningún chequeo de salud de la vinculación** (R23): que el seller sea **único y
   activo**, que el lector esté **en la misma cuenta que el seller**, que esté **en PDV**, y que la
   caja esté **provisionada en la cuenta activa**. Hoy el cobro simplemente falla con un error de MP
   y hay que salir a investigar a mano.
9. **Nadie sabe si el fallback por `MP_ACCESS_TOKEN` sirve, hasta que falla un cobro** (R24). El
   22-07 ese token devolvió `total: 0` en `GET /point/integration-api/devices` y se concluyó que
   *"la visibilidad de devices es por aplicación de MP"*; **más tarde el mismo día quedó refutado** —
   con el mismo token el listado devuelve el lector, una vez que el lector pasó a `PDV` con store y
   POS (lo que cambió fue el estado del device, no el token; ver R24 en el roadmap y el changelog de
   la spec de remediación). Lo que queda en pie es el problema real: la utilidad del fallback
   depende de que sea de la **misma cuenta** que el lector y de que efectivamente lo vea, y **el
   sistema no lo observa**. Se **detecta y avisa** acá; la estrategia (preflight F1) es del PR 4 de
   la remediación.

**Para quién**: el dueño (no puede cambiar un Posnet sin un técnico, y no tiene forma de saber por
qué no cobra), la cajera (la caja queda parada sin diagnóstico), y quien mantenga el código (una
pantalla que no describe el sistema que corre).

---

## Objetivo

Que **el Posnet sea configurable, reemplazable y diagnosticable desde `/admin`**, sin tocar archivos
ni reiniciar nada, y que **la pantalla de Pagos describa el sistema que efectivamente cobra**.

En términos de comportamiento observable:

1. **El cobro sale por el Posnet que la pantalla dice.** Lo que se ve en `/admin` y lo que hace la
   caja son la misma cosa.
2. **Cambiar de Posnet es una operación de producto**: el dueño da de alta el aparato nuevo, lo
   vincula a su caja y cobra — sin `.env`, sin reinicio, sin SSH.
3. **Un aparato nuevo se descubre desde la app**, sin tener que leer un número del equipo ni entrar
   al panel de Mercado Pago.
4. **Un lector se deja operativo (PDV) desde la app**, y el modo que muestra la pantalla es el modo
   real del aparato.
5. **El QR estático nunca se ve afectado por un cambio de hardware.**
6. **Cuando la vinculación está rota, la pantalla lo dice** — qué está mal y qué hay que hacer — en
   vez de dejar que se descubra con un cobro fallido.

---

## Historias de usuario

- Como **dueño**, quiero dar de alta un Posnet nuevo eligiéndolo de una lista, para no tener que
  buscar un número de serie en el aparato ni entrar al panel de Mercado Pago.
- Como **dueño**, quiero que si se me rompe el Posnet un sábado a la noche pueda enchufar el de
  backup y vincularlo a la misma caja desde el celular, y seguir cobrando en dos minutos.
- Como **dueño**, quiero que cambiar de aparato **no cambie el QR** que ya imprimí y pegué en las
  mesas.
- Como **dueño**, quiero dejar el lector listo para cobrar (modo PDV) desde la app, para no depender
  de que alguien corra un comando.
- Como **dueño**, quiero ponerle a mi sucursal un nombre que yo entienda, y no un código
  autogenerado.
- Como **dueño**, quiero una pantalla que me diga *"esto está mal y así se arregla"* cuando la
  vinculación con Mercado Pago quedó incoherente, en vez de enterarme cuando la caja no cobra.
- Como **cajera**, quiero probar el Posnet antes de abrir la noche y ver el resultado de esa prueba,
  para no descubrir que no anda con un cliente adelante.
- Como **desarrollador**, quiero que el dispositivo con el que se cobra salga de la base y no de una
  variable de entorno, para que el estado del sistema sea inspeccionable y auditable.

---

## Criterios de aceptación

### A. El cobro resuelve el Posnet desde la caja (bloqueante)

- [ ] **Dado** una caja con un Posnet activo vinculado, **cuando** se cobra desde esa caja,
  **entonces** el payment intent se crea contra **ese** dispositivo — no contra el de
  `MP_POS_DEVICE_ID`.
- [ ] **Dado** que se cambia el Posnet activo de una caja, **cuando** se cobra a continuación,
  **entonces** el cobro sale por el nuevo dispositivo **sin reiniciar el backend** y sin tocar
  ningún archivo de configuración.
- [ ] **Dado** una caja sin Posnet vinculado, **cuando** se intenta cobrar con débito, **entonces**
  el sistema lo dice explícitamente ("esta caja no tiene Posnet vinculado") en vez de cobrar en
  silencio por el dispositivo de la env.
- [ ] **Dado** que existe `MP_POS_DEVICE_ID`, **cuando** se resuelve el dispositivo, **entonces**
  esa variable es el **último recurso** de la cadena, y su uso queda registrado de forma observable
  (log y/o indicador en la pantalla de salud) — nunca es la vía silenciosa por defecto.
- [ ] **Dado** un cliente que manipula el dispositivo que envía el navegador, **cuando** intenta
  cobrar, **entonces** el backend rechaza operar contra un Posnet que no pertenece a la caja de su
  sesión. La resolución es **del lado del servidor** (se coordina con A12 del PR 4 de la
  remediación).

### B. Descubrir y dar de alta un Posnet desde la app (bloqueante)

- [ ] **Dado** un admin en la pantalla de Posnets, **cuando** pide ver los dispositivos de su cuenta,
  **entonces** ve la **lista completa** de los lectores que Mercado Pago reporta para el token
  activo, con su id, modelo y modo de operación.
- [ ] **Dado** un lector que aparece en esa lista, **cuando** el admin lo elige, **entonces** puede
  darlo de alta **sin escribir el id a mano** ni conocerlo de antemano.
- [ ] **Dado** un modelo de terminal distinto al `PAX_A910`, **cuando** se lo da de alta,
  **entonces** el sistema lo acepta. **No queda ningún prefijo de modelo hardcodeado** en el
  formulario ni en la construcción del id.
- [ ] **Dado** que el listado de Mercado Pago devuelve vacío, **cuando** la pantalla lo muestra,
  **entonces** explica el motivo probable (el lector todavía no fue reclamado en esta cuenta, o el
  token es de otra aplicación — ver bloque G) y **no parece un error del sistema**.

### C. Modo PDV desde la app, y un `operating_mode` que no miente (R25)

- [ ] **Dado** un lector en modo `STANDALONE`, **cuando** el admin pulsa "Poner en modo PDV",
  **entonces** el sistema lo cambia contra Mercado Pago y el lector queda operativo para cobrar por
  sistema — **sin `curl`**.
- [ ] **Dado** un `operating_mode` guardado en la base, **cuando** se lo muestra en pantalla,
  **entonces** refleja el **valor real leído de Mercado Pago**, no un default optimista. El
  `DEFAULT 'PDV'` sin CHECK deja de existir como fuente de verdad.
- [ ] **Dado** que el modo del aparato cambió por fuera de la app (desde la app de MP o desde el
  propio lector), **cuando** el admin abre la pantalla o pide refrescar, **entonces** el valor
  mostrado se **sincroniza** contra Mercado Pago.
- [ ] **Dado** un Posnet vinculado a una caja que **no** está en PDV, **cuando** el admin mira la
  pantalla, **entonces** ve la advertencia referida a **ese** dispositivo — no a
  `MP_POS_DEVICE_ID`, como hoy (`usePosnetStatus.ts:54-56` vía `checkDeviceConnection`).

### D. Ciclo de vida: la caja es estable, el Posnet es reemplazable

- [ ] **Dado** una caja con un Posnet activo, **cuando** se vincula uno nuevo a la misma caja,
  **entonces** el anterior queda **desvinculado e histórico — no se borra**, y el nuevo pasa a ser
  el activo.
- [ ] **Dado** ese reemplazo, **cuando** termina, **entonces** el `external_pos_id` y el **QR
  estático de la caja no cambian**. Verificable comparando el QR antes y después.
- [ ] **Dado** un Posnet ya vinculado a una caja, **cuando** se intenta vincularlo a **otra** caja,
  **entonces** el sistema lo impide y explica por qué (preserva la trazabilidad de los cobros
  históricos).
- [ ] **Dado** varios Posnets dados de alta (por ejemplo uno de backup), **cuando** se los lista,
  **entonces** conviven sin conflicto, pero **una caja tiene a lo sumo un Posnet activo**.
- [ ] **Dado** el modelo de arriba, **cuando** se revisa el esquema, **entonces** las restricciones
  de base lo expresan de verdad: hoy `uq_device_id UNIQUE (device_id)` y
  `uq_device_caja_linked (caja_id) WHERE caja_id IS NOT NULL`
  (`20260715000300` + `20260717224503`) **no admiten un histórico**: el device viejo tendría que
  quedar con `caja_id NULL`, perdiendo justamente el vínculo que se quiere preservar. Hay que
  introducir el concepto de "activo" sin romper los invariantes.

### E. Identidad de la sucursal y de la caja

- [ ] **Dado** un admin en la pantalla de Pagos, **cuando** mira la card "Sucursal", **entonces** ve
  el **nombre real** de la sucursal, no el literal `"Bosko"` hardcodeado en
  `mercadopago-provisioning.service.ts:109`.
- [ ] **Dado** que el dueño quiere identificar su sucursal, **cuando** le pone un nombre humano,
  **entonces** ese nombre queda guardado y se muestra en toda la app.
- [ ] **Dado** ese nombre, **cuando** se decide si viaja a Mercado Pago (ver preguntas abiertas),
  **entonces** la pantalla **no miente**: o el nombre es el que MP tiene, o queda claro que es un
  alias local y cuál es el nombre en MP (hoy, `GARCIAMANUEL20231019090947`).
- [ ] El nombre y el código del punto de venta que se muestran en pantalla son **los reales**, no
  literales fijos (converge con el criterio G del PR 6 de la remediación).

### F. Probar el Posnet y ver el resultado

- [ ] **Dado** un admin con varios Posnets listados, **cuando** pulsa "Test $15" en una fila,
  **entonces** el cobro de prueba se dispara **contra el dispositivo de esa fila**
  (`PagosSection.tsx:182` deja de descartar el `deviceId`).
- [ ] **Dado** ese test, **cuando** termina, **entonces** el resultado se **muestra en pantalla**
  (hoy `testResult` se setea en `:57` y nunca se renderiza en `:183`), distinguiendo "llegó al
  aparato", "no llegó" y "error", con el motivo.
- [ ] **Dado** un error de red o de Mercado Pago al cargar la pantalla, **cuando** ocurre,
  **entonces** el usuario se entera — no se traga en un `catch {}`.

### G. Salud de la vinculación (R23 + R24)

- [ ] **Dado** un admin en `/admin`, **cuando** abre el panel de salud de Mercado Pago, **entonces**
  ve de un vistazo el estado de **cuatro chequeos**, cada uno en verde/rojo y con el dato concreto:
  1. **Un solo seller activo** (hoy hay dos — R21).
  2. **El lector está en la misma cuenta que el seller vinculado.**
  3. **El lector está en modo PDV.**
  4. **La caja está provisionada en la cuenta actualmente activa** (hoy hay POS con el mismo
     `external_id` en dos cuentas a la vez — R22).
- [ ] **Dado** un chequeo en rojo, **cuando** el admin lo mira, **entonces** el mensaje dice **qué
  hacer**, no solo qué está mal.
- [ ] **Dado** que existe el fallback `MP_ACCESS_TOKEN`, **cuando** se evalúa la salud, **entonces**
  el panel muestra si ese token es de la **misma cuenta** de Mercado Pago que el lector y si
  **efectivamente ve** el lector configurado (y en qué `operating_mode`), o bien que no se pudo
  determinar — y **avisa antes del cobro**, no durante (R24). El cálculo lo hace el preflight del PR
  4 de la remediación (estrategia F1); acá es una fila más del panel.
- [ ] **Dado** el diagnóstico completo, **cuando** se lo compara con el episodio del 21-07,
  **entonces** ese problema (lector de otra cuenta + STANDALONE) habría sido evidente **sin una sola
  consulta manual a la API**. Es el criterio de éxito real de este bloque.

### H. Migrar el Posnet a la cuenta del boliche (R22)

El procedimiento acordado está en `docs/ROADMAP.md` → "Feature — Gestión de Posnets desde la app" y
**no se duplica acá**. Lo que esta spec debe garantizar es que sea **ejecutable desde la app**:

- [ ] **Dado** el dueño con su cuenta ya vinculada por OAuth, **cuando** re-provisiona sucursal y
  caja, **entonces** puede hacerlo **desde `/admin`**, sin scripts.
- [ ] **Dado** que re-provisionar **cambia el QR estático**, **cuando** el admin está por ejecutar la
  operación, **entonces** el sistema **avisa antes**, explícitamente, que el QR va a cambiar y que
  hay que **reimprimirlo** si ya está pegado en las mesas. El aviso es previo, no un mensaje de
  éxito posterior.
- [ ] **Dado** un cambio de cuenta de Mercado Pago, **cuando** se completa, **entonces** las cajas
  provisionadas en la cuenta saliente quedan **señaladas como huérfanas** (o limpiadas) — no
  conviviendo en silencio con las nuevas.
- [ ] El único paso que queda fuera de la app es **reclamar el lector en la cuenta del dueño desde
  la app de MP**, y la pantalla lo dice con esas palabras.

### I. Documentación

- [ ] `docs/ROADMAP.md` deja de ser la fuente de verdad de esta feature y **apunta a esta spec**;
  R23, R24 y R25 referencian esta spec como el lugar donde se resuelven.
- [ ] `docs/ARCHITECTURE.md` describe la resolución del dispositivo desde la caja y el rol degradado
  de `MP_POS_DEVICE_ID`.
- [ ] `.env.example` documenta que `MP_POS_DEVICE_ID` es un **último recurso** y que
  `MP_ACCESS_TOKEN` es un **fallback de emergencia** que, para servir con Posnet, tiene que ser de la
  **misma cuenta** que el lector y verlo en el listado de devices (R24).

---

## Fuera de alcance

- **Reclamar o transferir un lector entre cuentas de Mercado Pago desde la app.** No existe API para
  eso. Es el paso manual irreductible: el dueño lo hace desde la app de MP o desde el propio
  aparato. Esta spec lo **acompaña con instrucciones claras**, no lo automatiza.
- **Multi-caja / multi-barra.** El modelo sigue siendo "1 caja por barra" y la implementación actual
  topea en 1 PDV. Varias cajas simultáneas llegan con el multi-tenant de la Fase 6.
- **Verificar el resultado real del cobro.** Es la spec hermana
  [`cobro-verificado.md`](./cobro-verificado.md) — ver "Relación con lo que ya existe".
- **La inversión del token, el cifrado y el modelo single-seller** (PR 4 de la remediación). Esta
  spec **consume** el seller activo, no cambia cómo se resuelve ni dónde vive el token. El chequeo
  de salud del bloque G **detecta** el problema de los dos sellers activos (R21); resolverlo es del
  PR 4.
- **Migrar el Posnet de Payment Intents a Orders API** (R15) — sigue siendo una spec propia.
- **Rediseñar la UX de la pantalla de Pagos.** Se le da funcionalidad y se corrigen sus defectos; el
  rediseño y la mudanza de las Cards a `PdvSection` son del PR 6 de la remediación.
- **Sincronizar Posnets y cajas a la nube** — es del PR 5 (conciliación).
- **Reembolsos** (Fase 7 de MP).

---

## Decisiones tomadas

### D1 — La caja es la unidad estable; el Posnet es hardware reemplazable *(2026-07-21)*

- **La caja (punto de venta) es la unidad estable.** Su `external_pos_id` y su **QR son estáticos y
  no cambian nunca** — el QR vive atado al punto de venta en Mercado Pago, **no al hardware**. Es lo
  que ancla la auditoría y lo que el cliente escanea.
- **El Posnet es hardware reemplazable colgado de una caja.** Un dispositivo se vincula a **una sola
  caja y no se mueve entre cajas** (preserva la trazabilidad de los cobros históricos), pero **una
  caja sí puede cambiar de dispositivo**: si se rompe, se vincula el nuevo a la misma caja, el
  anterior queda **desvinculado e histórico (no se borra)** y **el QR ni se entera**.
- Pueden convivir **varios Posnets dados de alta** (por ejemplo uno de backup), pero **uno solo
  activo por caja**.

El fundamento es que las dos cosas cambian a ritmos distintos: el QR se imprime y se pega una vez, y
el hardware se rompe, se reemplaza y se rota. Atar el QR al aparato haría que romper un Posnet
obligue a reimprimir todas las mesas.

### D2 — `MP_POS_DEVICE_ID` no se elimina, se degrada a último recurso

Sacarla de un saque rompería el único camino de cobro hoy probado en vivo. Se la mantiene como
**último eslabón** de la cadena de resolución, con dos condiciones: que su uso sea **visible** (no
silencioso), y que la pantalla de salud avise cuando se está cobrando por ella — porque cobrar por
la env significa que la configuración de la app **no** es la que manda.

Además arrastra la restricción de R24: si el token de la env es de otra aplicación de MP, ese
fallback **no ve el device y no puede cobrar** aunque sea de la cuenta correcta.

### D3 — Todo lo que no requiera posesión física se hace desde `/admin`

Corolario de la restricción irreductible. Listar devices, ponerlos en PDV, crear sucursal y caja, y
obtener el QR estático **son todas operaciones que el token OAuth puede hacer**. Ninguna de ellas
tiene justificación para seguir siendo un `curl` manual o una variable de entorno.

El criterio de corte es nítido: **si la API de Mercado Pago lo permite con el token del dueño, va en
la app.**

### D4 — El chequeo de salud existe porque el modo de falla es "no cobra y no se sabe por qué"

No es una pantalla de lujo. El episodio del 21-07 costó horas de consultas manuales para descubrir
dos hechos que la API contesta en una llamada: el lector estaba en otra cuenta y en STANDALONE. En
producción ese mismo diagnóstico se hace con la caja parada.

Los cuatro chequeos del bloque G están elegidos por eso: son exactamente las cuatro cosas que
estuvieron mal en los incidentes reales de esta integración (R21, R22, R23, R25).

### D5 — El modo real del aparato manda sobre lo que dice la base

`operating_mode` con `DEFAULT 'PDV'` y sin CHECK es peor que no tener el campo: un admin lee "PDV",
cree que el lector está operativo, y el cobro falla igual. Un dato falso hace **más** lento el
diagnóstico que un dato ausente.

La columna pasa a ser **cache del valor real**, con origen declarado (lo que devolvió MP y cuándo),
no una afirmación optimista del sistema sobre sí mismo.

### D6 — Esto va antes de la Fase 6, y pegado al PR 6 de la remediación

Entregar un producto empaquetado donde cambiar un Posnet exige editar un archivo por SSH no es
entregable. Y el PR 6 de la remediación cablea la pantalla que esta feature necesita: conviene
hacerlas **juntas**, o esta **inmediatamente después**.

---

## Preguntas respondidas (decididas por el dueño del proyecto el 2026-07-22)

**¿El chequeo de salud debe bloquear el cobro o solo advertir?** → **Bloquear solo lo grave.**
El sistema frena el cobro no-efectivo únicamente cuando la incoherencia implica que **la plata
iría a otra cuenta** (el seller activo no es el dueño del lector — el escenario que ya ocurrió en
vivo con el cobro de $15 que entró a la cuenta del otro desarrollador). Todo lo demás (lector en
STANDALONE, caja provisionada desactualizada, etc.) **solo advierte** con cartel visible en
`/caja` y `/admin`: esos casos fallan solos al cobrar y lo que necesita la cajera es el mensaje
claro, no un bloqueo preventivo que pueda dejar la caja parada por un falso positivo.

**¿Un mismo lector puede servir a dos cajas en momentos distintos?** → **No: el modelo queda
rígido.** Un Posnet pertenece a su caja para siempre. Si el local tiene dos barras, cada una tiene
su aparato (o solo una cobra con MP). No existe el caso de un único lector rotando entre barras, y
la rigidez compra trazabilidad perfecta de los cobros históricos y un esquema más simple. Si el
boliche real algún día lo necesitara, se reformula el invariante en ese momento — no se paga la
complejidad por adelantado.

## Preguntas abiertas

Ninguna bloquea escribir el plan técnico, pero hay que responderlas antes de implementar.

1. **¿Qué pasa con los cobros históricos de un Posnet que se desvincula?** El modelo dice que el
   device queda histórico y no se borra, pero falta definir **cómo se muestra** (¿en la lista con un
   estado "histórico"? ¿en un detalle aparte?), si se puede **reactivar** (por ejemplo, el aparato
   volvió del service), y qué pasa con sus cobros en la conciliación.
2. **¿Cómo se descubre un lector nuevo si el dueño todavía no lo reclamó en su cuenta?** No aparece
   en `GET /devices` hasta que es suyo. Hay que decidir **qué le muestra la UI en ese estado** para
   que no parezca un error del sistema, y cómo se distingue "todavía no lo reclamaste" de "el token
   es de otra aplicación" (R24), que producen el mismo listado vacío.
3. **¿Conviene renombrar la sucursal en Mercado Pago vía API, o solo mostrar un alias local?**
   Afecta si el nombre **viaja o no** a MP, y por lo tanto qué ve el dueño en su panel de Mercado
   Pago comparado con lo que ve en Cocktrail.

---

## Relación con lo que ya existe

- **PR 6 de [`remediacion-integracion-mp.md`](./remediacion-integracion-mp.md)** — cablea la pantalla
  de PDVs (mueve las Cards de `PagosSection` a `PdvSection`, arregla `handleTestCharge`, migra los 6
  tests skipeados). **Esta spec le da la funcionalidad que hoy no existe**: el PR 6 pone la pantalla
  en su lugar, esta spec hace que la pantalla mande sobre el cobro. **Conviene hacerlas juntas, o
  esta inmediatamente después.** Los criterios E y F de acá se solapan deliberadamente con el
  criterio G del PR 6 — no son trabajo duplicado, son el mismo trabajo visto desde los dos lados.
- **[`cobro-verificado.md`](./cobro-verificado.md)** (spec hermana, escrita el mismo día) — toca el
  **mismo camino de cobro** pero por otro motivo: que un pago rechazado se registra como venta.
  **No se pisan** (una decide *con qué aparato* se cobra, la otra *si el cobro fue real*), pero
  ambas modifican `mercadopago.service.ts`. Si se implementan en paralelo hay que **coordinar quién
  toca ese archivo**; el orden natural es `cobro-verificado` primero (es bloqueante para producción)
  y esta después o encima.
- **Riesgos del roadmap**: **R23** (sin chequeo de salud) y **R25** (`operating_mode` miente) se
  cierran acá. **R24** (el fallback por env puede no ver el lector — la formulación "visibilidad por
  aplicación" quedó refutada el 22-07) se **detecta y avisa** acá; la estrategia de fallback
  definitiva es la **F1** del PR 4. **R22** (cajas huérfanas al cambiar de cuenta) se cubre desde el
  lado del procedimiento (bloque H); la limpieza al desvincular es del PR 4. **R21** (dos sellers
  activos) se **detecta** acá, se resuelve en el PR 4.
- **Fase 6 (empaquetado)** — esta feature va **antes**: ver D6.

---

## Anexo — Trazabilidad

Referencias verificadas sobre el código y contra la API real el 2026-07-22.

| # | Qué | Dónde |
|---|---|---|
| 1 | El cobro resuelve el device desde la env; el `deviceId` opcional viene del header | `apps/api/src/modules/mercadopago/mercadopago.service.ts:178,190,290` |
| 2 | El header `x-device-id` no está validado y hoy no transporta un id de Posnet de MP | `mp-context.middleware.ts:17-24`, `apps/web/src/services/bar-sessions.service.ts:51` |
| 3 | `GET /devices` consultado filtrando por un id conocido (verificación de alta) | `mercadopago-provisioning.service.ts:617-628` (`findDeviceInMp`) |
| 4 | `GET /devices` consultado filtrando por `env.MP_POS_DEVICE_ID` (estado de conexión) | `mercadopago.service.ts:429,441` |
| 5 | `operating_mode` con `DEFAULT 'PDV'` y sin CHECK ("validar en app" — nunca se hizo) | `supabase/migrations/20260715000300_mercadopago_cajas_devices.sql` |
| 6 | Fallback optimista `?? "PDV"` al registrar, sin re-sincronización posterior | `mercadopago-provisioning.service.ts:438,477` |
| 7 | Constraints que no admiten un device "histórico" con su caja | `20260715000300` (`uq_device_id`) + `20260717224503` (`uq_device_caja_linked`) |
| 8 | Prefijo de modelo hardcodeado al construir el id y como label del input | `apps/web/src/components/settings/PagosSection.tsx:151,504` |
| 9 | Nombre de sucursal hardcodeado (`name: "Bosko"`) devuelto por el backend | `mercadopago-provisioning.service.ts:109` |
| 10 | `handleTestCharge` recibe el `deviceId` y no lo pasa; `testResult` nunca se renderiza | `PagosSection.tsx:57,182,183` |
| 11 | Aviso de "no está en PDV" atado al device de la env, no al de la caja | `apps/web/src/hooks/usePosnetStatus.ts:54-56,73` |
| 12 | Cadena de resolución de credenciales (3 niveles) que esta spec consume sin cambiar | `credentials-resolver.service.ts:25-46` |
| 13 | `PATCH /point/integration-api/devices/{id}` con `{"operating_mode":"PDV"}` — hoy a mano | verificado contra la API real, 2026-07-22 |
| 14 | `GET /point/integration-api/devices/{id}` devuelve 404 `"Action not supported"` para **todos** los ids: el único dato confiable es el **listado** | verificado contra la API real, 2026-07-22 |

---

## Plan técnico

> Pendiente — se escribe con `/plan gestion-posnets`, **después** de responder las preguntas
> abiertas 2 y 3 (invariante device↔caja y política de bloqueo del chequeo de salud), que condicionan
> el esquema y el camino de cobro.

---

## Tareas

> Pendiente — `/tasks gestion-posnets`.
