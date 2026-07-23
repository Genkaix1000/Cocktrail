# Gestión de Posnets desde la app — la pantalla de Pagos es decorativa

**Estado**: **`implementada`** (2026-07-23). Backend (T2-T18) + PR 6 (T19) + frontend (T20-T25) implementados; `pnpm typecheck` + `pnpm test` en verde (T27: 814 tests api, 466 web); docs actualizadas (T26). Gates físicos con el Posnet real pasados por el dueño: T11 (cobro resuelto desde la caja, sin env), T14 (modo PDV desde la app), T28 (E2E de las pantallas) y T29 (swap con QR intacto, caja sin Posnet, panel de salud en verde). Hallazgo del gate: la API de MP y el aparato físico se desalinean con un lag de propagación de minutos — el cobro sigue el hardware, y por eso STANDALONE solo advierte, nunca bloquea (validado en vivo).
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

Ninguna — las tres restantes se decidieron el **2026-07-23**:

1. **¿Qué pasa con los cobros históricos de un Posnet que se desvincula?** → **Lista única +
   reactivable.** Los históricos aparecen en la misma lista con estado "histórico" y un botón para
   **reactivarlos en SU misma caja** (por ejemplo, el aparato volvió del service). Sus cobros
   quedan trazables en la conciliación.
2. **¿Cómo se descubre un lector nuevo si el dueño todavía no lo reclamó?** → **Pantalla guía con
   diagnóstico.** Explica las dos causas del listado vacío ("todavía no reclamaste el lector en tu
   cuenta de MP" vs "el token es de otra aplicación", R24) y usa los datos del preflight F1
   (`tokenUserId`, `deviceSeen`) y el seller activo para orientar cuál es la más probable, con el
   paso a seguir en cada caso. Nunca parece un error del sistema.
3. **¿Renombrar la sucursal en MP vía API o alias local?** → **El nombre viaja a Mercado Pago**
   (PUT del store): una sola verdad entre Cocktrail y el panel de MP. Si la API no lo aceptara
   (supuesto a validar en el paso 1 del plan), se degrada a alias local mostrando también el
   nombre real de MP — la pantalla nunca miente.

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

> Escrito el 2026-07-23 sobre las decisiones del dueño del 2026-07-22/23 (histórico con reactivar,
> pantalla guía para el listado vacío, nombre de sucursal vía API con degradación a alias, bloqueo
> solo del caso grave, posnet fijo a su caja para siempre) y el esquema diseñado con
> `supabase-expert`, que este plan adopta tal cual. **Supuesto del paso 1 VALIDADO el 2026-07-23**
> contra el store real: `PUT /users/{user_id}/stores/{store_id}` acepta `{ name }`, el rename se
> aplica y no es replace (campos intactos) → **rama A confirmada** (el nombre viaja a MP; la
> degradación a alias de T15 queda como resguardo). Va **encima de
> `cobro-verificado`** (ya mergeado): los puntos de fricción con `mercadopago.service.ts` y
> `PointPaymentsService` están señalados explícitamente.

### Enfoque

El defecto de fondo es que **el cobro y la pantalla no comparten ningún dato**: el device sale de
`env.MP_POS_DEVICE_ID` y la tabla `mercadopago_cajas_devices` no la lee nadie. El arreglo invierte
la autoridad en un único punto: un **resolver server-side** (`posnet-resolver.service.ts`) que, en
cada cobro, hace `barId (A12) → caja → device activo` y deja la env como **último recurso
observable** — el header `x-device-id` del cliente deja de participar (A5). Alrededor de eso, el
esquema gana el concepto de **activo/histórico** (una caja, a lo sumo un posnet activo; el posnet
pertenece a su caja para siempre), el provisioning gana lo que hoy va con `curl` (listar la cuenta,
PATCH a PDV, re-sync del modo real, renombrar la sucursal, re-provisionar), y un
`mp-health.service.ts` concentra los 4 chequeos del bloque G — de los cuales **solo el grave**
(la plata iría a otra cuenta) bloquea el cobro, server-side, en el mismo resolver.

### Archivos / módulos afectados

**Backend — módulo `mercadopago` (nuevos):**

- `apps/api/src/modules/mercadopago/posnet-resolver.service.ts` — la autoridad del bloque A:

```ts
export type ResolvedPosnet = {
  deviceId: string;
  source: "caja" | "env";       // "env" = último recurso, siempre logueado
  cajaId: string | null;
};
export class PosnetResolverService {
  constructor(
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly devicesRepo: MercadoPagoCajasDevicesRepository,
    private readonly assertNotGrave: (deviceId: string, cajaId: string) => Promise<void>, // MpHealthService
  ) {}
  async resolveForCharge(barId: string | undefined): Promise<ResolvedPosnet>;
}
```

  Cadena: `barId → cajasRepo.findByBarId → devicesRepo.findActiveByCajaId`. Reglas duras:
  - **Caja existente sin device activo → `Conflict` 409** con el texto del criterio A: *"esta caja
    no tiene Posnet vinculado"*. La configuración explícita manda; acá **no** se cae a la env.
  - **Sin `barId` o sin caja provisionada** (instalación legacy) → `env.MP_POS_DEVICE_ID` con
    `logger.warn` + flag `usingEnvDevice` que la salud expone (D2: visible, nunca silencioso).
    Si tampoco hay env → el mismo 409.
  - Antes de devolver, corre la **guarda grave** (ver Auth/permisos): si el último listado exitoso
    de devices con las credenciales activas **no** incluye el device de la caja → 409 con mensaje
    accionable. Si el chequeo está en `unknown` (MP caído, sin listado fresco), **no bloquea** —
    la decisión del dueño es no parar la caja por un falso positivo; ese caso falla solo en MP.

  **Por qué en un service y no en `mp-context.middleware.ts`**: (1) es política de cobro con
  fail-closed (409), y el middleware es deliberadamente fail-open con cache — semánticas opuestas
  en el mismo archivo son un bug esperando turno; (2) la guarda grave necesita al seller activo y
  al estado de salud, dependencias de service, no de middleware; (3) el middleware corre en rutas
  que no cobran (`GET /pos/intent/:id`, `/resolve`, `DELETE`) y no tiene sentido pagar un lookup a
  DB ahí. El middleware solo cambia el comentario: `x-device-id` queda **deprecado** (el PR 6
  elimina al único emisor, `bar-sessions.service.ts:51`).

- `apps/api/src/modules/mercadopago/mp-health.service.ts` — bloque G:

```ts
export type MpHealthCheck = { ok: boolean | null; detail: string; action?: string }; // null = unknown
export type MpHealth = {
  checks: {
    singleSeller: MpHealthCheck;      // R21 — sellersRepo: exactamente 1 activo
    deviceOwnership: MpHealthCheck;   // el listado con credenciales activas contiene el device activo de la caja
    deviceMode: MpHealthCheck;        // operating_mode real === "PDV"
    cajaProvisioned: MpHealthCheck;   // R22 derivado: caja.sellerUserId === sellerActivo.userId (SIN columna)
  };
  fallback: MpFallbackStatus;         // fila F1, directo de getMpFallbackStatus()
  usingEnvDevice: boolean;            // D2: se está cobrando por la env
  blocking: boolean;                  // true ⟺ deviceOwnership.ok === false (el ÚNICO caso que bloquea)
  checkedAt: string;
};
```

  Cache en memoria con TTL 30 s + `?refresh=1` (mismo patrón que `resolveInstallationBarId` y el
  preflight). Cada chequeo en rojo lleva `action` — el criterio G exige decir **qué hacer**, no
  solo qué está mal. El listado de devices que alimenta `deviceOwnership`/`deviceMode` **es el
  mismo fetch** que re-sincroniza `operating_mode` + `operating_mode_synced_at` (bloque C): un solo
  camino, cero oportunidades de que la salud y la tabla digan cosas distintas.

  **Endpoint propio `GET /api/mercadopago/health` — no se extiende `/api/system/health`.**
  Justificación: `SystemService.getHealth()` es **sync y sin fetchs por contrato** (comentario en
  `system.service.ts:63` — lo caro va en `getStatus()`, que está rate-limiteado); los 4 chequeos
  necesitan hablar con MP. Y meterle a `SystemService` los repos de sellers/cajas/devices repetiría
  el acople transitivo que el plan de `cobro-verificado` evitó a propósito. `/api/system/health`
  no se toca: su `mpFallback` sigue siendo la fuente de la fila F1 para quien ya lo consume.

**Backend — módulo `mercadopago` (modificados):**

- `mercadopago.service.ts` — **se elimina `|| env.MP_POS_DEVICE_ID`** de los cuatro puntos
  (`createPaymentIntent` L214/226, `testDeviceReachability` L428, `checkDeviceConnection`
  L520/532): el gateway pasa a **exigir** `deviceId` explícito y el único lugar del sistema que
  conoce la env es el resolver. `checkDeviceConnection(deviceId: string)` gana el parámetro (hoy
  filtra por la env — es el defecto 4 de la spec, el aviso de `usePosnetStatus` habla del device
  equivocado). **Fricción con cobro-verificado, acotada**: `resolveIntentOutcome` y
  `getPaymentIntentStatus` **no se tocan** — ya reciben el `deviceId` de la fila de `mp_orders`,
  que ahora se persiste con el valor resuelto; el veredicto queda igual de trazable.
- `point-payments.service.ts` — `CreatePointIntentInput` **pierde `deviceId`** (venía del cliente:
  anti-spoof A5) **y gana `barId?`**; el constructor suma `resolvePosnet` a las deps. `createIntent`
  resuelve primero y persiste en `mp_orders` el `device_id` y `caja_id` **resueltos** (las columnas
  nullables ya existen desde cobro-verificado; el CHECK `mp_orders_point_requires_device` queda
  satisfecho por construcción).
- `mercadopago.controller.ts` — `POST /pos/intent` pasa `req.mpContext.barId` y deja de leer
  `mpContext.deviceId`; `POST /device/test-charge` acepta `deviceId` opcional en el body (test por
  fila — criterio F; sin body, resuelve el de la caja); `GET /device/status` resuelve vía resolver.
  Ruta nueva `GET /health` (admin+caja, `Cache-Control: no-store` como sus vecinos).
- `mercadopago-provisioning.service.ts` — el que más crece:
  - `listMpDevices()` — expone la lista **cruda** de `GET /point/integration-api/devices` (hoy
    `findDeviceInMp` L588 la tira después de filtrar), con `{ id, model, operatingMode, poiType?,
    storeId?, posId?, registeredLocally }` (`model` derivado del prefijo del id — `id.split("__")[0]`
    — porque `GET /devices/{id}` no existe en MP, anexo #14) + contexto para la pantalla guía de la
    decisión 2: `{ token: { source: "seller" | "env"; userId: string | null }, sellerUserId }`.
  - `setDeviceOperatingMode(deviceId, mode: "PDV" | "STANDALONE")` — el
    `PATCH /point/integration-api/devices/{id}` que hoy va a mano (bloque C).
  - **Re-sync del modo real** en cada `listMpDevices()`/`getCajas()`: persiste `operating_mode` +
    `operating_mode_synced_at` de los devices registrados (D5: la columna es cache del valor real).
  - `reprovisionCaja(cajaId)` (bloque H) — crea store/POS en la cuenta del **seller activo**
    (reusa el camino de `createStore`/`createPos`, idempotentes por `external_id`) y hace **UPDATE
    de la fila existente** de `mercadopago_cajas` (`store_id`, `pos_id_mp`, `qr_image`,
    `qr_template`, `seller_user_id`): mismo UUID ⟹ los vínculos históricos de devices sobreviven
    (con la fila reemplazada, el trigger de inmutabilidad y la FK los dejarían colgados). El QR
    cambia — el aviso previo es del front.
  - `getCajas()`/`listCajas()` deriva **`isOrphan: caja.sellerUserId !== sellerActivo.userId`**
    (R22, sin columna) y el merge `devices.find(d => d.cajaId === c.id)` pasa a filtrar `isActive`.
  - `getStoreStatus()` devuelve el **nombre real** de MP (ya lo tiene: `stores/search` trae `name` —
    muere el literal `"Bosko"` de L109) + `renameStore(name)`: rama A = `PUT
    /users/{userId}/stores/{storeId}` con `{ name }` y re-fetch; rama B (si el PUT no lo acepta) =
    alias local en `mercadopago_cajas.store_name`, y la respuesta lleva **los dos** nombres para que
    la pantalla no mienta (criterio E).
  - Los **3 puntos de rotura** del esquema nuevo se arreglan acá mismo: `assignDevice(null)` →
    `deactivate`; re-vinculación a otra caja → error claro **antes** del trigger; el DELETE de caja
    con históricos queda bloqueado por FK — coherente con el invariante, se documenta el mensaje.
- `mercadopago-provisioning.controller.ts` — rutas nuevas, todas admin:
  `GET /provisioning/mp-devices`, `PATCH /provisioning/device/:id/operating-mode`,
  `POST /provisioning/device/:id/activate` (reactivar histórico / swap — decisión 1),
  `POST /provisioning/pos/:id/reprovision`, `PUT /provisioning/store`.
- `mercadopago-cajas-devices.repository.ts` — según el esquema de abajo: tipo con `operatingMode
  "PDV" | "STANDALONE" | null`, `operatingModeSyncedAt`, `isActive`, `linkedAt`, `deactivatedAt`;
  métodos `findActiveByCajaId`, `listByCajaId`, `assignCaja`, `activate`, `deactivate`; **se
  eliminan** `findByCajaId` (con >1 fila por caja, `maybeSingle` revienta), `clearCajaId` y
  `deleteByCajaId`; `update` pierde `cajaId`. El swap es `deactivate(viejo) → activate(nuevo)`;
  la carrera la banca el índice único parcial.
- `mercadopago-cajas.repository.ts` — `updateProvisioning(cajaId, patch)` para el re-provisioning
  (+ `storeName` si rama B).
- `system.service.ts` — el bloque `posnet` de `getStatus()` deja de mirar `env.MP_POS_DEVICE_ID`
  y se apoya en el resolver (mismo dato que ve la caja).
- `app.ts` — DI de `PosnetResolverService` y `MpHealthService`; `PointPaymentsService` suma la dep.

**Frontend (`apps/web/src/`)** — asume el cableado del **PR 6** hecho (ver "Pasos", paso 7):

- `services/pdv.service.ts` — `DeviceRow` suma `isActive`, `linkedAt`, `deactivatedAt`,
  `operatingModeSyncedAt`; métodos `listMpDevices()`, `setDeviceMode()`, `activateDevice()`,
  `reprovisionCaja()`, `renameStore()`. `CajaRow` suma `isOrphan` y `storeName`.
- `services/mercadopago.service.ts` — `getMpHealth(refresh?)`.
- `components/settings/PdvSection.tsx` (+ `PdvTable`, `PdvFormPanel`) — **lista única** de posnets
  de la caja con estado activo/histórico y botón **Reactivar** (decisión 1: sin pantalla aparte);
  alta **eligiendo de la lista de MP** (muere el prefijo `PAX_A910__SMARTPOS` de
  `PagosSection.tsx:174/527` — el id ya no se construye nunca en el front); botón "Poner en modo
  PDV" por fila; **pantalla guía** cuando `listMpDevices` viene vacío (decisión 2: con
  `token.source`/`token.userId` vs `sellerUserId` distingue *"todavía no reclamaste el lector en tu
  cuenta de MP — se hace desde la app de Mercado Pago"* de *"el token activo es de otra
  aplicación/cuenta"* — nunca parece un error del sistema); **modal de confirmación** previo al
  re-provisioning con el aviso de que el QR cambia y hay que reimprimir (bloque H); badge
  "huérfana" en cajas con `isOrphan`; test por fila con `deviceId` (`testDeviceChargeFor` ya existe
  en el service, L122) y **`testResult` renderizado** (hoy se setea y no se muestra); rename de
  sucursal con la semántica de la rama que quede (nombre en MP, o alias + nombre real).
- `hooks/usePosnetStatus.ts` — pasa a consumir `GET /api/mercadopago/health` (mismo polling de
  30 s): el cartel de `/caja` habla del **device de la caja** y distingue advertencia (STANDALONE,
  huérfana, env) de bloqueo (grave).
- `hooks/useCheckout.ts` — mensajes para los dos 409 nuevos del cobro ("sin Posnet vinculado" /
  caso grave), distinguibles del rechazo de tarjeta que ya maneja cobro-verificado.
- `AdminClient.tsx` — el panel de salud entra en la tab de PDV (cableada por el PR 6).

**Docs (bloque I, mismo entregable)**: `docs/ROADMAP.md` (R23/R25 cerrados, R24 con su fila de
panel, la sección de la feature apunta a esta spec), `docs/ARCHITECTURE.md` (resolución
caja→device, rol degradado de la env), `.env.example` (`MP_POS_DEVICE_ID` último recurso;
`MP_ACCESS_TOKEN` fallback de emergencia con la condición de cuenta de R24).

### Cambios de datos

**M1 — `supabase/migrations/20260724000000_gestion_posnets.sql`** (diseño hecho con
`supabase-expert`, se adopta como está), sobre `mercadopago_cajas_devices`:

- Columnas: `is_active BOOLEAN NOT NULL DEFAULT false`, `linked_at TIMESTAMPTZ`,
  `deactivated_at TIMESTAMPTZ`, `operating_mode_synced_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ`
  (no existía en local — **verificar si existe en Cloud** antes de asumir el DDL de allá).
- Backfill: toda fila con `caja_id NOT NULL` → `is_active = true, linked_at = now()`.
- `operating_mode`: **DROP DEFAULT `'PDV'`** + `CHECK (operating_mode IN ('PDV','STANDALONE') OR
  operating_mode IS NULL)` — D5: NULL honesto > default optimista. Cierra R25 a nivel esquema.
- `CHECK (NOT is_active OR caja_id IS NOT NULL)` — un activo sin caja es incoherente.
- DROP `uq_device_caja_linked` → **`uq_device_caja_active ON (caja_id) WHERE is_active`** (a lo
  sumo un activo por caja, y la carrera del swap la resuelve la base, no el código) + índice
  `idx_mp_devices_caja`.
- **Trigger `caja_id` inmutable** una vez seteado (NULL→valor permitido, valor→otro valor
  rechazado): la decisión "el posnet pertenece a su caja para siempre" queda como invariante de
  base, no como buena voluntad del service.
- **Trigger BEFORE DELETE** que prohíbe borrar un device con cobros en `mp_orders`
  (`device_id` es TEXT sin FK — el trigger es el sustituto honesto de esa FK imposible).
- Sin GRANT nuevos: la tabla ya tiene su `GRANT service_role` / `REVOKE anon, authenticated`.

**Adición de este plan a la misma migración**: `mercadopago_cajas.store_name TEXT NULL` — cache
del nombre real de MP (rama A: se refresca en cada `getStoreStatus`) o alias local (rama B). Una
sola columna sirve a las dos ramas; si la rama A se confirma, es solo cache y puede quedar NULL
sin costo.

**Tipos**: viven en el módulo (`mercadopago-cajas-devices.repository.ts`,
`mercadopago-cajas.repository.ts`) y en los services del front — **`packages/shared/src/domain.ts`
no se toca** (los tipos MP nunca vivieron ahí; el único contacto es `PaymentProof`, que no cambia).

**Sync / offline**: **cero impacto en este plan.** Las tablas MP no participan de
`cloud-sync.repository.ts` (las suma el PR 5 de la remediación; sus `pushMpDevices()` deberán
incluir las columnas nuevas — queda anotado en el checklist del PR 5, no acá). El cobro sigue
100 % local-first: el resolver lee la base local, y la salud degrada a `unknown` sin internet —
nunca bloquea por no poder chequear.

### Real-time

**No se agrega ningún evento SSE.** Se evaluó `mp.device.updated` / `mp.health.changed` y se
descartó por tres razones: (1) los cambios de estado relevantes ocurren **fuera del proceso**
(alguien toca el aparato, la app de MP, la cuenta) — un evento local solo cubriría los cambios
hechos desde `/admin`, la mitad que menos importa; (2) `usePosnetStatus` **ya pollea cada 30 s** y
esa latencia es correcta para un cartel de advertencia; (3) el único caso donde la frescura importa
de verdad —el bloqueo grave— **no depende de la UI**: se aplica server-side en el resolver en cada
cobro. El polling pasa a pegarle a `GET /api/mercadopago/health`, que está cacheado 30 s
server-side: mismo costo que hoy.

### Auth / permisos

Sin roles nuevos y sin cambios en permisos de usuario.

- **Cobro** (`POST /pos/intent`, `/device/test-charge`, `GET /device/status`): igual que hoy —
  `authMiddleware` + `requireRole("admin", "caja")` + `mpContextMiddleware`. Lo que cambia es la
  autoridad: `x-bar-id` sigue validado contra la instalación (A12) y **`x-device-id` deja de tener
  efecto** — el device lo decide el servidor (A5). Un cliente no puede apuntar el cobro a otro
  aparato ni con headers forjados.
- **`GET /api/mercadopago/health`**: `admin` + `caja` (la cajera necesita el cartel), con
  `Cache-Control: no-store`.
- **Rutas nuevas de provisioning** (`mp-devices`, `operating-mode`, `activate`, `reprovision`,
  `PUT /store`): `adminOnly`, como todos sus vecinos del controller.
- **Bloqueo del caso grave** (decisión del dueño): el único fail-closed nuevo es
  `deviceOwnership.ok === false` → 409 en el resolver. STANDALONE, caja huérfana y env-fallback
  **solo advierten** (cartel en `/caja` y `/admin`); esos casos fallan solos contra MP y el valor
  está en el mensaje, no en el freno.

### Riesgos

- **Alto — backfill sobre datos que hoy son mentira.** `is_active = true` para toda fila con
  `caja_id` asume que lo vinculado en la base es lo que debe cobrar — y esta spec existe porque la
  base y la realidad divergen (local: tabla **vacía** mientras el cobro sale por la env). Tras
  migrar, una instalación puede quedar con **cero devices activos** y el cobro pasa de "funciona
  por la env" a 409 si la caja está provisionada. Mitigación: la regla del resolver (env solo
  cuando **no hay caja**) cubre la instalación legacy… pero acá la caja SÍ existe
  (`mercadopago_cajas` tiene la fila de Barra VIP) — el paso 3 incluye vincular el lector real y
  verificar en el entorno real que el estado post-migración cobra, **antes** de tocar el front.
- **Alto — tests que van a caer en masa.** `mercadopago.service.test.ts` (todo lo que dependa del
  fallback a env en `createPaymentIntent`/`checkDeviceConnection`),
  `point-payments.service.test.ts` (constructor y `CreatePointIntentInput`),
  `mercadopago-provisioning.service.test.ts` (los 3 puntos de rotura + merges por `isActive`),
  `mp-context.middleware.test.ts` (deviceId deprecado), `usePosnetStatus` y `useCheckout` en web,
  más los 6 tests skipeados de `PagosSection.test.tsx:127-228` que migran a `PdvSection.test.tsx`
  (PR 6). Es esperado y sano: los tests describían el sistema viejo.
- **Medio — el PATCH de operating_mode con el lector en uso.** Cambiar el modo mientras hay un
  intent colgado en el device puede dejarlo en un estado raro; el botón PDV debe pasar por el
  mismo camino de higiene que el auto-recovery del 2205 (cancelar intents colgados antes de
  patchear) o al menos advertirlo. Verificar contra el aparato físico en el paso 4.
- **Medio — `GET /devices` como única fuente** (anexo #14: no hay GET por id). Todo `deviceSeen`,
  `deviceOwnership` y el re-sync dependen de un listado paginado `limit=50`. Con >50 devices se
  necesitaría paginar — hoy imposible en este boliche, pero el fetch queda encapsulado en un solo
  método para que el día que haga falta sea un cambio local.
- **Medio — doble fuente transitoria del bloque `posnet` de `/api/system/status`.** Si se olvida
  re-apoyar `SystemService.getStatus()` en el resolver, `/admin` Sistema y la salud MP pueden
  contradecirse — exactamente la clase de mentira que esta spec vino a matar. Está como paso
  explícito (paso 6).
- **Medio — la rama B del nombre de sucursal** (PUT sin `name`): la UI debe mostrar alias **y**
  nombre real de MP para cumplir "la pantalla no miente". Es más fea; por eso el supuesto se
  valida en el paso 1 y no a mitad de la UI.
- **Bajo — el trigger de inmutabilidad vs. datos sucios preexistentes.** Si algún entorno tiene un
  device apuntando a una caja equivocada, después de M1 no se corrige con UPDATE: hay que
  desactivar y dar de alta el vínculo correcto. Documentar el procedimiento en el mensaje de error.
- **Deuda que este plan NO paga**: el sync de tablas MP (PR 5) y la mudanza estética completa de
  la pantalla (PR 6) — referenciados, no duplicados.

### Alternativas consideradas

- **Resolver el device en `mp-context.middleware.ts`** (completar `mpContext.deviceId` server-side)
  — descartado: mezcla fail-open (cache de barId) con fail-closed (409 de cobro) en un archivo,
  paga un lookup a DB en rutas que no cobran, y la guarda grave necesita dependencias de service.
  El middleware valida identidad; la política de cobro vive con la política (mismo criterio que
  puso el veredicto en `PointPaymentsService` y no en el gateway).
- **Extender `GET /api/system/health` con los 4 chequeos** — descartado: `getHealth()` es sync y
  sin fetchs por contrato, y los chequeos hablan con MP. Además acoplaría `SystemService` a tres
  repos del módulo MP. Endpoint propio del módulo, cache TTL propio.
- **Columna `is_orphan` en `mercadopago_cajas`** — descartado: es un derivado puro
  (`caja.sellerUserId !== sellerActivo.userId`) y persistirlo crea el problema de mantenerlo
  fresco al vincular/desvincular sellers. Se computa en el service en cada listado (R22).
- **Borrar el device viejo al hacer swap** (en vez de histórico) — descartado por la spec misma
  (D1): pierde la trazabilidad de cobros históricos; y ahora además lo impide el trigger de DELETE.
- **Un lector rotando entre cajas** — descartado por decisión del dueño (2026-07-22): invariante
  rígido, comprado con el trigger de inmutabilidad. Si el boliche real lo necesita algún día, se
  reformula entonces.
- **Bloquear el cobro con cualquier chequeo en rojo** — descartado por decisión del dueño: solo
  el caso grave (plata a otra cuenta). Un STANDALONE falla solo y con mensaje; un bloqueo
  preventivo con falso positivo deja la caja parada, que es el mal mayor.
- **Evento SSE `mp.health.changed`** — descartado (ver Real-time): cubriría solo cambios locales,
  el polling de 30 s ya existe, y el caso crítico se resuelve server-side en el cobro.
- **Eliminar `MP_POS_DEVICE_ID` de una vez** — descartado (D2): es el único camino probado en vivo
  y el colchón de la instalación legacy post-migración. Se degrada a último recurso observable.
- **Tabla `mercadopago_stores` para el nombre** — descartado: hay un solo store por seller
  (`EXTERNAL_STORE_ID` fijo) y el resto de sus datos ya se leen de MP; una columna cache en
  `mercadopago_cajas` alcanza y no agrega un repo entero.

### Pasos de implementación

Cada paso deja el sistema consistente, con typecheck y tests en verde, y tiene su verificación.

1. **Validar el supuesto del nombre de sucursal** (sin código): `PUT
   /users/{userId}/stores/{storeId}` con `{ "name": "..." }` y el token del seller activo, contra
   el store real `85068168`. **Verificación**: la respuesta del PUT + `GET /stores/search` — si el
   `name` cambió, rama A (el nombre viaja a MP); si no, rama B (alias local + nombre real visible).
   Registrar el resultado en el changelog de la spec: decide la semántica del paso 5 y de la UI.
2. **M1 + repositorio de devices + provisioning que no rompe.** La migración
   `20260724000000_gestion_posnets.sql` (incluida `store_name` en cajas), el repo con
   `findActiveByCajaId`/`listByCajaId`/`assignCaja`/`activate`/`deactivate` (y los tres métodos
   eliminados), y el refactor de los 3 puntos de rotura de `mercadopago-provisioning.service.ts`
   en el mismo PR. **Verificación**: migración aplicada dos veces contra la base local
   (idempotente, runner `ok`, drift 0); el backfill deja la fila esperada; INSERT de segundo
   activo por caja → `23505`; UPDATE de `caja_id` seteado → rechazado por el trigger; tests de
   repo y provisioning en verde.
3. **Bloque A — el resolver y el cobro.** `posnet-resolver.service.ts` (con la guarda grave en
   modo stub `unknown` hasta el paso 6), gateway sin `|| env.MP_POS_DEVICE_ID`,
   `PointPaymentsService` resolviendo por `barId` y persistiendo `device_id`/`caja_id` resueltos,
   controller ignorando `x-device-id`, DI en `app.ts`. **Verificación**: unit — caja con activo →
   intent contra ese device; caja sin activo → 409 con el mensaje del criterio A; sin caja → env
   con `logger.warn`; `x-device-id` forjado → sin efecto. Y en el entorno real: vincular el
   `PAX_A910__SMARTPOS1493600985` a la caja "Barra VIP" y **cobrar $15 sin que exista
   `MP_POS_DEVICE_ID` en el proceso** — es el criterio de éxito número 1 de la spec.
4. **Bloques B + C — descubrir, dar de alta y poner en PDV.** `listMpDevices()` +
   `GET /provisioning/mp-devices` (con el contexto de token para la pantalla guía),
   alta desde la lista (el front nunca más construye un id), `setDeviceOperatingMode` +
   `PATCH /provisioning/device/:id/operating-mode`, re-sync de `operating_mode` +
   `operating_mode_synced_at` en cada listado. **Verificación**: unit con fakes; contra la API
   real — el listado devuelve el lector con su modo, el PATCH a PDV (idempotente si ya está)
   responde el modo nuevo, y tras cambiar el modo desde la app de MP un refresh de la pantalla
   actualiza la columna (criterio C3).
5. **Bloque E — identidad de la sucursal.** `getStoreStatus()` con el nombre real (muere
   `"Bosko"` L109), `renameStore` según la rama del paso 1, `PUT /provisioning/store`, cache en
   `store_name`. **Verificación**: unit + contra la API real — la card muestra
   `GARCIAMANUEL20231019090947` (o el nombre nuevo tras renombrar); en rama B, la respuesta lleva
   alias y nombre MP y ninguno de los dos es un literal.
6. **Bloque G — salud y bloqueo del caso grave.** `mp-health.service.ts` con los 4 chequeos +
   fila F1 (`getMpFallbackStatus()`) + `usingEnvDevice`, `GET /api/mercadopago/health`, la guarda
   grave real cableada al resolver, y `SystemService.getStatus().posnet` re-apoyado en el resolver.
   **Verificación**: unit por chequeo (verde/rojo/unknown, cada rojo con `action`); simulación del
   caso grave (device activo de la caja ausente del listado con credenciales activas) → el cobro
   devuelve 409 y la salud `blocking: true`; con MP inalcanzable → todo `unknown` y el cobro **no**
   se bloquea. Criterio de éxito D4: el escenario del 21-07 (otra cuenta + STANDALONE) queda en
   rojo evidente sin una sola consulta manual.
7. **Cableado del PR 6** (gate de UI — checklist en `remediacion-integracion-mp.md`, sección
   "PR 6", que **no se duplica acá**): `PdvSection` como tab propio de `AdminClient`, mudanza de
   las Cards 2 y 3 de `PagosSection`, eliminación del UUID por pestaña de
   `bar-sessions.service.ts` (el fin de `x-device-id`), migración de los 6 tests skipeados.
   Si los dos trabajos van en la misma rama, este paso va **antes** que el 8; si el PR 6 ya se
   mergeó, este paso es no-op. **Verificación**: la del propio checklist del PR 6.
8. **UI de gestión (bloques B/C/D/E/F/H en pantalla).** Sobre `PdvSection`: lista única
   activo/histórico con Reactivar (swap vía `activate`), alta desde la lista de MP, botón PDV,
   pantalla guía del listado vacío (decisión 2), badge huérfana + modal de re-provisioning con el
   aviso de QR **previo** a ejecutar, rename de sucursal, test por fila con `testDeviceChargeFor`
   y `testResult` renderizado, `catch {}` reemplazados por error visible; `usePosnetStatus` →
   `getMpHealth` (cartel por el device de la caja, advertencia vs. bloqueo); `useCheckout` con los
   dos 409 distinguibles. **Verificación**: tests de `PdvSection`/`PdvTable`/`PdvFormPanel` (hoy
   cero) + los 6 migrados en verde; recorrido manual: alta desde lista → PDV → vincular → cobrar,
   sin escribir un solo id a mano.
9. **Docs (bloque I)**: ROADMAP (R23/R25 cerrados, R24 actualizado, la feature apunta a la spec),
   ARCHITECTURE (resolución caja→device, env degradada), `.env.example`. **Verificación**: los
   criterios I son literales — se chequean leyendo los tres archivos.
10. **Gate físico (bloqueante, como el de cobro-verificado)**: con el aparato real —
    (a) cobro por el device vinculado **sin** `MP_POS_DEVICE_ID` en el `.env` y sin reiniciar tras
    vincular; (b) swap a un segundo vínculo (o desactivar/reactivar) y cobrar de nuevo **sin
    reinicio**, comparando el QR de la caja antes y después (byte a byte: no cambia — criterio D2);
    (c) caja sin device activo → la cajera lee "esta caja no tiene Posnet vinculado";
    (d) panel de salud en verde en el estado final. **Verificación**: es el gate — sin esto la
    spec no pasa a `implementada`.

Al terminar los pasos: `/tasks gestion-posnets` (los pasos 1-10 son la fuente del checklist).

---

## Tareas

> Derivadas del plan técnico (2026-07-23). Orden = dependencia. Tildar `- [x]` al completar.
> Los pasos 1-10 del plan son la fuente; acá cada uno baja a tareas chicas y verificables.

### Validación previa (paso 1 del plan)

- [x] **T1** — **RAMA A confirmada** (2026-07-23, corrido por Manuel contra el store real `85068168`): `PUT /users/{userId}/stores/{storeId}` con `{ name }` → 200, el rename **se aplica** (verificado con re-GET) y el PUT **no es replace** (`external_id`/`location` intactos); renombrado a "Prueba Cocktrail T1" y revertido OK. El nombre de sucursal **viaja a MP**. T15 ya implementa esta rama (la degradación a alias queda como resguardo); la UI (T22) asume nombre en MP.

### Migración y datos (paso 2)

- [x] **T2** · `supabase-expert` — Escribir `supabase/migrations/20260724000000_gestion_posnets.sql`: columnas (`is_active`, `linked_at`, `deactivated_at`, `operating_mode_synced_at`, `created_at`), backfill, DROP DEFAULT + CHECKs de `operating_mode` y `is_active⇒caja_id`, swap de índices (`uq_device_caja_active`, `idx_mp_devices_caja`), trigger de `caja_id` inmutable, trigger BEFORE DELETE con cobros, y `mercadopago_cajas.store_name`.
- [x] **T3** — Aplicar la migración dos veces contra la base local: idempotente, runner `ok`, drift 0; probar a mano los invariantes (2º activo por caja → `23505`; UPDATE de `caja_id` seteado → rechazado; DELETE con cobros → rechazado).
- [x] **T4** — Refactor `mercadopago-cajas-devices.repository.ts`: tipo nuevo (`isActive`, `linkedAt`, `deactivatedAt`, `operatingModeSyncedAt`, `operatingMode` tipado); métodos `findActiveByCajaId`, `listByCajaId`, `assignCaja`, `activate`, `deactivate`; eliminar `findByCajaId`, `clearCajaId`, `deleteByCajaId`; `update` sin `cajaId`. Tests del repo.
- [x] **T5** — `mercadopago-cajas.repository.ts`: `updateProvisioning(cajaId, patch)` (+ `storeName`). Tests.
- [x] **T6** — `mercadopago-provisioning.service.ts`: arreglar los 3 puntos de rotura (`assignDevice(null)` → `deactivate`; re-vinculación a otra caja → error claro antes del trigger; DELETE de caja con históricos → mensaje documentado) y filtrar `isActive` en los merges. Tests en verde.

### Backend — bloque A: el cobro resuelve desde la caja (paso 3)

- [x] **T7** — `posnet-resolver.service.ts` nuevo: cadena `barId → caja → device activo`, 409 "esta caja no tiene Posnet vinculado", env como último recurso con `logger.warn` + flag, guarda grave en stub `unknown`. Tests unit de las 4 reglas.
- [x] **T8** — `mercadopago.service.ts`: eliminar `|| env.MP_POS_DEVICE_ID` de los 4 puntos; `checkDeviceConnection(deviceId: string)` y `testDeviceReachability(deviceId: string)` exigen el parámetro. Ajustar tests (van a caer en masa — esperado).
- [x] **T9** — `point-payments.service.ts`: `CreatePointIntentInput` pierde `deviceId`, gana `barId?`; dep `resolvePosnet`; persistir `device_id`/`caja_id` resueltos en `mp_orders`. Tests.
- [x] **T10** — `mercadopago.controller.ts`: `POST /pos/intent` pasa `mpContext.barId` (ignora `x-device-id`); `POST /device/test-charge` con `deviceId` opcional en body; `GET /device/status` vía resolver. DI de todo en `app.ts`. Tests de controller/middleware.
- [x] **T11** · **con el Posnet físico** — **PASADO el 2026-07-23 11:15**: lector vinculado a "Barra VIP" desde `/admin`, `MP_POS_DEVICE_ID` comentada, cobro de **$2.800 aprobado** (`processed/accredited`) por el device resuelto desde la caja (`mp_orders.device_id` + `caja_id` poblados), pedido registrado `cobrado` con `mp_order_id`. Nota: los intentos previos de $15 rechazaban por anti-fraude del emisor (monto chico idéntico repetido — `cc_rejected_other_reason`), no por el sistema. Criterio de éxito nº 1 de la spec cumplido.

### Backend — bloques B + C: descubrir, alta y PDV (paso 4)

- [x] **T12** — `listMpDevices()` en provisioning service + `GET /provisioning/mp-devices` (lista cruda + `registeredLocally` + contexto `{token.source, token.userId, sellerUserId}` para la pantalla guía). Tests con fakes.
- [x] **T13** — `setDeviceOperatingMode(deviceId, mode)` + `PATCH /provisioning/device/:id/operating-mode`; re-sync de `operating_mode` + `operating_mode_synced_at` en cada `listMpDevices()`/listado de cajas. Tests.
- [x] **T14** · `mercadopago-integrator` — Verificación contra la API real: el listado trae el lector con su modo; el PATCH a PDV responde el modo nuevo (idempotente si ya está); cambiar el modo desde la app de MP + refresh actualiza la columna (criterio C3). Cuidado con intents colgados antes del PATCH (riesgo del plan).

### Backend — bloque E: identidad de la sucursal (paso 5)

- [x] **T15** — `getStoreStatus()` con el nombre real de MP (muere `"Bosko"` L109); `renameStore(name)` según la rama de T1; `PUT /provisioning/store`; cache en `store_name`. Tests + verificación contra la API real.

### Backend — bloque G: salud y bloqueo del caso grave (paso 6)

- [x] **T16** — `mp-health.service.ts` nuevo: 4 chequeos (`singleSeller`, `deviceOwnership`, `deviceMode`, `cajaProvisioned` derivado) + fila F1 (`getMpFallbackStatus()`) + `usingEnvDevice` + `blocking`; cache TTL 30 s + `?refresh=1`; cada rojo con `action`. `GET /api/mercadopago/health` (admin+caja, `no-store`). Tests por chequeo (verde/rojo/unknown).
- [x] **T17** — Cablear la guarda grave real al resolver (reemplaza el stub de T7): caso grave → 409 en el cobro + `blocking: true`; MP inalcanzable → `unknown` y **no** bloquea. Tests de ambos caminos.
- [x] **T18** — `system.service.ts`: `getStatus().posnet` re-apoyado en el resolver (fuera `env.MP_POS_DEVICE_ID`). Tests.

### PR 6 de la remediación (paso 7 — gate de UI)

- [x] **T19** *(código+tests; docs del PR 6 → T26)* — Ejecutar el checklist del PR 6 (`remediacion-integracion-mp.md` §PR 6, **no se duplica acá**): `PdvSection` como tab propio de `AdminClient`, mudanza de Cards 2 y 3, fin del UUID por pestaña en `bar-sessions.service.ts` (muere `x-device-id`), migración de los 6 tests skipeados. Va **antes** que T20-T25.

### Frontend (paso 8)

- [x] **T20** — `services/pdv.service.ts` (+`mercadopago.service.ts`): tipos (`isActive`, `linkedAt`, `deactivatedAt`, `operatingModeSyncedAt`, `isOrphan`, `storeName`) y métodos `listMpDevices`, `setDeviceMode`, `activateDevice`, `reprovisionCaja`, `renameStore`, `getMpHealth`. Tests de service.
- [x] **T21** · `expert-react-frontend-engineer` — `PdvSection`/`PdvTable`: lista única activo/histórico con **Reactivar**, alta eligiendo de la lista de MP (muere `PAX_A910__SMARTPOS` de `PagosSection.tsx:174/527`), botón "Poner en modo PDV" por fila, pantalla guía del listado vacío (decisión 2).
- [x] **T22** · `expert-react-frontend-engineer` — Badge "huérfana", modal de re-provisioning con aviso **previo** de cambio de QR, rename de sucursal (semántica de la rama de T1), panel de salud (4 chequeos + F1) en la tab de PDV.
- [x] **T23** — Test por fila con `testDeviceChargeFor(deviceId)`, `testResult` renderizado, `catch {}` reemplazados por error visible.
- [x] **T24** — `usePosnetStatus` → `getMpHealth` (cartel por el device de la caja; advertencia vs bloqueo); `useCheckout`: mensajes para los dos 409 nuevos, distinguibles del rechazo de tarjeta. Además, para `cc_rejected_other_reason` el mensaje de la caja agrega la pista: *"Si la tarjeta es del titular de la cuenta de Mercado Pago del local, MP la rechaza siempre (no se puede pagar a uno mismo) — cobrale por otro medio"* (descubierto en vivo el 23-07: el dueño pagándose con su propia tarjeta da este código genérico). Tests de hooks.
- [x] **T25** — Tests de `PdvSection`/`PdvTable`/`PdvFormPanel` (hoy cero) + los 6 migrados en verde.

### Docs y verificación final (pasos 9-10)

> ⏳ **T14, T28 y T29 quedan pendientes**: son verificaciones que requieren la **app corriendo** +
> el **Posnet físico**, y las ejecuta el dueño del proyecto. No bloquean el cierre del código —
> la feature está "código completo, pendiente gate físico". T26 y T27 ya están hechas.

- [x] **T26** — `docs/ROADMAP.md` (R23/R25 cerrados, R24 actualizado, la feature apunta a esta spec), `docs/ARCHITECTURE.md` (resolución caja→device, env degradada, endpoint de salud), `.env.example` (`MP_POS_DEVICE_ID` último recurso, `MP_ACCESS_TOKEN` con la condición de cuenta de R24). Runbook operativo del Posnet (visto en vivo el 23-07): conectar el Point al **WiFi del local** (en 3G se cuelga en "Procesando el cobro"); si queda >1 min procesando → volver/reiniciar el aparato — el sistema no queda inconsistente (veredicto ya persistido + auto-cancelación de intents colgados); el aparato no se puede destrabar por API.
- [x] **T27** — `pnpm typecheck` y `pnpm test` en verde (api + web) — verificado (814 tests api, 466 web).
- [x] **T28** · `e2e-playwright-tester` — Recorrido E2E: alta desde lista → PDV → vincular → cobrar sin escribir un id a mano; carta/caja/admin + cartel de salud en /caja.
- [x] **T29** · **con el Posnet físico — GATE BLOQUEANTE** — (a) cobro por el device vinculado sin `MP_POS_DEVICE_ID` y sin reiniciar; (b) swap/reactivación y cobrar de nuevo sin reinicio, QR byte a byte idéntico; (c) caja sin device → mensaje claro a la cajera; (d) panel de salud en verde. Con esto la spec pasa a `implementada`.

> Implementar con **Plan Mode** los tramos grandes (T4-T10 backend, T19-T25 frontend) e ir
> tildando `- [x]` a medida que se completa. T11, T14 y T29 requieren el aparato físico.
