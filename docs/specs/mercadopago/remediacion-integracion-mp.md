# Remediación de la integración Mercado Pago + bar-sessions

**Estado**: `implementada` (2026-07-24) — **los 6 PRs hechos y gateados**: PR 1-4 (`ba7c113`, `2745f7c`, `e3f1a29`, `db1e31d` + `00e6ac6`), PR 6 vía `gestion-posnets` (2026-07-23, T19 = `09237a4` backend + `a5f9542` frontend, T26 = docs) y **PR 5 cerrado el 2026-07-24** (`93b0e8e` + `62619b8` + `f27a0c0`, gate físico pasado — ver el changelog). **Único resto vivo**: la migración diferida del `DROP COLUMN` de los tokens en claro (sección Cierre). Ver "Estado actual (2026-07-24)" abajo. Decisiones cerradas el 2026-07-20; enriquecida con hallazgos de verificación en vivo (A1b, A17, A18), con la verificación contra la API real de MP del 2026-07-22 (titularidad del lector destrabada, lector en PDV, y **R24 refutado** en la segunda pasada del mismo día → estrategia **F1** del PR 4) y bugs de infraestructura ya corregidos.
**Fecha**: 2026-07-20
**Origen**: auditoría del merge `e95404a..8b559b2` (5 commits de Genkaix1000, 2026-07-17, +13.934/−4.066 en 162 archivos)

---

## Estado actual (2026-07-24)

| PR | Estado |
|---|---|
| 1 — Suite en verde + comentarios falsos | ✅ `ba7c113` |
| 2 — Runner de migraciones | ✅ `2745f7c` |
| 3 — Integridad del cobro (bloque A) | ✅ `e3f1a29` — **gate físico pasado el 2026-07-22** (cobro real aprobado con el Posnet en PDV, ticket impreso) |
| 4 — Inversión del token + single-seller + seguridad | ✅ `db1e31d` + `00e6ac6` (2026-07-22) — código completo (backend + Edge Function + UI + 3 migraciones `20260723000000..000200`), EF deployada, runbook operativo ejecutado (`pr4-cloud.sql`: tokens purgados de Cloud, sellers viejos expirados, índice único), re-vinculación OAuth exitosa con el flujo nuevo, y **gate físico pasado en sus dos modos** (Cloud cortado + solo `MP_ACCESS_TOKEN`) |
| 5 — Sync / conciliación | ✅ `93b0e8e` (backend: push MP + restore extendido) + `62619b8` (frontend: filas MP del restore + aviso D3) + `f27a0c0` (`pr5-cloud.sql` convergente) — **gate pasado el 2026-07-24**: cobro real de $101 → cierre de noche → push verificado en Cloud → restore desde `/admin` |
| 6 — Sesiones de caja + PDVs + docs | ✅ vía `gestion-posnets` (2026-07-23) — T19 (`09237a4` + `a5f9542`): identidad D6 + tab «PDV y Posnets»; T26 (`6f7b078` + `68ed32f`): docs |

- **Criterios cumplidos**: los bloques A, B, C, E y F completos (A6 quedó cerrado por construcción con D1 en el PR 4; **C cerrado por el PR 5**, gate del 2026-07-24); D y H quedaron cerrados vía `gestion-posnets` (PR 6, 2026-07-23) y G casi completo (resto menor achicado en `62619b8`: la fila del Posnet ya muestra el `storeName` real, quedan literales «Barra VIP» de copy en `PdvSection.tsx`).
- **Entorno (post-PR 4, verificado el 2026-07-22)**: en Cloud queda **un único seller activo** (la cuenta de prueba de Manuel, `1517393956`) y **solo metadata** — los tokens en claro se purgaron con `pr4-cloud.sql` y los dos sellers preexistentes se expiraron; el índice único de single-seller está creado (verificado por REST). En **local** el seller quedó re-vinculado por OAuth con el flujo nuevo: token **cifrado** con prefijo `v1.`, columnas en claro `NULL`, buzón de handoff consumido. **La cuenta del dueño del boliche sigue sin vincularse** (las pruebas corren con la de Manuel — ver el procedimiento de migración en el roadmap).
- **✅ Titularidad del lector — DESTRABADA el 2026-07-22.** Desde la app de MP, operando como colaborador dentro de la cuenta de Matías (`225043369`), se usó **"Eliminar el lector de mi cuenta"** sobre `PAX_A910__SMARTPOS1493600985`. Verificado por API (`GET /point/integration-api/devices`): la cuenta de Matías pasó de `total: 2` a `total: 1` (le queda `PAX_A910__SMARTPOS1494025317`, store `83923406`, POS `134012614`, `STANDALONE`) y la de Manuel (`1517393956`) pasó de `total: 0` a `total: 1`, con `PAX_A910__SMARTPOS1493600985`, `pos_id: 0`, `store_id: ""`, `operating_mode: STANDALONE`. Es decir: **esa opción, desde un contexto de colaborador, transfiere el lector a la cuenta personal del colaborador** — no lo deja huérfano, y **no** lo pone en PDV (eso es un paso aparte). El gate del PR 3 **ya no depende de un tercero**.
- **✅ `MP_POS_DEVICE_ID` ya está corregido** (verificado el 2026-07-22 en la segunda pasada): vale `PAX_A910__SMARTPOS1493600985`, el lector que ahora es de Manuel. Antes apuntaba a `…1494025317`, el que quedó en la cuenta de Matías.
- **✅ El lector ya está en modo PDV y provisionado.** `GET /point/integration-api/devices` devuelve `PAX_A910__SMARTPOS1493600985` con `operating_mode: "PDV"`, `store_id: "85068168"` (external `COCKTRAILSUC001`), `pos_id: 135641665`, `external_pos_id: "COCKTRAILBAR01"`. El store y el POS se crearon el 2026-07-22 ~02:07 ART. Los pasos manuales que el gate del PR 3 tenía pendientes (pasar a PDV + asignar store/POS + corregir la env) **ya están hechos**.
- **🟢 Corrección del hallazgo del 22-07 — la visibilidad de los devices Point NO es por aplicación (R24 refutado como regla general).** La primera observación del 22-07 concluyó que el `MP_ACCESS_TOKEN` del `.env` no veía el lector *porque era de otra aplicación*. **Se volvió a verificar el mismo día, más tarde, y con el mismo token el listado ahora devuelve `total: 1` con el lector.** El token no cambió (sigue teniendo `4126722482739227` embebido como `client_id` y `1517393956` como user, y `MP_APP_ID` sigue siendo `2990738606457276`): lo que cambió es el **estado del device**, que pasó de `STANDALONE / pos_id: 0 / store_id: ""` a `PDV` atado a un store y un POS. Las dos observaciones originales diferían en **dos variables a la vez** (aplicación del token *y* estado del device); controlando la segunda, la diferencia desaparece. La referencia oficial del endpoint dice que devuelve *"un listado de los dispositivos Point disponibles asociados a **tu cuenta** de Mercado Pago"* — por cuenta, sin mencionar la aplicación. **Impacto directo sobre el PR 4**: el nivel 3 del resolver deja de estar condenado de antemano, pero tampoco puede darse por bueno a ciegas — ver la estrategia F1 en las tareas del PR 4 y R24 reformulado en el roadmap.
- **Entorno, otros dos puntos verificados el 2026-07-22**: (a) `MP_WEBHOOK_SECRET` está **vacía**, así que `POST /api/mercadopago/webhooks` responde 401 fail-closed y **todo el trabajo de webhooks durables del PR 3 está inerte acá** — no bloquea el Posnet (polling del payment intent) pero sí el flujo de QR (R26). (b) El stack Docker estaba apagado: los contenedores `cocktrail-db`/`cocktrail-rest`/`cocktrail-kong` no existían (había un `cocktrail-postgres-local` viejo, *Exited* hace 3 semanas); el volumen `cocktrail_cocktrail_db_data` sí existe y la data está intacta. Además **`apps/api/.env` no define `DATABASE_URL`** —la API habla por PostgREST en `:54321`— que es justo la variable que usa el runner de migraciones del PR 2: hay que verificar que el runner tenga cómo conectarse antes de asumir que las migraciones corren en este entorno. *(Superado más tarde el mismo día: el stack se levantó y el runner aplicó las 3 migraciones del PR 4 en este entorno — el runner conecta.)*
- **Punteros**: riesgos R17-R26 en `docs/ROADMAP.md`; deuda diferida en `docs/plans/mercadopago/deuda-remediacion-mp.md`.

---

## Problema / Por qué

El 2026-07-17 entró a `develop` la integración completa de Mercado Pago (Fases 0-6: OAuth, provisioning, cobro por QR estático, webhooks) más una feature de sesiones exclusivas de caja por barra. Es trabajo sustancial y en buena parte bien hecho — PKCE correcto, HMAC timing-safe, la RPC `consume_oauth_state` genuinamente atómica, `mercadopago_sellers` bien cerrada con RLS, exclusividad de cajas garantizada por constraint de DB.

Pero se mergeó sin revisión, y una auditoría en profundidad encontró **12 defectos de severidad alta y ~10 de severidad media**. El problema no es la feature: es que en su estado actual **no se puede poner en producción en el boliche** sin riesgo de cobrar dos veces, perder ventas cobradas, o dejar la caja inoperable.

Hay cuatro dolores distintos, y conviene no confundirlos:

**1. Se podía perder o duplicar plata.** `mp_orders` no tenía ninguna restricción de unicidad, así que un webhook reintentado por Mercado Pago —cosa que MP hace por diseño— insertaba filas de cobro duplicadas. Si el registro del pedido fallaba *después* de que MP confirmó el pago, se cobró la plata y no quedaba pedido: no había retry ni compensación. Un doble click en "Cobrar" generaba dos órdenes reales. Y las llamadas a Mercado Pago no tenían timeout, con lo cual una conexión colgada bloqueaba el cobro sin límite. *(Cerrado en el PR 3.)*

**2. Se rompió la promesa central del producto.** `ARCHITECTURE.md` §2 dice, textual: *"La caja nunca depende de internet"*. Hoy, si están configuradas las variables de cloud, **cada cobro —incluido el del Posnet físico— consulta Supabase Cloud por internet** antes de tocar a Mercado Pago. El Posnet, que antes funcionaba con una variable de entorno local, ahora depende de que un servicio remoto esté vivo. Un corte de Supabase Cloud deja al boliche sin cobrar, aunque MP esté perfecto. Esto no es un bug puntual: es una decisión arquitectónica que se tomó de hecho, sin discutirse ni documentarse.

**3. La conciliación quedó ciega.** Ninguna de las tablas nuevas entró al módulo `sync`. `mp_orders` no se sube al cerrar la noche, así que **todos los cobros de Mercado Pago son invisibles en la nube**. El backup en Cloud —que existe justamente porque ya hubo un incidente real de pérdida de datos— hoy no protege la plata cobrada por MP.

**4. La caja se puede bloquear sola.** El logout no libera la caja: el código pasa un identificador de dispositivo hardcodeado que nunca coincide con el real, y el endpoint de liberación no lo llama nadie. Peor: la identidad del cajero se guarda por pestaña, así que abrir una pestaña nueva lo convierte en otro usuario y **su propia caja le aparece ocupada**, dejándolo afuera hasta que expire el TTL de 2 minutos. En un sábado a la noche, con cola en la barra, eso es una caja parada.

A esto se suman tres deudas de higiene que bloquean trabajar con confianza sobre esta base:

- **Se pushearon 7 tests rotos** a `origin/develop` (`PagosSection.test.tsx`). La suite dejó de ser una señal confiable: quien corriera los tests iba a ver rojo y aprender a ignorarlo. *(Cerrado en el PR 1: 1 test arreglado, 6 en skip hasta el PR 6.)*
- **641 líneas de código muerto** (`PdvSection.tsx`, `PdvTable.tsx`, `PdvFormModal.tsx`) que nadie importa, conviviendo con una versión embebida y peor de la misma funcionalidad dentro de un `PagosSection.tsx` de 681 líneas.
- **Hay comentarios que mienten sobre el código que documentan.** El más peligroso afirma que el refresh de tokens usa `FOR UPDATE` en transacción; el código que efectivamente lo implementa admite en su propio comentario que no hay lock. Un comentario falso es peor que ninguno: el próximo que lea eso va a asumir que el problema está resuelto.

Finalmente, un problema que la auditoría destapó y que es **independiente de Mercado Pago pero bloqueante para producción**: **no existía ningún mecanismo para actualizar el schema de una base ya desplegada.** Las 14 migraciones nuevas se aplicaban únicamente como init-scripts de Docker, y esos solo corren con el volumen vacío. `ARCHITECTURE.md` §9 incluso canonizaba esto como convención ("cada migración nueva se agrega como `14-…`, `15-…` en el compose"). El único script de base que existía (`db:reset`) borraba datos, no aplicaba schema. Consecuencia concreta: **no había forma de llevarle esta actualización a la mini-PC del boliche sin destruir su historial de noches.** Se descubrió porque la propia base local de desarrollo tenía las 8 tablas viejas con 29 tragos y 109 noches, y ninguna de las 14 nuevas. *(Resuelto en el PR 2 — runner en `apps/api/src/infra/migrations/`; la base local ya tiene las 23 migraciones aplicadas.)*

**Para qué rol**: el dueño (no puede confiar en la conciliación ni actualizar su sistema), la cajera (caja que se bloquea, cobros que cuelgan), y quien mantenga el código (suite en rojo, código muerto, comentarios falsos).

---

## Objetivo

Dejar la integración de Mercado Pago y las sesiones de caja en estado **desplegable en el boliche**, y dejar el repo en estado **mantenible**. En términos de comportamiento observable:

1. **Ningún cobro se duplica ni se pierde**, ni siquiera con webhooks reintentados, doble click, red intermitente o caída de un servicio a mitad del flujo.
2. **La caja cobra sin internet**, con la única excepción explícita y documentada de aquello que Mercado Pago exige sí o sí online.
3. **Todo cobro de Mercado Pago aparece en la conciliación** al cerrar la noche, igual que hoy aparecen los pedidos y tickets.
4. **La caja nunca queda bloqueada** por un cajero que cerró sesión, cerró el navegador, abrió otra pestaña o se quedó sin luz.
5. **El schema de una instalación existente se puede actualizar** sin perder datos, con un procedimiento repetible.
6. **La suite de tests vuelve a ser una señal confiable** (verde) y el código muerto desaparece.
7. **Los docs describen el sistema que existe.** Donde se haya cambiado una decisión arquitectónica, queda registrada como decisión, no como accidente.

Se decide explícitamente **remediar, no revertir**: el trabajo es valioso y revertirlo perdería semanas de integración con MP.

---

## Historias de usuario

- Como **dueño**, quiero que ningún cobro se registre dos veces ni desaparezca, para que la caja cierre cuadrada y no tenga que reconciliar a mano contra el panel de Mercado Pago.
- Como **dueño**, quiero ver los cobros de Mercado Pago en el resumen de la noche y en el backup de la nube, para no depender de que la mini-PC sobreviva.
- Como **dueño**, quiero poder actualizar el sistema sin perder el historial de noches, para no elegir entre "quedarme en una versión vieja" y "empezar de cero".
- Como **cajera**, quiero seguir cobrando aunque se caiga internet, porque el local no para cuando se cae la red.
- Como **cajera**, quiero que si cierro sesión o se me cierra el navegador pueda volver a entrar a mi caja inmediatamente, sin esperar ni depender de que un admin me desbloquee.
- Como **cajera**, quiero que un cobro colgado me avise y me deje cancelar, en vez de quedarme mirando "Esperando pago..." sin saber si cobré.
- Como **desarrollador**, quiero que `pnpm test` en verde signifique que el sistema está sano, para poder detectar regresiones reales.
- Como **desarrollador**, quiero que los comentarios y los docs digan la verdad, para no tomar decisiones sobre garantías que no existen.

---

## Criterios de aceptación

### A. Integridad del cobro (bloqueante)

- [x] **Dado** que Mercado Pago reenvía una notificación ya procesada, **cuando** llega al sistema, **entonces** no se crea un segundo registro de cobro ni se impacta el pedido dos veces. Verificable reenviando la misma notificación N veces y comprobando que el resultado es idéntico al de una sola.
- [x] **Dado** un cajero que hace doble click en cobrar, **cuando** se dispara la segunda solicitud, **entonces** no se genera una segunda orden de cobro real en Mercado Pago.
- [x] **Dado** que el cobro se confirmó en Mercado Pago pero falla el registro local del pedido, **cuando** ocurre el fallo, **entonces** el sistema deja constancia recuperable del cobro y lo señala para conciliación — nunca lo descarta en silencio.
- [x] **Dado** que Mercado Pago no responde, **cuando** pasa un tiempo acotado, **entonces** la operación corta con un error claro para la cajera en vez de colgarse indefinidamente. Aplica tanto al backend como a la espera del pago por QR en pantalla.
- [x] **Dado** que Mercado Pago devuelve un estado que el sistema no conoce, **cuando** se interpreta, **entonces** no se lo reporta como "pendiente" — se lo distingue de un cobro efectivamente en curso.
- [x] **Dado** dos cobros simultáneos con el token de acceso próximo a vencer, **cuando** ambos disparan la renovación, **entonces** la cuenta no queda marcada como vencida ni se corta la capacidad de cobrar. *(Cerrado por construcción con D1 en el PR 4: único escritor local del refresh.)*

### B. Local-first / disponibilidad (bloqueante)

- [x] **Dado** que no hay conectividad hacia **Supabase Cloud** (pero sí hacia Mercado Pago), **cuando** la cajera cobra con Posnet, **entonces** el cobro funciona igual que antes de este merge. Verificable cortando a mano la salida hacia el host de Cloud y cobrando. *(Reformulado el 2026-07-22: "no hay internet" era inverificable — cobrar con tarjeta siempre exige llegar a `api.mercadopago.com`, ver D1. Lo que este criterio protege es la independencia de **Cloud**, no de internet.)* **Verificado el 2026-07-22 en el gate del PR 4, modo 1** (Cloud cortado por `/etc/hosts`).
- [x] **Dado** que Supabase Cloud está caído o **pausado por inactividad**, **cuando** se intenta cobrar, **entonces** el cobro se concreta con el seller guardado en la base **local**, sin ninguna llamada a Cloud en el camino del cobro. Verificable por inspección del tráfico durante un cobro. *(Verificado en el gate: con la nube inalcanzable, el circuito completo funcionó — intent creado, device despierto, veredicto resuelto contra MP y persistido.)*
- [x] La única parte del flujo que requiere Supabase Cloud es la **vinculación inicial por OAuth** (setup de una vez). Cobrar no lo requiere nunca — ver D1.
- [x] **Dado** un token de acceso vencido y dos cobros simultáneos, **cuando** ambos disparan la renovación, **entonces** existe un único componente capaz de renovarlo, de modo que la carrera no puede ocurrir por construcción — ver D1.
- [x] **Dado** que el nivel 2 del resolver falla por una causa local (no hay seller, el token no se pudo descifrar, el refresh contra MP falló), **cuando** existe `MP_ACCESS_TOKEN`, **entonces** el sistema **degrada al nivel 3 en vez de propagar la excepción** — pero deja registro explícito de que cobró por el fallback y por qué, nunca en silencio. *(F1.a; el modo 3 del gate lo probó cobrando de verdad.)*
- [x] **Dado** un `MP_ACCESS_TOKEN` que pertenece a una **cuenta de Mercado Pago distinta** de la del seller vinculado, **cuando** el nivel 2 falla, **entonces** el sistema **no** degrada al nivel 3 y devuelve un error accionable — degradar ahí mandaría la plata a otra cuenta (R21/R22). *(F1.b, cubierto por tests.)*
- [x] **Dado** el sistema arrancado, **cuando** un admin mira el estado de salud, **entonces** ya sabe —**sin haber cobrado**— si el `MP_ACCESS_TOKEN` del fallback **ve el lector configurado en `MP_POS_DEVICE_ID`** y en qué `operating_mode`, o bien que no se pudo determinar. Verificable leyendo `GET /api/system/health` y la pantalla de `/admin` con el seller local borrado. *(Reemplaza al criterio de "misma aplicación" del 22-07, refutado — ver el changelog.)* *(F1.c/F1.d.)*

> ⚠️ **Alcance del bloque B, con la corrección del 2026-07-22 (segunda pasada).** Este bloque **no**
> promete "el Posnet cobra sin internet": cobrar con tarjeta siempre exige llegar a Mercado Pago (D1).
> Promete que **Supabase Cloud sale del camino crítico del cobro**. Y sobre el fallback por env:
> tampoco promete que sea equivalente al camino OAuth — promete que su **utilidad está medida y
> visible antes de necesitarlo**, en vez de descubrirse un sábado a la noche. La formulación
> intermedia ("el token de la env tiene que ser de la misma aplicación de MP que el lector") quedó
> **refutada**: el mismo token que el 22-07 devolvía `total: 0` devuelve `total: 1` una vez que el
> lector pasó a PDV con store y POS. Ver la estrategia F1 en el PR 4.

### C. Conciliación

- [x] **Dado** un cierre de noche con cobros de Mercado Pago, **cuando** hay conectividad, **entonces** esos cobros suben a la nube junto con los pedidos y tickets. → gate del PR 5 (2026-07-24): el cobro real de $101 (`processed/approved`, intent con `event_id`) subió con el cierre — verificado por REST en Cloud: `mp_orders` con su `event_id`, `mercadopago_cajas` (`COCKTRAILBAR01`) y `mercadopago_cajas_devices` (el PAX activo en PDV), con la metadata del seller sin token legible (`access_token: null`).
- [x] **Dado** un restore de emergencia desde la nube, **cuando** se ejecuta, **entonces** la configuración de Mercado Pago (cajas, dispositivos) y los cobros se recuperan. **Los tokens quedan explícitamente excluidos**: por D3 no son recuperables desde la nube y hay que re-vincular por OAuth. Es un trade-off consciente — ver el plan técnico. → verificado el 2026-07-24: restore ejecutado desde `/admin`, con las filas "Cajas MP / Posnets / Cobros MP" recuperadas y el **aviso de re-vincular por OAuth** (D3) mostrado (`93b0e8e` backend + `62619b8` frontend).
- [x] El resumen de la noche refleja los cobros de Mercado Pago sin necesidad de mirar el panel de MP. → la noche del gate cerró con el cobro de $101 incluido en su resumen (canal Posnet), sin consultar el panel de MP.

### D. Operación de caja

- [x] **Dado** un cajero que cierra sesión, **cuando** el logout se completa, **entonces** su caja queda libre de inmediato. → el logout llama `barSessionsService.leave(user)`, que borra la sesión por identidad (T19, `09237a4`).
- [x] **Dado** un cajero con una caja tomada, **cuando** abre otra pestaña o recarga la página, **entonces** el sistema lo reconoce como el mismo usuario y le devuelve *su* caja — nunca se la muestra como ocupada por un tercero. → D6: identidad `rol:username` derivada de la sesión autenticada (`identityFor`, `bar-sessions.service.ts:55`); `listOptions` marca la propia caja como `mine`.
- [x] **Dado** un cajero que pierde conexión o se queda sin luz, **cuando** pasa el tiempo de gracia, **entonces** la caja se libera sin intervención de un admin. → TTL de 2 min conservado como red de seguridad (`BAR_SESSION_TTL_MS` + `removeExpired`), tal como D6 lo previó.
- [x] **Dado** un admin que desaloja a un cajero, **cuando** se ejecuta el desalojo, **entonces** el cajero desalojado no puede volver a tomar la caja inmediatamente sin pasar por el flujo previsto. → `forceLogout` (admin) + SSE `bar-session.expired`: el cliente de `/caja` limpia la sesión y exige elegir caja de nuevo — no hay auto-rejoin.

### E. Seguridad

- [x] Ninguna tabla nueva es escribible por un cliente anónimo. Verificable intentando escribir con la clave pública y obteniendo rechazo. *(RLS + revoke en `bars`, PR 4.)*
- [x] **Dado** un usuario de caja que manipula el contexto de barra o dispositivo en su navegador, **cuando** intenta cobrar, **entonces** el backend rechaza operar contra una barra o Posnet que no le corresponde. La validación es del lado del servidor. *(A12, PR 4 + fix `00e6ac6` — ver el changelog.)*
- [x] Una notificación de Mercado Pago capturada y reenviada fuera de una ventana de tiempo razonable es rechazada. *(Ventana de frescura, PR 3.)*
- [x] Los tokens de acceso quedan cifrados en reposo, en local y en la nube — ver D3. Verificable inspeccionando la tabla y no encontrando el token legible. *(Verificado el 2026-07-22: local con prefijo `v1.` y columnas en claro `NULL`; en Cloud solo metadata, tokens purgados.)*
- [x] **Dado** un seller ya vinculado, **cuando** se vincula una cuenta distinta, **entonces** el seller anterior deja de estar activo — nunca quedan dos sellers activos ni se cobra con el viejo (A17, D9). *(Índice único parcial de single-seller + "vincular reemplaza".)*
- [x] **Dado** un admin en la pantalla de Pagos, **cuando** quiere resetear la vinculación, **entonces** existe un botón "Desvincular" que borra el seller en local y en Cloud y deja la pantalla en "No vinculada" (A18, D9).
- [x] El cambio de política de la cookie de sesión (`SameSite`) queda justificado y documentado, o revertido si no es necesario. *(Se conserva `Lax`, documentado: `Strict` rompería el aterrizaje del redirect de OAuth.)*

### F. Actualización de schema (bloqueante para producción)

- [x] Existe un procedimiento **único y repetible** para llevar una base existente a la última versión del schema, sin borrar datos.
- [x] **Dado** el procedimiento corrido dos veces seguidas, **cuando** termina la segunda, **entonces** el resultado es idéntico al de la primera y no falla.
- [x] **Dado** una base creada de cero y una base migrada incrementalmente, **cuando** ambas terminan, **entonces** tienen el mismo schema.
- [x] La base local de desarrollo queda actualizada con las 14 tablas nuevas **conservando** sus 29 tragos y 109 noches.
- [x] El procedimiento está documentado para el día que haya que actualizar la mini-PC del boliche.

### G. Higiene de código

- [x] `pnpm test` pasa en verde en todo el repo. Los 7 tests rotos se arreglan o se reescriben contra la UI real — no se borran para "poner verde". → 1 arreglado en el PR 1 (`ba7c113`), 6 migrados a los tests nuevos de PDV (T19); 814 unit api + 466 web en verde (2026-07-23), `PagosSection.test.tsx` sin ningún `skip`.
- [x] `pnpm typecheck` sigue pasando. → verde al cierre de `gestion-posnets` (2026-07-23).
- [x] `PdvSection`, `PdvTable` y `PdvFormModal` quedan **cableados** y en uso, y la versión duplicada embebida en `PagosSection` se elimina. No quedan las dos implementaciones conviviendo. → tab «PDV y Posnets» en `AdminClient.tsx` (`a5f9542`); los handlers de PDV ya no existen en `PagosSection.tsx`.
- [x] Los tres componentes cableados tienen tests (no tenían ninguno). → `PdvSection.test.tsx`, `PdvTable.test.tsx`, `PdvFormPanel.test.tsx`.
- [x] El formulario de alta de PDV es accesible: sus etiquetas están asociadas a sus campos, cierra con `Escape`, lleva el foco al primer campo al abrirse y lo devuelve al disparador al cerrarse — **sin focus trap**: `PdvFormModal` no es un modal sino un **panel lateral inline** (`PdvFormModal.tsx:32` → `w-full lg:w-[420px] shrink-0`, montado como hermano de la tabla en `PdvSection.tsx:254-277`) que no bloquea el fondo, y poner un trap ahí violaría WAI-ARIA. El archivo debería renombrarse a `PdvFormPanel` para que el nombre no siga mintiendo. → renombrado a `PdvFormPanel.tsx`; `PdvFormPanel.test.tsx` verifica labels asociadas, foco inicial, `Escape` cierra y ausencia de focus trap.
- [ ] El nombre y el código del punto de venta que se muestran en pantalla son los reales, no literales fijos. → **resto pendiente, achicado el 2026-07-24** (`62619b8`): la fila del Posnet ya muestra el `storeName` real de la caja (fallback `externalPosId`) en vez del literal `"Barra VIP"`; quedan literales «Barra VIP» de copy en `PdvSection.tsx` (descripción de la sección, botón de alta y sufijo de la fila de sesiones).
- [x] No quedan comentarios que afirmen garantías que el código no da. Especialmente el que asegura un bloqueo transaccional inexistente. → el del `FOR UPDATE` se borró en el PR 1 (`ba7c113`).
- [x] Los defectos de UI verificados quedan resueltos: el botón de prueba de Posnet apunta al dispositivo correcto y su resultado se muestra al usuario. → resuelto por eliminación: `handleTestCharge`/`testResult` ya no existen; la prueba real del Posnet es el flujo de `gestion-posnets` (gates T11/T14 con el aparato físico).
- [x] Los errores de red o de Mercado Pago dejan de tragarse en silencio: si la pantalla no pudo cargar, el usuario se entera. → el `catch {}` ya no existe en `PagosSection.tsx`; `PdvSection` muestra los fallos (toast/estado de error).

### H. Documentación

- [x] `docs/ARCHITECTURE.md` describe el sistema real: el modelo de datos de MP, el flujo OAuth con la Edge Function, la resolución de credenciales, las sesiones de caja, y el nuevo mecanismo de migraciones. Se corrige la afirmación de §2 sobre internet para que diga la verdad —sea cual sea la decisión que se tome. → hecho vía T26 (`6f7b078`): §11 documenta la integración MP completa (incl. resolución server-side del device y salud), §9 el runner de migraciones, §2 la decisión local-first corregida.
- [x] `docs/ROADMAP.md` se actualiza: R14 (QR real) queda cerrado o reformulado, R15 (Orders API vs legacy) refleja que el QR ya usa Orders API y el Posnet sigue en la API vieja, y los riesgos nuevos que no se resuelvan en esta spec entran a la tabla. → R14 reformulado (confirmado contra la doc oficial de MP; el QR real queda como feature de Fase 7), R15 actualizado (el Posnet sigue deliberadamente en la API legacy — el único flujo probado en vivo), y los riesgos nuevos (R17+) cargados en la tabla.
- [x] `CLAUDE.md` refleja los módulos nuevos y las convenciones que apliquen. → hecho vía T26: `CLAUDE.md` quedó reescrito delegando en `ARCHITECTURE.md` (fuente de verdad) y conserva las reglas operativas (único proceso Node / no serverless-edge).
- [x] Las decisiones arquitectónicas tomadas de hecho en este merge (dependencia de cloud, `mercadopago_sellers` viviendo en dos bases) quedan registradas como decisiones explícitas con su fundamento — o revertidas. → **revertidas y registradas**: D1/D2 (PR 4) invirtieron la dirección del token con su fundamento escrito acá, y `ARCHITECTURE.md` §2/§11 documentan el modelo vigente.
- [x] La discrepancia entre la resolución de credenciales que declara la spec de MP (4 niveles), la que declara su índice de fases (2 niveles) y la que implementa el código (3 niveles) se resuelve dejando una sola versión verdadera. → resuelta: los docs discrepantes (`docs/mp/`, `docs/fases-mp/`) se borraron en la consolidación de specs (`84a2fb3`); la única versión verdadera es `ARCHITECTURE.md` §11.

---

## Fuera de alcance

- **Fase 7 de Mercado Pago (reembolsos)** — sigue pendiente, no entra acá.
- **Migrar el Posnet de Payment Intents a Orders API** (R15) — el flujo legacy es el único probado en vivo con hardware real; migrarlo es una spec propia.
- **Rediseñar la UX de `PagosSection`** — se lo achica sacándole la gestión de PDVs (que pasa a los componentes ya escritos) y se corrigen sus defectos, pero no se rediseña la pantalla ni se cambia el flujo que ve el usuario.
- **Soportar más de un punto de venta** — tanto la implementación viva como la que se cablea topean en 1 PDV, coherente con el modelo "1 caja por barra". Multi-barra llega con el multi-tenant de la Fase 6.
- **Multi-tenant y RLS completo** (Fase 6 del roadmap) — la tabla `bars` es un paso en esa dirección, pero acá solo se cierra el agujero de seguridad, no se construye multi-tenancy.
- **Empaquetado / sacar Docker** (Fase 6) — aunque el mecanismo de migraciones toca este terreno, la solución debe servir para el stack Docker actual y no bloquear el empaquetado futuro.
- **Validación E2E de `/carta` y `/barra`** — sigue diferida a la Fase 7 según el roadmap.
- **Auditoría del código pre-merge** — esta spec cubre lo que entró en `e95404a..8b559b2`, no deuda anterior. R8, R11 y R16 siguen en el roadmap.
- **Limpieza de lint a nivel repo** (R11) — tiene su propia spec.

---

## Decisiones tomadas

Las ocho preguntas abiertas se discutieron y resolvieron el 2026-07-20. Quedan acá con su fundamento, porque el *por qué* importa tanto como el *qué*.

### D1 — El cobro no puede depender de Supabase Cloud. Se invierte la dirección del token.

**Aclaración previa, porque se prestó a confusión**: cobrar con Mercado Pago **siempre** requirió internet — `mercadopago.service.ts:111` apunta a `api.mercadopago.com`, y tanto el Posnet como el QR van ahí. No existe cobro con tarjeta offline. Lo que `ARCHITECTURE.md` §2 protege es que el *sistema* siga operando sin internet: tomar pedidos, emitir tickets, cerrar la noche y **cobrar en efectivo**.

**Lo que sí regresionó**: antes el token salía de una variable de entorno local, así que cobrar dependía de **un solo** servicio remoto (MP). Ahora sale de Supabase Cloud, así que depende de **dos servicios remotos independientes** — y una caída de Cloud impide cobrar aunque MP esté perfecto.

**No se elimina Supabase Cloud.** Tiene cinco trabajos legítimos: bajar datos maestros, subir la noche al cerrarla, el restore de emergencia (que existe por un incidente real de pérdida de datos), subir la auditoría, y ahora ser el aterrizaje del OAuth. Ese último es **estructuralmente necesario**: Mercado Pago exige un `redirect_uri` público, HTTPS y con match exacto (`mercadopago-oauth.service.ts:63`), y la mini-PC está detrás del NAT del boliche — MP no tiene forma de redirigir el navegador ahí. Hace falta un endpoint público sí o sí, y la Edge Function lo resuelve.

**Lo que cambia es la dirección del token:**
- Cloud sigue siendo donde aterriza el OAuth y donde vive el backup.
- Al vincular, el backend local se baja el seller + token **una vez** y lo persiste en local.
- **Cobrar lee de local.** Ahí termina la dependencia.
- **El refresh lo hace únicamente el local**, que después empuja el token nuevo a Cloud como sync diferido.

Ese último punto además **elimina el hallazgo A8 en vez de parchearlo**: el `refresh_token` de MP es rotativo y de un solo uso, así que con dos posibles refrescadores la carrera es inevitable. Con un único escritor, esa clase de bug deja de existir — no hace falta un mutex.

**Escenario que vuelve esto no-negociable — la pausa por inactividad de Supabase.** En el plan gratuito, un proyecto de Supabase **se pausa tras ~7 días de inactividad** y queda caído hasta reactivarlo a mano. Esto no es una falla rara: encaja con cómo opera el local-first — el sistema trabaja offline y solo toca la nube al cerrar la noche, así que es previsible que el proyecto se pause. Con el token leído de Cloud en cada cobro (estado actual), la secuencia es: proyecto pausado → llega el primer cobro → intenta leer el token de Cloud → **error → no cobra**. Con D1, el token ya está en local y el refresh va a MP, no a Supabase; la pausa deja de tener cualquier efecto sobre la caja. La alternativa (pagar el plan Pro para que no se pause) cuesta plata y depende de mantener la nube despierta — D1 no.

Se gana: cobrar sobrevive una caída **o una pausa por inactividad** de Cloud, desaparece la incoherencia de leer de Cloud contra una FK local satisfecha por stubs (ver D2), y se cierra A8. Se asume: un camino de sync nuevo, que sigue exactamente el patrón que el repo ya usa para las noches.

**Opción complementaria evaluada — keep-alive ("ping-pong") de la nube.** Un pinger externo siempre-encendido (UptimeRobot / cron-job.org / un GitHub Action programado) que golpee un endpoint de Supabase cada pocos días evita que el proyecto se pause por inactividad. Se considera **defensa en profundidad, no un reemplazo de D1**, por tres motivos: (1) solo cubre la pausa, no una caída real ni un problema de conectividad; (2) el pinger tiene que correr fuera de la mini-PC —que está apagada justo durante la inactividad— y fuera de `pg_cron` —que se pausa junto con el proyecto—, o sea suma una pieza externa que también puede fallar; (3) no cambia que, sin D1, el cobro siga *dependiendo* de la nube. **Recomendación**: el ping tiene sentido para mantener disponible la nube para sus usos legítimos (push al cerrar la noche, restore, OAuth), nunca para justificar que la caja dependa de ella. Para producción con plata real, evaluar además el plan Pro de Supabase (no se pausa); pero D1 hace que el sistema aguante en el plan gratuito igual. **Fuera del alcance de esta spec** — es infra de operación, no código del repo.

### D2 — `mercadopago_sellers` pasa a tener copia completa en local

Consecuencia directa de D1. Cloud es donde escribe la Edge Function; local tiene la copia completa que se lee para cobrar y es el único que refresca.

La FK `mercadopago_cajas.seller_user_id REFERENCES mercadopago_sellers(user_id)` (`20260715000200:13`) siempre se declaró **dentro** de cada base. Lo que cruzaba bases era la **lectura** (`mpDb` → Cloud) contra una FK local satisfecha por filas stub sin tokens — que es lo que motivó `20260718010000_sellers_nullable_tokens.sql`. Con D1 los stubs se vuelven filas completas y la incoherencia desaparece **sin DDL sobre la FK**.

### D3 — Los tokens se cifran a nivel aplicación

D1 hace que los tokens ahora también vivan en el disco de la mini-PC del boliche, no solo en Cloud: la superficie crece y el texto plano deja de ser aceptable. Se cifran **a nivel aplicación**, y se descarta `pgsodium`/Vault por agregar una dependencia de Postgres que choca con el Postgres embebido de la Fase 6.

**Clave de cifrado local**: una env dedicada `MP_TOKEN_SECRET` (con `AUTH_SECRET` como default para no romper instalaciones existentes), más `key_version` por fila y una `MP_TOKEN_SECRET_PREVIOUS` opcional para re-cifrar en el boot. Así, rotar `AUTH_SECRET` sigue haciendo lo único que hacía —desloguear gente— sin dejar al boliche sin cobrar.

**Cloud no es almacén de tokens: es buzón de traspaso.** La Edge Function —que es donde los tokens nacen— cifra las credenciales con una `MP_HANDOFF_KEY` propia y las deja en una tabla de handoff con vencimiento corto; en `mercadopago_sellers` de Cloud escribe **solo metadata no secreta**. El local baja el handoff, lo re-cifra con su clave, persiste y **borra el handoff**. Resultado: en Cloud no queda token legible **ni recuperable**, lo que cumple el criterio E de forma más fuerte que cifrarlo con una clave guardada al lado — compartirle la clave a la Edge Function no serviría, porque guardar la clave en los secrets de Supabase, al lado del ciphertext en la misma base, no protege contra el atacante que motiva el criterio E.

**Consecuencia aceptada**: un restore desde la nube tras romperse el disco de la mini-PC recupera cajas, dispositivos y cobros, pero **no el token** — hay que re-vincular por OAuth (dos minutos de un admin). El criterio C se redactó excluyendo tokens.

**Formulación original descartada** (2026-07-20): "clave derivada del `AUTH_SECRET`" — insuficiente por (1) acoplar rotar la cookie de sesión con poder cobrar (rotarlo **dejaría al boliche sin cobrar**) y (2) no resolver la Edge Function.

### D4 — Runner de migraciones propio en el boot del backend

Ver el anexo "Actualización de schema en producción". Queda por resolver en `/plan`: cómo backfillear las migraciones ya aplicadas por init-scripts, y si el backend debe negarse a arrancar cuando una migración falla.

### D5 — `PdvSection`, `PdvTable` y `PdvFormModal` se cablean, no se borran

Las 641 líneas son un CRUD completo de puntos de venta —listar, crear con formulario, borrar, vincular Posnet— y son **estrictamente más capaces** que la versión embebida en `PagosSection`, que crea siempre un PDV hardcodeado como `"BARRA-01"/"Barra VIP"` sin formulario y no permite borrar.

Cablearlas resuelve tres problemas de una: elimina el hardcode, achica el monolito de 681 líneas, y suma el borrado de PDV que hoy no existe. Y se usa **desde el día uno**: no es preparación para el futuro, reemplaza al botón hardcodeado actual. El tope de un PDV es igual en ambas versiones (`PdvSection.tsx:182`), así que no cambia el modelo de negocio.

**A cambio sale la duplicación**: los handlers de PDV y las tarjetas correspondientes se van de `PagosSection`. Quedarse con las dos implementaciones sería el peor resultado posible.

**Costo asumido conscientemente**: los tres archivos no tienen un solo test, y `PdvFormModal` no es un diálogo accesible. Cablear implica cablear + testear + arreglar accesibilidad.

### D6 — El problema de las sesiones de caja es la identidad, no el TTL

La pregunta original ("¿cuántos minutos de gracia?") estaba mal planteada. El cajero se auto-bloquea porque su identidad es un UUID guardado por pestaña: abrir una pestaña nueva lo convierte en otra persona. **La identidad pasa a derivarse de la sesión autenticada**, no del navegador. Con eso, reentrar siempre devuelve la propia caja y los 2 minutos quedan solo como red de seguridad para el corte de luz.

### D7 — Los 7 tests rotos se arreglan primero

Es lo único que sale de orden. Sin suite confiable no hay forma de verificar que las correcciones siguientes no rompan nada — y varias de ellas tocan justamente `PagosSection`, el archivo de los tests rotos.

> **Matiz (2026-07-20)**, descubierto al inspeccionar los tests uno por uno: **no son un solo problema, son dos**. Seis de los siete prueban PDVs y Posnets, o sea código que D5 muda a `PdvSection` — no se reparan, **se migran**, y por eso viajan con el cableado en el último entregable. El séptimo (toggle Sandbox) es un defecto real de accesibilidad donde **el test tiene razón y el componente está mal**: busca `findByRole("button", {name: "Sandbox"})` con `aria-pressed`, y `PagosSection.tsx:599-612` tiene un `<button>` sin nombre accesible ni `aria-pressed`, con un `<span>Sandbox</span>` al lado. Ese sí va primero. Ver el orden de ejecución en el plan técnico.

### D8 — Esto va antes del empaquetado

El runner de migraciones que sale de acá es insumo de la Fase 6: `docs/specs/06-empaquetado/empaquetado-windows.md` depende de que exista una forma de actualizar una instalación desplegada.

### D9 — El modelo es de UN solo seller: vincular debe REEMPLAZAR, y debe existir "Desvincular" (a partir de A17/A18)

El negocio es de un solo comercio (un dueño recibe toda la plata — ver `docs/fases-mp/INDEX.md`, "single-seller"). Pero el código quedó en un híbrido roto: acumula filas pero solo usa una (el mecanismo exacto está en A17). Resultado observado en vivo: se vincula una cuenta nueva y el sistema sigue cobrando con la vieja, en silencio.

Se decide **comprometerse con el modelo single-seller de verdad**:
- **Vincular reemplaza**, no acumula: al completar un OAuth nuevo, el seller anterior se desactiva o se borra, de modo que siempre haya a lo sumo un seller activo. (Alternativa evaluada y descartada por ahora: volver `findFirstActive` a `desc` para que gane el más nuevo — no alcanza, porque dejaría filas viejas activas acumulándose y con tokens vivos; el problema es la acumulación, no solo el orden.)
- **Existe "Desvincular"** (endpoint + botón): hoy no hay ninguna forma de resetear o cambiar de cuenta desde la app (A18). Con la inversión del token (D1/D2), desvincular debe limpiar el seller **en local y en Cloud**, y el handoff si quedó alguno.
- Esto entra en el **mismo PR que la inversión del token** (PR 4), porque comparten el modelo de datos del seller y no tiene sentido tocarlo dos veces.

---

## Anexo — Inventario de hallazgos

Trazabilidad de la auditoría. Los marcados ✅ fueron verificados a mano sobre el código; el resto provienen del análisis de los agentes especializados.

### Severidad alta

| # | Hallazgo | Dónde |
|---|---|---|
| A1 ✅ | `mpDb = supabaseCloud ?? supabase` — cada cobro consulta cloud por internet | `apps/api/src/shared/supabase.ts:27` |
| A1b ✅ | **El fallback legacy es inalcanzable cuando Cloud cae.** `findFirstActive()` **lanza** en vez de devolver `null` (`mercadopago-sellers.repository.ts:126-129`) y la llamada del nivel 2 no está protegida (`credentials-resolver.service.ts:34-36`), así que la excepción se propaga y el nivel 3 (`env.MP_ACCESS_TOKEN`) nunca se ejecuta. Con Cloud caído el Posnet **no cobra**, aunque el token esté en la env a un `if` de distancia. | `credentials-resolver.service.ts:34-36` |
| A2 ✅ | `bars` con `GRANT ALL` a `anon` y sin RLS; `bar_sessions` cascadea en delete | `supabase/migrations/20260715000000_bars.sql:13` |
| A3 ✅ | `mp_orders` sin ninguna restricción única → cobros duplicados por reintento | `supabase/migrations/20260717221900_mp_orders.sql:23-25` |
| A4 ✅ | Ninguna tabla nueva en el sync → conciliación ciega a cobros MP | `apps/api/src/modules/sync/cloud-sync.repository.ts` |
| A5 ✅ | Logout hardcodea `deviceId: "default"`; `DELETE /leave` no lo llama nadie | `apps/api/src/app.ts:205` |
| A6 ✅ | 641 líneas de código muerto sin ninguna importación | `apps/web/src/components/settings/Pdv*.tsx` |
| A7 | Cajero se auto-bloquea: identidad por pestaña (`sessionStorage`) | `apps/web/src/services/bar-sessions.service.ts:37-45` |
| A8 | Race del refresh token sin lock, con comentario que afirma lo contrario | `mercadopago-oauth.service.ts:124-128` vs `credentials-resolver.service.ts:66-67` |
| A9 | Sin timeout en ninguna llamada a MP (`fetch` de Node no tiene default) | `mercadopago-orders.service.ts:306`, `-provisioning.service.ts:631`, `-oauth.service.ts:138` |
| A10 | Polling de QR sin timeout de cliente; el `expiresAt` del backend se descarta | `apps/web/src/hooks/useCheckout.ts` |
| A11 | Pérdida de venta si el registro del pedido falla tras confirmar el cobro | `apps/web/src/hooks/useCheckout.ts:217-221` |
| A12 | `X-Bar-Id` / `x-device-id` aceptados sin validar contra la sesión | `api-client.ts:32-42`, `mp-context.middleware.ts:17-24` |
| A17 ✅ | **`findFirstActive()` devuelve el seller más VIEJO** (`order created_at asc + limit 1`). Como vincular una cuenta distinta hace upsert por `user_id` y **crea una fila nueva** en vez de reemplazar, con dos sellers activos siempre gana el primero: la cuenta recién vinculada queda invisible y los cobros usan el token viejo. Verificado en vivo — el usuario vinculó su cuenta y la UI seguía mostrando la de otra persona; había 2 filas activas en Cloud. | `mercadopago-sellers.repository.ts:115-130` |
| A18 ✅ | **No existe forma de desvincular un seller.** El controller OAuth solo tiene `/oauth/url` y `/seller-status`; no hay endpoint DELETE ni botón en la UI. El único camino es "Vincular", que sobrescribe/acumula. Imposible resetear o cambiar de cuenta desde la app. | `mercadopago-oauth.controller.ts` |

### Severidad media

Tokens OAuth en texto plano · webhook sin ventana de frescura del timestamp (replay) · doble cobro por doble click (`randomUUID()` por llamada) · `mapMpStatus` mapea estados desconocidos a `"created"` · webhook fire-and-forget con `setImmediate` (se pierde si el proceso reinicia) · cookie de sesión bajada de `SameSite=Strict` a `Lax` · salto de capa en `mercadopago-provisioning.service.ts:293-325` (el service toca la base directo) · `PagosSection.tsx` monolítico de 681 líneas · `handleTestCharge` no pasa el `deviceId` recibido (`:182`) · `testResult` se setea y nunca se renderiza (`:57`, `:183`) · `catch {}` que traga fallos de carga (`:107`) · dropdown y toggle sin accesibilidad · dos migraciones no-op que delatan edición de migraciones ya aplicadas.

### Estado de verificación al momento de la spec

- `pnpm typecheck` — **pasa**.
- `pnpm test` — **346 pasan, 7 fallan**, todos en `apps/web/src/components/settings/PagosSection.test.tsx`. Causa confirmada: la UI de PDVs se movió a `PdvSection.tsx` (donde vive el encabezado "Puntos de Venta", `:192`) pero el test sigue renderizando solo `PagosSection`, que ahora titula esa tarjeta "Caja" (`:322`). Fueron pusheados rotos.
- Base local: tiene las **8 tablas viejas** con 29 tragos y 109 noches; **ninguna de las 14 nuevas**.

### Verificación en vivo del flujo OAuth (2026-07-20)

Se levantó el entorno y se ejercitó la vinculación de punta a punta en un navegador real. Hallazgos:

- **El flujo OAuth funciona.** Vincular redirige a `auth.mercadopago.com/authorization` con `client_id`, `redirect_uri` a la Edge Function y PKCE S256 correctos. La Edge Function `mp-auth-callback` está desplegada en Cloud, con sus 4 secrets cargados (verificados por digest SHA256). El estado "⏳ E2E cloud pendiente" del `docs/fases-mp/INDEX.md` ya se puede cerrar.
- **El token vive en Cloud, no en local.** Confirmado en vivo: la DB local **no tiene** la tabla `mercadopago_sellers` ("relation does not exist"); el seller vive en el Postgres de Supabase Cloud. Es la evidencia empírica directa de A1/D1.
- **A17 reproducido.** Había 2 sellers activos en Cloud: la cuenta del otro desarrollador (del 07-17) + la cuenta de prueba de Manuel (`GARCIAMANUEL…`, user `1517393956`) vinculada el 20-07 — **la cuenta del dueño del boliche nunca se vinculó todavía**. La UI mostraba la vieja por el `order asc`. Se intentó resolver borrando la fila vieja a mano (DELETE contra la REST API de Cloud) — exactamente el "desvincular" que A18 dice que falta en la app — pero el borrado no fue definitivo: al 2026-07-21 vuelven a estar las dos filas activas (ver "Estado actual").
- **Setup de OAuth documentado** en `docs/fases-mp/setup-oauth.md` (nuevo): las 3 env del backend, los 4 secrets de la Edge Function, el registro del redirect URI y PKCE en el panel de MP.

### Notas de método para verificar contra la API de Mercado Pago (2026-07-22)

Salieron de la verificación de titularidad del lector. **Están acá para que el próximo que verifique
no saque conclusiones falsas** — dos de estos endpoints devuelven errores que parecen evidencia y no
lo son.

- **Un device en `STANDALONE` sin store ni POS puede no aparecer en el listado; el mismo device en
  `PDV` con store y POS sí aparece.** Es la lectura corregida de lo que el 22-07 se interpretó como
  "visibilidad por aplicación": el `MP_ACCESS_TOKEN` del `.env` devolvía `total: 0` con el lector en
  `STANDALONE / pos_id: 0 / store_id: ""`, y devuelve `total: 1` con **el mismo token** una vez que el
  lector pasó a `PDV` atado a store `85068168` y POS `135641665`. **Lección de método**: las dos
  observaciones originales cambiaron dos variables a la vez (aplicación del token y estado del
  device) y se le atribuyó el efecto a la equivocada. Antes de concluir nada sobre un listado vacío,
  **fijar el estado del device y variar una sola cosa**.
- **Pregunta abierta, no resuelta**: por qué el token OAuth de `MP_APP_ID=2990738606457276` **sí**
  listaba el lector cuando estaba en `STANDALONE` y el de la env no. Distinguir entre "el listado
  expone de forma inconsistente los devices sin PDV" y "existe alguna asociación a nivel aplicación
  que se disuelve al entrar en PDV" exigiría devolver el lector a `STANDALONE` y re-consultar con los
  dos tokens — una prueba destructiva sobre el único aparato disponible, que no se hizo. **Tampoco se
  re-consultó con el token OAuth después del cambio a PDV** (requiere leer el token del seller desde
  Cloud): queda como chequeo pendiente barato de hacer.
- **La referencia oficial no menciona la aplicación.** `GET /point/integration-api/devices` está
  documentado como *"un listado de los dispositivos Point disponibles asociados a tu cuenta de Mercado
  Pago"*, con filtros opcionales `store_id` y `pos_id` y un Access Token en el header — por **cuenta**
  ([API reference](https://www.mercadopago.com.ar/developers/es/reference/integrations_api/_point_integration-api_devices/get)).
  Lo que sí dice la doc de Point es que **hay que crear una aplicación por cada solución que se
  integre** y elegir el tipo **"Pagos presenciales"**
  ([Crear aplicación](https://www.mercadopago.com.br/developers/es/docs/mp-point/create-application)):
  eso hace razonable sospechar que una app registrada bajo otro tipo de solución tenga limitaciones,
  pero **no está documentado que se manifiesten como un listado vacío**, y acá el listado funcionó.
- **`GET /users/{uid}/stores/{id}` devuelve HTTP 405 — no existe.** El detalle de un store sale por
  `GET /stores/{id}`.
- **`GET /point/integration-api/devices/{id}` devuelve HTTP 404
  `{"error":"111","message":"Action not supported"}` para TODOS los ids y con TODOS los tokens**,
  incluso para devices que sí figuran en el listado. Es una **limitación del endpoint**, no evidencia
  de que el device no exista ni de que no sea tuyo.
- **El único dato confiable de titularidad es el listado `GET /point/integration-api/devices`.**
- **Poner un lector en PDV**: `PATCH https://api.mercadopago.com/point/integration-api/devices/{id}`
  con `{"operating_mode":"PDV"}`. Hoy la app no tiene forma de hacerlo (ver la feature de gestión de
  Posnets en el roadmap), así que va a mano.

### Bugs de infraestructura encontrados y corregidos en esta sesión

No estaban en la auditoría original (aparecieron al levantar el entorno). **Ya corregidos y commiteados** (`next.config.ts` en `d3fd06f`):

- **Login roto por cookie cross-origin.** `apps/web/.env` tenía `NEXT_PUBLIC_API_URL` apuntando a la IP LAN, así que el navegador hacía el fetch de login cross-origin y la cookie de sesión **no se guardaba** para `localhost:3000` → login daba 200 pero la app rebotaba a `/login`. Arreglo: `NEXT_PUBLIC_API_URL` vacío (cliente same-origin, la cookie pega, y anda igual desde la LAN sin CORS).
- **Puerto del backend hardcodeado en el proxy de Next.** `apps/web/next.config.ts` tenía `destination: "http://localhost:3001/api/..."` fijo, pero el backend corre en 8080 → el proxy daba ECONNREFUSED. Arreglo: el rewrite ahora lee `API_PROXY_TARGET` (default 3001). Bug real del repo: cualquiera que cambie `PORT` se lo comía.
- Se agregó `API_PROXY_TARGET=http://localhost:8080` a `apps/web/.env`.

Estos tres tocan config local (`.env`) y un archivo commiteado (`next.config.ts`). El cambio de `next.config.ts` era una corrección genuina, independiente del `.env` de cada uno, y ya se commiteó (`d3fd06f`).

### Actualización de schema en producción — análisis (2026-07-20, resuelto por el PR 2)

**Por qué hoy es imposible.** Las migraciones se montan en `/docker-entrypoint-initdb.d/` (`docker-compose.yml:55-79`). El entrypoint oficial de Postgres ejecuta ese directorio **únicamente cuando el data dir está vacío**, es decir en el primer arranque del volumen. Sobre un volumen existente lo **saltea entero, sin error ni log**. El boot autocurativo de `apps/api/src/server.ts:48-56` solo *arranca* la base (`supabase start` → `docker compose up -d`); nunca la migra. Evidencia directa: la base local corrió `docker compose up` sin fallar y quedó con las 8 tablas viejas y ninguna de las 14 nuevas.

Hoy, actualizar una instalación desplegada solo se puede (a) borrando el volumen, perdiendo todo el historial, o (b) con alguien entrando por SSH a correr los `.sql` a mano, en orden, recordando cuáles ya aplicó y sin ningún registro de lo aplicado.

**Restricción técnica que condiciona la solución.** El backend **no puede ejecutar DDL** con lo que tiene: habla solo por PostgREST vía `@supabase/supabase-js`, que expone tablas, no `CREATE TABLE`. No hay driver de Postgres instalado. El puerto de Postgres sí está expuesto en el host (`docker-compose.yml:22`, `:54322`, con el comentario "No lo usa el backend").

**Opciones evaluadas:**

| Opción | A favor | En contra |
|---|---|---|
| CLI de Supabase (`supabase db push`) | Oficial, tracking de migraciones incluido | Dependencia externa en la mini-PC, justo lo que la Fase 6 quiere eliminar; el compose es un Supabase mínimo hecho a mano, no el stack del CLI — riesgo de mismatch |
| **Runner propio en el boot del backend** ← recomendado | Encaja con el boot autocurativo existente; sin dependencias externas; **sobrevive a la Fase 6** porque habla el protocolo de Postgres, no Docker ni REST | Requiere sumar el driver `pg` y conectar al `:5432` directo |
| Mantener init-scripts | Cero trabajo | Solo sirve para instalaciones nuevas — no resuelve el problema |

**Forma de la solución recomendada**: tabla `schema_migrations`, leer `supabase/migrations/*.sql` en orden de nombre, aplicar los pendientes cada uno en su transacción, antes de aceptar tráfico.

**Dos consecuencias a resolver en `/plan`:**
- **Backfill**: en una instalación creada por init-scripts, las 14 migraciones ya están aplicadas. Hay que marcarlas como tales o el runner las reintentará. `20260719000000_bars_code.sql` **es idempotente** — su seed usa `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM bars WHERE code = 'BARRA-01')` — y eso habilita la estrategia de backfill por re-ejecución que adopta el plan técnico.
- **Política de fallo**: si una migración falla a mitad, ¿el backend arranca igual con schema viejo, o se niega a arrancar? Para una caja en pleno turno, la respuesta no es obvia y hay que elegirla a conciencia.

### Lo que está bien hecho (no tocar sin motivo)

PKCE S256 correcto · `consume_oauth_state` genuinamente atómico (`DELETE ... RETURNING`, con `search_path` fijado y permisos revocados) · `mercadopago_sellers` bien cerrada (RLS + política restrictiva + revoke, con tests pgTAP que lo verifican) · HMAC timing-safe · fail-closed si falta el secreto de webhooks · ningún endpoint quedó sin autenticación · los tokens nunca se loguean ni llegan al frontend · exclusividad de cajas con constraint real de base y manejo del conflicto · inyección de dependencias por constructor · cobertura de tests real en los módulos nuevos del backend.

---

## Plan técnico

> Escrito el 2026-07-20 tras consultar a `supabase-expert` (diseño del runner y de la inversión del token) y `architect-reviewer` (secuenciación y boundaries). Ambos corrigieron errores de la spec original, ya enmendados arriba.

### Enfoque

Se ataca en seis entregables secuenciales, cada uno desplegable y verificable por separado. El criterio de corte es que **cada PR o no cambia comportamiento observable, o cierra un bloque completo de criterios con su migración adentro** — nunca se deja el sistema en un estado intermedio roto. El orden lo manda una dependencia dura que no es de deploy sino de *verificabilidad*: la base local no tiene ninguna de las 14 migraciones nuevas, así que **sin el runner de migraciones nada de lo que requiera schema nuevo se puede probar localmente** — y los frentes de cobro, sync, seguridad y sesiones requieren todos migración nueva. Por eso el runner va segundo, apenas detrás de dejar la suite en verde. *(ya resuelto — el runner corre desde el PR 2)*

Dos decisiones de diseño gobiernan el resto: **D1 no se implementa como un parche sino como una inversión de dirección** (el local pasa a ser el único que lee y refresca el token), lo que *disuelve* el hallazgo A8 en vez de mitigarlo; y **el cifrado se implementa antes de escribir tokens en local**, para no tener que backfillear texto plano después.

### Archivos / módulos afectados

**Runner de migraciones (nuevo, infraestructura — no pasa por Controller→Service→Repository):**
- `apps/api/src/infra/migrations/migration-runner.ts` — orquestación
- `apps/api/src/infra/migrations/pg-migrations.repository.ts` — único lugar del repo que usa el driver `pg`
- `apps/api/src/infra/migrations/migrations-status.ts` — singleton de estado degradado
- `apps/api/src/server.ts` — integración en `boot()`, después de `ensureDatabaseConnection()` y antes de `pullMasterData`, envuelto en `try/catch` que nunca re-lanza
- `docker-compose.yml:57-79` — se quitan las 19 líneas de migraciones; quedan solo `01-roles.sql` y `02-jwt.sql`, que no son migraciones
- `apps/api/package.json` — nueva dependencia `pg` + `@types/pg`

**Inversión del token:**
- `apps/api/src/shared/supabase.ts:27` — se elimina `mpDb`
- `apps/api/src/modules/mercadopago/mercadopago-sellers.repository.ts:76,101,116,140` — pasan de `mpDb` a `supabase` (local); además cifran/descifran en `mapRow` y en el armado del row
- `apps/api/src/modules/mercadopago/mercadopago-oauth.service.ts:129` — `refreshTokenIfNeeded` persiste local y devuelve de inmediato; marca la fila para push diferido
- `apps/api/src/modules/mercadopago/credentials-resolver.service.ts:66-67` — se borra el comentario que promete un `FOR UPDATE` inexistente (no se reemplaza por otra promesa); y el nivel 2 pasa a degradar al nivel 3 con guarda de cuenta (estrategia **F1** del PR 4)
- `apps/api/src/modules/mercadopago/mp-fallback-preflight.ts` (nuevo) — singleton de estado del fallback por env, poblado en el boot con dos `GET` de solo lectura. Mismo patrón que `infra/migrations/migrations-status.ts`. Consumidores: `credentials-resolver` (guarda de cuenta) y `systemService` (health)
- `apps/api/src/modules/mercadopago/mercadopago.service.ts:412-461` — `checkDeviceConnection()` ya hace exactamente la consulta que necesita el preflight, pero con el token **resuelto**; se factoriza para poder correrla contra un token explícito (el de la env) sin duplicar la lógica
- `apps/api/src/modules/mercadopago/mercadopago-provisioning.service.ts:293-325` — el salto de capa se reemplaza por `sellersRepo.upsert()` inyectado
- `apps/api/src/modules/sync/cloud-sync.repository.ts` — métodos nuevos: `pullSellerHandoff()`, `pushSellerMetadata()`, `pushMpCajas()`, `pushMpDevices()`, `pushMpOrders()`
- `supabase/functions/mp-auth-callback/index.ts` — deja de escribir tokens en `mercadopago_sellers`; escribe metadata + handoff cifrado

**Integridad del cobro:**
- `apps/api/src/modules/mercadopago/mercadopago-orders.service.ts` — idempotency key estable, timeouts, `mapMpStatus` que no traga desconocidos
- `apps/api/src/modules/mercadopago/mercadopago-webhooks.service.ts` — ventana de frescura, y reemplazo del `setImmediate` fire-and-forget
- `apps/api/src/modules/mercadopago/mercadopago.service.ts` — timeouts en `pointApiRequest`
- `apps/web/src/hooks/useCheckout.ts` — timeout de cliente honrando `expiresAt`, y constancia recuperable si falla el registro tras cobrar

**Sesiones de caja:**
- `apps/api/src/modules/bar-sessions/bar-sessions.service.ts:7-9` — la identidad deja de incluir `deviceId`
- `apps/api/src/app.ts:205` — sale la construcción de identidad de la capa de composición (es de donde nace A5)
- `apps/web/src/services/bar-sessions.service.ts:37-45` — se elimina el UUID por pestaña

**Frontend / higiene:**
- `apps/web/src/components/settings/PagosSection.tsx` — se le quitan las Cards 2 y 3; queda en ~250 líneas
- `apps/web/src/components/settings/PdvSection.tsx` — recibe las Cards 2 y 3; se le borra la tarjeta "Sucursal" duplicada (`:224-252`)
- `apps/web/src/components/settings/PdvFormModal.tsx` → renombrar a `PdvFormPanel.tsx`
- `apps/web/src/app/admin/AdminClient.tsx` — `PdvSection` se monta como **tab propio**, no embebido
- Tests: los 6 de PDV/Posnet migran de `PagosSection.test.tsx` a `PdvSection.test.tsx`

### Cambios de datos

**Migraciones nuevas** (todas aplicadas por el runner, no por el compose):

1. `schema_migrations` — tabla de tracking: `version TEXT PK` (nombre de archivo), `checksum TEXT` (sha256, se compara pero **no** participa de la identidad), `applied_at`, `duration_ms`, `applied_by`. Con `REVOKE ALL FROM anon, authenticated`.
2. `mp_orders` — restricciones de unicidad sobre `order_id_mp`, `external_ref` e `idempotency_key` (cierra A3), **más `event_id UUID REFERENCES night_events(id)` + índice**. Este último es un **prerrequisito descubierto durante el diseño**: sin él no se puede empujar "los cobros de esta noche" al cerrar, porque filtrar por ventana de `created_at` es frágil con noches que cruzan medianoche. Sin esta columna el criterio C es inalcanzable.
3. `bars` — habilitar RLS y revocar los privilegios de `anon` (cierra A2).
4. `mercadopago_sellers` — `access_token_enc`, `refresh_token_enc`, `key_version SMALLINT`, `cloud_synced_at`. El drop de las columnas en claro va en una **segunda migración posterior**, una vez verificado: no se borran credenciales en el mismo deploy que las mueve.
5. `mercadopago_seller_handoff` (solo aplica en Cloud, se versiona igual) — buzón de traspaso con vencimiento.
6. `bar_sessions` — cambio de la clave de identidad (D6).

**Tipos compartidos**: `packages/shared/src/domain.ts` no necesita cambios — el tipo `Seller` sigue exponiendo el token en claro hacia adentro; el cifrado es un detalle del repositorio.

**Impacto en el sync y en el offline-first**: es el corazón del cambio. Hoy `mp_orders` no sube al cerrar la noche (A4) y el seller se lee de Cloud en cada cobro (A1). Después: el seller se lee de local siempre, se refresca solo desde local, y se empuja a Cloud como sync diferido con outbox por flag (`cloud_synced_at IS NULL`) — sin tabla de cola, porque hay una sola fila y Cloud es backup, no fuente de verdad. `mp_orders`, `mercadopago_cajas` y `mercadopago_cajas_devices` entran al push. **Cobrar deja de tocar internet salvo para llegar a Mercado Pago.**

### Real-time

Sin eventos SSE nuevos. Se conservan `mp.order.updated` y `bar-session.expired`, ambos ya integrados a la unión `DomainEvent` y emitidos por el `emit` inyectado — el patrón del repo se respeta. El único cambio es que la reconciliación del webhook deja de ser fire-and-forget, así que el `mp.order.updated` pasa a emitirse desde un camino que sobrevive un reinicio del proceso.

### Auth / permisos

Sin roles nuevos ni cambios en `UserPermissions`. Tres ajustes:

- **A12 (server-side)**: `mp-context.middleware.ts` deja de confiar en los headers `X-Bar-Id`/`x-device-id` del cliente y valida contra la sesión autenticada que esa barra/dispositivo le corresponden. Es la corrección de fondo — el frontend puede seguir mandando el header, pero deja de ser autoritativo.
- **Cookie `SameSite`**: revisar si el `Lax` que se puso para el redirect de OAuth sigue siendo necesario ahora que el callback aterriza en la Edge Function y no en el backend local. Si no lo es, vuelve a `Strict`.
- **`POST /api/mercadopago/oauth/pull-seller`** (endpoint nuevo, `admin`).

El desalojo por force-logout mantiene `requireRole("admin")`, que ya estaba bien.

### Riesgos

**Alto — el flujo de cobro con Posnet físico es el único probado en vivo.** Lo validado el 2026-07-13 fue el camino del fallback legacy (`env.MP_ACCESS_TOKEN`, nivel 3 del resolver).

> **Actualización (2026-07-21) — el estado del entorno cambió y la afirmación original ya no vale.** Una versión previa decía que las envs de OAuth estaban vacías y todo cobro salía por el nivel 3. Hoy es al revés: los cobros salen por el **nivel 2** (seller OAuth) — ver el bloque "Estado actual" al inicio.
>
> Que en la práctica no se haya notado es una casualidad: el seller que gana (el más viejo) resulta ser la misma cuenta que la del `MP_ACCESS_TOKEN` del `.env`, así que el token efectivo es equivalente. **No hay que apoyarse en esa casualidad** — es exactamente el riesgo R21.
>
> **Impacto en el PR 4**: el argumento "no se toca el fallback porque es el camino activo" ya no aplica — el camino activo es el OAuth. El fallback igual **se conserva** como red de seguridad (y A1b lo vuelve alcanzable), pero por precaución, no porque sea lo que está en uso.

Por eso: **el fallback a `MP_ACCESS_TOKEN` no se elimina en esta ronda.** El PR 4 cambia de dónde sale el token, que es justo el tipo de cambio con bugs sutiles posibles (token mal descifrado, seller que no bajó, migración a medias); si se borra la red de seguridad en el mismo entregable que cambia la fuente, el peor caso pasa de "cae al camino viejo que funciona" a "el boliche no cobra". Se elimina en una ronda posterior, recién con el camino nuevo validado contra el Posnet físico.

**Corolario del hallazgo A1b — el PR 4 tiene un trabajo extra que no estaba previsto**: no alcanza con leer el token de local. Hay que **hacer que el fallback sea alcanzable**, envolviendo el nivel 2 para que un fallo de red degrade al nivel 3 en vez de propagar la excepción. Hoy esa red de seguridad está desconectada.

> **Actualización 2026-07-22 (segunda pasada) — la red de seguridad no está rota, pero tampoco se
> puede dar por buena sin medirla.** La conclusión de la mañana ("la visibilidad de los devices Point
> es por aplicación de MP") **quedó refutada**: el mismo `MP_ACCESS_TOKEN` del `.env` que devolvía
> `total: 0` devuelve `total: 1` con el lector, una vez que el lector pasó a `PDV` con store y POS. Lo
> que había cambiado entre observaciones era el **estado del device**, no el token. Lo que queda en
> pie del hallazgo es más chico y más manejable: **la utilidad del nivel 3 depende de condiciones del
> entorno que la app no controla y hoy no observa** — que el token de la env sea de la misma cuenta
> que el lector, y que efectivamente lo vea. De ahí la estrategia **F1** del PR 4: el fallback se
> conserva y se vuelve alcanzable, pero su estado se **verifica al arrancar y se muestra**, en vez de
> prometerse.

**Gate obligatorio**: cobro real con el Posnet físico (el test de $15) al cerrar el PR 3 y al cerrar el PR 4 — este último **con la red hacia Supabase Cloud cortada a mano**, que es la única prueba de que D1 realmente funciona.

> **Actualización 2026-07-22 — el bloqueo de titularidad del Posnet SE RESOLVIÓ.** El lector
> `PAX_A910__SMARTPOS1493600985` ya está en la cuenta de Manuel (`1517393956`); ver el bloque "Estado
> actual" al inicio y el detalle en `ROADMAP.md` → "Remediación de la integración Mercado Pago". El
> gate del PR 3 **ya no depende de un tercero**, y los tres pasos manuales que faltaban —pasar el
> lector a **PDV**, asignarle store/POS y apuntar `MP_POS_DEVICE_ID` al device correcto— **ya se
> hicieron** (verificado el 22-07 en la segunda pasada; ver "Estado actual").
>
> Lo que este episodio deja como aprendizaje para la puesta en producción — el lector, el seller
> vinculado y la caja provisionada tienen que ser **de la misma cuenta de MP** (y el token de la env
> del fallback, también); la titularidad manda sobre el login (entrar como
> colaborador no cambia a qué cuenta entra la plata); el lector debe estar en modo **PDV**, no
> STANDALONE; y **OAuth da permiso sobre una cuenta, no posesión del hardware** — MP no expone ningún
> endpoint para reclamar ni transferir un lector, así que vincular por OAuth nunca "trae" el Posnet.
> Una vez que el lector ya está en la cuenta, sí: el token OAuth lo lista, lo pasa a PDV, crea
> store/POS y saca el QR estático. El flujo ideal ("el dueño configura su Posnet desde `/admin`") es
> alcanzable **con un único paso manual irreductible**. Los riesgos derivados quedaron como R22 (cajas
> huérfanas al cambiar de cuenta, ya materializado), R23 (el sistema no detecta la vinculación
> incoherente), R24 (visibilidad por aplicación), R25 (`operating_mode` local que miente) y R26
> (`MP_WEBHOOK_SECRET` vacía) en el roadmap.

**Alto — el cifrado puede dejar al boliche sin cobrar.** Un backfill fallido devuelve basura. Mitigación: el descifrado tolera token en claro durante al menos una versión, y el drop de las columnas viejas se difiere a una migración posterior.

**Medio — los timeouts pueden apretar de más.** La cajera espera a que el cliente pase la tarjeta. El timeout va sobre **cada llamada HTTP individual**, nunca sobre el polling del intent.

**Medio — D6 invalida sesiones vivas.** Cambiar la clave de identidad toca el constraint único: desplegar fuera de turno.

**La política de fallo del runner es fail-open** — el backend arranca aunque una migración falle. Se justifica porque cada migración es atómica (transacción única que incluye su propio registro), así que un fallo deja la base como estaba ayer, no corrupta; y negarse a arrancar convierte "una migración no aplicó" en "el boliche no cobra un sábado". **La contrapartida no es negociable**: log de error, singleton de estado expuesto en `/api/system/health`, y banner rojo persistente en `/admin`. Sin el banner, fail-open es indefendible.

**Supuesto no escrito que hay que documentar**: la garantía de "único escritor" del refresh descansa en que hay **un solo proceso Node** (`ARCHITECTURE.md` §7, el `EventEmitter` en proceso). Si algún día se corren dos instancias, A8 vuelve. Va documentado en el frente H.

**Deuda que se difiere deliberadamente**: los controllers nuevos que validan a mano en vez de usar el `validate.ts` con zod que ya existe (`mercadopago-provisioning.controller.ts` tiene 9 chequeos `typeof`). Es un refactor transversal que no cierra ningún criterio y toca justo los endpoints de cobro. Entra al roadmap como **R17**.

### Orden de ejecución

| PR | Contenido | Por qué es desplegable solo |
|---|---|---|
| **1** | Toggle Sandbox accesible (arregla 1 test), comentarios falsos | no toca runtime |
| **2** | Runner de migraciones + backfill + política de fallo + banner | schema idéntico al actual |
| **3** | Integridad del cobro (A3, timeouts, doble click, `mapMpStatus`, A10, A11, webhook) | cierra el bloque A completo |
| **4** | Inversión del token (D1/D2/D3) + modelo single-seller: vincular reemplaza + botón Desvincular (A17/A18/D9) + seguridad (A2, A12, `SameSite`) + salto de capa | cierra "cobrar sin Cloud" y "una sola cuenta, gestionable" |
| **5** | Sync (`mp_orders` con `event_id`, cajas, devices, restore) | aditivo |
| **6** | Sesiones de caja (D6) + cableado de `PdvSection` + migración de los 6 tests + docs | solo UI y operación |

El corte 3/4 es el único delicado: el PR 3 arregla idempotencia asumiendo que el token todavía viene de Cloud, y el PR 4 le cambia la fuente. Es tolerable porque el PR 3 no toca `credentials-resolver`.

**Nota sobre D7**: ver el matiz en la decisión D7 — 6 de los 7 tests migran a `PdvSection` en el PR 6; el séptimo (toggle Sandbox) se arregló en el PR 1.

### Alternativas consideradas

- **Revertir el merge** — descartado: perdería semanas de integración con MP que en buena parte está bien hecha (PKCE correcto, RPC atómica, HMAC timing-safe, exclusividad por constraint real).
- **CLI de Supabase como mecanismo de migración** — descartado; ver la tabla de opciones del anexo "Actualización de schema".
- **`postgres.js` en vez de `pg`** — descartado: `pg` ejecuta un `.sql` completo con múltiples statements en una sola llamada por protocolo simple, mientras que `postgres.js` tiene un parseo propio que puede tropezar con bloques `DO $$ ... $$`.
- **Backfill por manifiesto de "probes"** (una consulta por migración para detectar si ya se aplicó) — descartado a favor de **backfill por re-ejecución**: se auditan las 19 migraciones para que sean idempotentes y en el primer arranque se aplican todas. En una base nueva son no-ops; en la de dev, las 5 viejas son no-ops y las 14 nuevas se aplican de verdad. No hay mapeo a mano que se pueda equivocar, y satisface literalmente los criterios F ("correr dos veces = mismo resultado", "de cero == incremental").
- **Compartirle la clave de cifrado a la Edge Function** — descartado: guardar la clave en los secrets de Supabase, al lado del ciphertext en la misma base de Supabase, no protege contra el atacante que motiva el criterio E. De ahí el diseño de Cloud como buzón de traspaso y no como almacén.
- **Mutex in-process para el race del refresh (A8)** — descartado a favor de eliminarlo por construcción con el único-escritor de D1. Un mutex funciona, pero deja la clase de bug latente.
- **Embeber `PdvSection` dentro de `PagosSection`** — descartado: `PdvSection.tsx:188` tiene su propio `<h1>` y `PagosSection.tsx:247` también; embeber uno en otro produce dos `<h1>` en la misma página. Va como tab propio.
- **Fail-closed en el runner** (negarse a arrancar si una migración falla) — descartado por el análisis de riesgo de arriba.

### Cabo suelto identificado

Las **sesiones de barra** viven hoy embebidas en la tarjeta de PDV de `PagosSection` (`:369-399`, `handleForceLogout`). No son ni Pagos ni PDV: son operación de caja. Al repartir las cards hay que decidir dónde van — componente propio o `SistemaSection` — o como mínimo dejar registrado que la ubicación es de conveniencia. Se resuelve en `/tasks`.

---

## Tareas

> Derivadas del plan técnico. Agrupadas por los 6 PRs del orden de ejecución — cada PR es desplegable y verificable por separado. Tildá `- [x]` a medida que se completan. Los cambios grandes (PR 2, 4, 5) conviene hacerlos en **Plan Mode**.
>
> Convención de subagents: 🟦 `supabase-expert` · 🟩 `mercadopago-integrator` · 🟪 `e2e-playwright-tester` · 🟨 `expert-react-frontend-engineer` · sin marca = directo.

### PR 1 — Suite en verde + comentarios que mienten (no toca runtime)

- [x] 🟨 Arreglar el toggle Sandbox de `PagosSection.tsx:599-612`: convertirlo en un control accesible con nombre ("Sandbox") y `aria-pressed`/`role="switch"`, para que el test `persiste el toggle Sandbox` pase. **No** tocar la lógica de negocio.
- [x] Verificar que el test `persiste el toggle Sandbox al cambiarlo` pasa; los otros 6 de `PagosSection.test.tsx` (PDV/Posnet) quedan pendientes hasta PR 6 (se migran allá) — dejarlos explícitamente `skip` con un comentario que apunte a PR 6, para no dejar la suite roja.
- [x] Borrar el comentario mentiroso de `credentials-resolver.service.ts:66-67` que afirma un `FOR UPDATE` inexistente. No reemplazar por otra promesa de lock.
- [x] `pnpm typecheck` + `pnpm test` en verde.

### PR 2 — Runner de migraciones (schema idéntico, sin cambio observable)

- [x] Sumar dependencia `pg` + `@types/pg` a `apps/api`.
- [x] 🟦 Auditar las 19 migraciones existentes en `supabase/migrations/` y dejarlas todas idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, guardas `DO $$`). Documentar cuáles ya lo eran.
- [x] 🟦 Migración nueva `schema_migrations` (version TEXT PK = nombre de archivo, checksum sha256, applied_at, duration_ms, applied_by) con `REVOKE ALL FROM anon, authenticated`.
  > Implementado como **bootstrap idempotente en código** (constante en `pg-migrations.repository.ts`), no como `.sql`: una migración que se registra a sí misma es circular. El REVOKE se re-asegura al final de cada corrida porque las migraciones legacy hacen `GRANT ALL ON ALL TABLES` a `anon` (deuda anotada).
- [x] `apps/api/src/infra/migrations/pg-migrations.repository.ts` — único lugar con `pg`: conexión por `DATABASE_URL` (nueva env, default `postgres://postgres:postgres@127.0.0.1:54322/postgres`), `pg_advisory_lock`, ejecución de cada `.sql` completo en una transacción con su registro, `pg_advisory_unlock`.
- [x] `apps/api/src/infra/migrations/migration-runner.ts` — orquestación: lista archivos ordenados, filtra aplicados, aplica pendientes; convención `-- migrate:no-transaction` en 1ª línea para DDL no transaccional. Backfill por re-ejecución (primer arranque aplica todas con `applied_by='baseline'`).
- [x] `apps/api/src/infra/migrations/migrations-status.ts` — singleton `{ pending, failed, drift }`.
- [x] Integrar en `apps/api/src/server.ts` dentro de `boot()`, después de `ensureDatabaseConnection()` y antes de `pullMasterData`, en `try/catch` que **nunca** re-lanza (fail-open).
- [x] Exponer el estado en `GET /api/system/health` (leer el singleton desde `systemService`).
- [x] 🟨 Banner rojo persistente en `/admin` cuando `pending`/`failed`/`drift` — la contrapartida no negociable del fail-open.
- [x] Quitar las 19 líneas de migraciones de `docker-compose.yml:57-79`; dejar solo `01-roles.sql` y `02-jwt.sql`.
- [x] **Verificación**: correr el runner sobre la DB local actual (8 tablas viejas) → aplica las 14 nuevas conservando 29 tragos + 109 noches. Correrlo dos veces seguidas → idéntico, sin fallar. Comparar con una DB creada de cero (mismo schema).
- [x] `pnpm typecheck` + tests del runner.

### PR 3 — Integridad del cobro (cierra el bloque A)

- [x] 🟦 Migración: UNIQUE en `mp_orders` sobre `order_id_mp`, `external_ref`, `idempotency_key` (A3).
- [x] 🟦 Migración: `ALTER TABLE mp_orders ADD COLUMN event_id UUID REFERENCES night_events(id)` + índice (prerrequisito del sync — PR 5).
- [x] 🟩 `mercadopago-orders.service.ts`: idempotency key **estable** por cobro (no `randomUUID()` por request) → evita doble cobro por doble click.
- [x] 🟩 `mercadopago-orders.service.ts`, `-provisioning.service.ts`, `-oauth.service.ts`, `mercadopago.service.ts` (`pointApiRequest`): `AbortSignal.timeout` en toda llamada a MP (A9). Sobre cada HTTP individual, **nunca** sobre el polling del intent.
- [x] 🟩 `mercadopago-orders.service.ts:mapMpStatus`: no mapear estados desconocidos a `"created"` — distinguir `failed`/`action_required` de "en curso".
- [x] 🟩 `mercadopago-webhooks.service.ts`: reemplazar el `setImmediate` fire-and-forget por un camino que sobreviva un reinicio (deja constancia recuperable); agregar ventana de frescura del `ts` en la validación de firma (anti-replay).
- [x] 🟨 `useCheckout.ts`: timeout de cliente honrando el `expiresAt` del backend (A10); si el registro del pedido falla tras confirmar el cobro, dejar constancia recuperable en vez de descartar (A11).
- [x] 🟩 Poblar `mp_orders.event_id` al crear la order desde el evento abierto.
- [x] 🟪 **Gate PASADO (2026-07-22)**: cobro real con el Posnet físico en PDV, aprobado y con ticket impreso (sale por el seller OAuth, nivel 2 del resolver). La misma jornada cerró además R27 (`cobro-verificado.md`, `done`): un rechazo real ya no genera venta.
- [x] `pnpm typecheck` + tests.

### PR 4 — Inversión del token + modelo single-seller + seguridad

- [x] 🟦 Migración: `mercadopago_sellers` + `access_token_enc`, `refresh_token_enc`, `key_version SMALLINT`, `cloud_synced_at`. (El `DROP` de las columnas en claro va en una migración **posterior**, ya verificado.) → las 3 migraciones del PR quedaron como `20260723000000..000200`.
- [x] 🟦 Migración: `mercadopago_seller_handoff` (buzón de traspaso, aplica en Cloud, se versiona igual).
- [x] 🟦 Migración: habilitar RLS + revocar `anon` en `bars` (A2).
- [x] 🟩 Cifrado app-level (AES-256-GCM, `HKDF-SHA256` con `MP_TOKEN_SECRET ?? AUTH_SECRET`, salt por fila): cifrar/descifrar en `mercadopago-sellers.repository.ts:mapRow` — el tipo `Seller` sigue exponiendo el token en claro hacia adentro. Descifrado **tolerante a token en claro** durante una versión (backfill). → verificado en vivo tras la re-vinculación: token con prefijo `v1.`, columnas en claro `NULL`.
- [x] 🟩 `mercadopago-sellers.repository.ts:76,101,116,140`: cambiar `mpDb` → `supabase` (local). Eliminar `mpDb` de `shared/supabase.ts:27` (A1).
#### Estrategia F1 — el fallback se degrada, pero se mide; nunca se promete a ciegas

> **Reemplaza** a la tarea "envolver el nivel 2 para que un fallo de red degrade al nivel 3" tal como
> estaba escrita al 2026-07-21, y también a su parche del 22-07 por la mañana ("…con el requisito de
> que el `MP_ACCESS_TOKEN` sea de la misma aplicación de MP que el lector"). **Por qué se rehace**:
> la primera versión vendía el nivel 3 como una red de seguridad equivalente, cosa que nunca se había
> comprobado; la segunda lo declaró inservible salvo con un token de la misma aplicación, y **eso
> quedó refutado el mismo día** — el mismo token del `.env` que devolvía `total: 0` devuelve el lector
> una vez que el lector pasó a `PDV` con store y POS (ver "Estado actual" y "Notas de método"). Las
> dos formulaciones compartían el mismo defecto de fondo: **afirmaban algo sobre el fallback sin que
> el sistema tuviera forma de saberlo**. F1 corrige eso — no adivina si el fallback sirve, lo
> **verifica y lo muestra**.
>
> **Punto de partida (D1 ya implementado)**: post-D1 el seller y su token viven en la base **local**,
> así que el nivel 2 **ya no depende de Cloud**. Un fallo del nivel 2 deja de significar "se cayó
> internet" y pasa a significar una de estas cinco cosas: (1) nunca se vinculó ningún seller,
> (2) el seller local se borró o se corrompió, (3) el token no se pudo descifrar (`MP_TOKEN_SECRET`
> rotada, backfill a medias — el riesgo que D3 ya reconoce), (4) el seller está `inactive` o sin
> `refresh_token`, (5) el refresh contra MP falló. Solo el (5) necesita internet, y ahí el nivel 3
> tampoco salva nada, porque cobrar necesita llegar a MP igual.
>
> **Para qué queda sirviendo el nivel 3, entonces.** Para los casos (1) a (4), que son reales y
> ninguno es exótico: una instalación nueva que todavía no vinculó por OAuth; y sobre todo **el
> restore de emergencia**, porque D3 dice explícitamente que un restore desde Cloud **no recupera el
> token** — o sea que después de romperse el disco de la mini-PC, el `MP_ACCESS_TOKEN` de la env es
> literalmente lo único que puede cobrar hasta que un admin re-vincule por OAuth. Ese es el escenario
> que justifica conservarlo.
>
> **Y por qué hay que medirlo igual.** Que el fallback sea alcanzable no dice nada sobre si es
> **utilizable**: sigue dependiendo de dos condiciones que la app hoy no observa — que el token sea de
> la misma **cuenta** de MP que el lector, y que ese token efectivamente **vea** el `MP_POS_DEVICE_ID`
> configurado. Ambas se pueden comprobar con dos `GET` de solo lectura, sin cobrar y sin tocar nada.

- [x] 🟩 **F1.a — degradar en vez de propagar, distinguiendo las dos clases de fallo.** En `credentials-resolver.service.ts:34-36`, envolver la llamada al nivel 2 (A1b — hoy `findFirstActive()` **lanza** en vez de devolver `null`, `mercadopago-sellers.repository.ts:126-129`, y la excepción se propaga dejando el nivel 3 inalcanzable). Dos caminos distintos:
  - **"No hay seller" (`null`)** → cae al nivel 3 como hoy, sin ruido: es el estado normal de una instalación sin vincular.
  - **"Hay seller pero algo falló" (excepción)** → cae al nivel 3 **y loguea `WARN` con la causa** (`"cobrando por el fallback de env porque <causa>"`), más un flag en el estado de salud. Nunca en silencio: cobrar por la env cuando hay un seller vinculado puede mandar la plata a otra cuenta (R21/R22).
  - **No** eliminar el fallback legacy (ver Riesgos).
- [x] 🟩 **F1.b — guarda de cuenta: no degradar hacia otra cuenta de MP.** Si hay un seller local con `user_id` conocido y el `MP_ACCESS_TOKEN` de la env pertenece a **otra cuenta**, el resolver **no degrada**: lanza un error accionable (*"el token de emergencia es de otra cuenta de Mercado Pago; la plata iría a `<user_id>`"*). La cuenta del token de la env se obtiene con `GET /users/me` en el preflight (F1.c) y se cachea — no se consulta por cobro. Si el preflight no pudo determinarla, se aplica el criterio conservador: **no degradar** y decirlo.
- [x] 🟩 **F1.c — preflight del fallback al boot** (`mp-fallback-preflight.ts`, mismo patrón que `migrations-status.ts` del PR 2). Si hay `MP_ACCESS_TOKEN`, dos `GET` de solo lectura, no destructivos, con el timeout de MP ya existente:
  - `GET /users/me` → `user_id` de la cuenta del token.
  - `GET /point/integration-api/devices` → ¿figura `MP_POS_DEVICE_ID` en el listado?, ¿con qué `operating_mode`?
  Resultado en un singleton `{ status: "usable" | "unusable" | "unknown", tokenUserId, deviceSeen, operatingMode, reason, checkedAt }`. `unknown` cubre "sin `MP_ACCESS_TOKEN`", "sin internet al arrancar" y "MP no respondió". **Nunca bloquea el arranque** (fail-open, igual que el runner de migraciones) y **nunca loguea el token**. Re-evaluable on-demand desde el endpoint de health.
  > Ojo con el alcance de lo que prueba: el listado es un `GET`, y **crear un payment intent es un `POST`**. Que el token liste el device es condición necesaria, no demostradamente suficiente — la doc de MP pide crear la aplicación con el tipo de solución **"Pagos presenciales"** ([Crear aplicación](https://www.mercadopago.com.br/developers/es/docs/mp-point/create-application)) y **no está determinado** si una app de otro tipo falla recién en el `POST`. Lo único que cierra esa pregunta es un cobro real con el token de la env (ver el gate). El preflight se declara como "no encontré motivo para que no sirva", no como "sirve". **→ Pregunta CERRADA el 2026-07-22 por el modo 3 del gate: el `POST` funciona (ver el changelog).**
- [x] 🟩 **F1.d — exponerlo donde se ve.** El estado del preflight sale en `GET /api/system/health` y como fila del panel de salud de la vinculación de [`gestion-posnets.md`](./gestion-posnets.md) (R23): *"Fallback de emergencia (`MP_ACCESS_TOKEN`): ve el lector `…985` en modo PDV / **no lo ve** / es de otra cuenta / no verificado"*. Si el estado es `unusable` y hay Posnet configurado, **aviso persistente en `/admin`** — amarillo, no rojo: es una red de seguridad degradada, no el camino activo caído. **Esta es la parte que evita descubrirlo un sábado a la noche**, y es la contrapartida no negociable de conservar el nivel 3.
- [x] 🟩 **F1.e — tests del resolver** (hoy `credentials-resolver.service.test.ts` no cubre ninguno de estos caminos): nivel 2 devuelve `null` → usa nivel 3 sin warn · nivel 2 lanza y el token de la env es de la misma cuenta → usa nivel 3 **con** warn · nivel 2 lanza y el token de la env es de otra cuenta → **no** degrada, error accionable · sin `MP_ACCESS_TOKEN` → error accionable que dice qué falta.
- [x] **F1.f — documentar la env.** En `.env.example`, `MP_ACCESS_TOKEN` deja de figurar como "credencial de MP" y pasa a estar rotulada como **fallback de emergencia**: para qué sirve (instalación nueva sin OAuth y **restore sin token**, por D3), qué tiene que cumplir (misma **cuenta** de MP que el lector; que el lector figure en su listado de devices) y dónde se verifica (health + `/admin`). Dejar registrada también la pregunta abierta sobre el tipo de solución de la aplicación *(pregunta que el modo 3 del gate cerró el mismo día)*.
- [x] 🟩 `mercadopago-oauth.service.ts:129:refreshTokenIfNeeded`: persistir local y devolver de inmediato; marcar `cloud_synced_at IS NULL`. Único escritor → cierra A8 por construcción.
- [x] 🟩 Bajada cloud→local del seller: endpoint `POST /api/mercadopago/oauth/pull-seller` (admin), + intento en el boot (`pullMasterData` si no hay seller local) + lazy en `getSellerStatus`. → verificado en vivo: la re-vinculación bajó el handoff, lo re-cifró y lo consumió.
- [x] 🟩 **Modelo single-seller (D9/A17)**: al completar un OAuth nuevo, desactivar/borrar el seller anterior — nunca 2 activos. Corregir `findFirstActive` para que no dependa del orden por fecha. → garantizado además por **índice único parcial** sobre sellers activos (creado también en Cloud vía `pr4-cloud.sql`); cierra R21.
- [x] 🟩 **Desvincular (D9/A18)**: endpoint `DELETE /api/mercadopago/oauth/seller` (admin) que borra el seller en local + Cloud + handoff si quedó.
- [x] 🟩 Edge Function `mp-auth-callback/index.ts`: dejar de escribir tokens en `mercadopago_sellers` de Cloud; escribir metadata no secreta + handoff cifrado con `MP_HANDOFF_KEY`. → EF **deployada** vía CLI y `MP_HANDOFF_KEY` seteado; en Cloud quedó solo metadata.
- [x] 🟩 `mercadopago-provisioning.service.ts:293-325`: reemplazar el `supabase.from()` directo por `sellersRepo.upsert()` inyectado (el salto de capa se disuelve con `mpDb` local).
- [x] `mp-context.middleware.ts` + backend: validar `X-Bar-Id`/`x-device-id` contra la sesión autenticada (A12) — el header deja de ser autoritativo. → con un fix en vivo durante el gate: la primera versión comparaba `x-bar-id` solo contra `BAR_CODE` y la web manda el UUID → 403 en todo cobro; `00e6ac6` acepta code o UUID con lookup cacheado (ver el changelog).
- [x] Revisar si el `SameSite=Lax` de `session.ts:59,64` sigue siendo necesario ahora que el callback aterriza en la Edge Function; si no, volver a `Strict`. → **resuelto: se conserva `Lax`, documentado** — `Strict` rompería el aterrizaje del redirect de OAuth (la navegación desde MP llegaría sin cookie de sesión).
- [x] 🟨 UI: botón "Desvincular" en la tarjeta de OAuth de `PagosSection.tsx`.
- [x] Envs nuevas en `.env.example`: `MP_TOKEN_SECRET`, `MP_TOKEN_SECRET_PREVIOUS` (opcional), `MP_HANDOFF_KEY` (secret de la Edge Function). (`DATABASE_URL` ya está desde el PR 2 y `API_PROXY_TARGET` desde `d3fd06f` — quedan solo las 3 de MP.) Además, re-rotular `MP_ACCESS_TOKEN` como fallback de emergencia — ver **F1.f**.
- [x] 🟩 **Saneamiento inicial de sellers**: antes/al desplegar, desvincular las DOS filas activas preexistentes en Cloud (cuenta de prueba de Manuel `1517393956` + la del otro desarrollador `225043369` — ninguna es la del dueño). El botón Desvincular de A18 es la herramienta; sin esto, "vincular reemplaza" solo protege vinculaciones futuras. → hecho el 2026-07-22 con `pr4-cloud.sql` en el dashboard: ambos sellers expirados, verificado por REST; después se re-vinculó la cuenta de Manuel por OAuth con el flujo nuevo (único seller activo).
- [x] 🟩 **Cajas huérfanas al cambiar de cuenta (R22)**: Desvincular debe avisar (o limpiar) las cajas provisionadas del seller saliente — su store/pos/QR viven en la cuenta vieja y el QR CAMBIA al re-provisionar. Mínimo: aviso en la UI + doc del procedimiento de re-provisión. → resuelto por el mínimo: aviso en la UI + procedimiento documentado.
- [x] 🟩 **Purga de tokens en claro en Cloud**: las filas actuales de `mercadopago_sellers` en Cloud ya contienen access/refresh tokens en claro; el diseño post-PR 4 dice que en Cloud no debe quedar token legible. Purgarlos al migrar al handoff (no alcanza el DROP local diferido). → hecho en `pr4-cloud.sql`; verificado por REST que no queda token legible en Cloud.
- [x] 🟪 **Gate crítico PASADO (2026-07-22)**: cobro real con el Posnet físico **con la red a Supabase Cloud cortada a mano** — debe cobrar igual (prueba de que D1 funciona). Tres modos, y el tercero es el que cierra la pregunta abierta de F1.c:
  1. **Seller vinculado, Cloud inalcanzable** → cobra por el nivel 2 leyendo de local. Es la prueba de D1. **✅ PASADO**: con Cloud cortado por `/etc/hosts`, el circuito completo funcionó — intent creado, device despierto, veredicto resuelto contra MP y persistido. Se probó con la tarjeta sin fondos: el **rechazo** llegó hasta el final del circuito, lo que prueba todo el camino; el camino **aprobado** ya se había probado el mismo día ($101).
  2. **Cloud apagado del todo** (proyecto pausado) → idéntico al anterior; ningún request sale hacia el host de Cloud durante el cobro. *(Equivalente al modo 1 por construcción — con el host inalcanzable ya se verificó que nada del camino del cobro toca Cloud.)*
  3. **Sin seller local, solo `MP_ACCESS_TOKEN`** → **este modo se corre sí o sí**, porque es el único que prueba que el nivel 3 puede *cobrar* y no solo *listar*. Precondición: el preflight (F1.c) debe reportar `usable`; si reporta `unusable`, el gate se cierra dejando **registrado por escrito** que el fallback no es utilizable en este entorno y por qué, en vez de darlo por bueno. Con el `MP_ACCESS_TOKEN` que hay hoy en `apps/api/.env` la precondición **se cumple**: verificado el 22-07 que ese token (app `4126722482739227`, cuenta `1517393956`) lista `PAX_A910__SMARTPOS1493600985` en modo PDV. **✅ PASADO**: con el seller local expirado temporalmente, el intent `15d5650d…` de $15 se creó a las 23:57 UTC con el token de emergencia — **el nivel 3 puede crear payment intents y cobrar**; la pregunta del tipo de solución de la aplicación quedó cerrada (ver el changelog).
  > Registrar el resultado del modo 3 en el changelog de esta spec: es el dato que falta para saber si el tipo de solución de la aplicación importa o no. *(Registrado — entrada del 2026-07-22.)*
- [x] `pnpm typecheck` + tests. → 678 tests unit en `apps/api` + 399 en `apps/web`, typecheck en verde.

> ⚠️ Las referencias de línea de este bloque (y las del plan técnico para estos archivos) son anteriores al PR 3 — `mercadopago-oauth.service.ts` y `mercadopago-provisioning.service.ts` fueron modificados; re-verificar offsets antes de usarlas como guía.

### PR 5 — Conciliación / sync (aditivo)

> ✅ **Cerrado el 2026-07-24** — plan técnico:
> [`2026-07-24-pr5-sync-design.md`](../../plans/mercadopago/2026-07-24-pr5-sync-design.md);
> backend `93b0e8e`, frontend `62619b8`, `pr5-cloud.sql` convergente `f27a0c0`. Gate físico pasado
> el mismo día — detalle y episodios en el changelog.

- [x] 🟦 `cloud-sync.repository.ts`: métodos `pushSellerMetadata()`, `pushMpCajas()`, `pushMpDevices()`, `pushMpOrders()`, `pullSellerHandoff()`. → `93b0e8e`. El `pullSellerHandoff()` del enunciado **ya existía desde el PR 4 como `pullSellerFromCloud()`** — se registró la correspondencia en vez de duplicarlo.
- [x] 🟩 Enganchar el push de `mp_orders` (por `event_id`), cajas y devices al cierre de noche (`events.service` → sync en background), junto con orders/tickets. → `93b0e8e`: `pushEventData` sube las tablas MP junto con la noche.
- [x] 🟩 Push diferido del seller (outbox por `cloud_synced_at IS NULL`) en el tick de sync. → `93b0e8e`; verificado en el gate: `cloud_synced_at` estampado en el outbox local tras el push de la metadata.
- [x] 🟩 `restoreFromCloud()`: incluir config MP (cajas, devices, cobros). Tokens **excluidos** explícitamente (D3) — documentar que hay que re-vincular tras un restore. → `93b0e8e` (backend) + `62619b8` (frontend: filas "Cajas MP / Posnets / Cobros MP" en el restore de `SistemaSection` + aviso D3 de re-vincular por OAuth).
- [x] 🟪 **Verificación**: cerrar una noche con cobros MP → aparecen en Cloud. Restore → cajas/devices/cobros vuelven. → **Gate PASADO (2026-07-24)**: cobro real de **$101** con el Posnet (`processed/approved`, intent con `event_id`) → cierre de noche → push verificado por REST en Cloud (`mp_orders` con `event_id`, `mercadopago_cajas` `COCKTRAILBAR01`, `mercadopago_cajas_devices` con el PAX activo en PDV, metadata del seller con `access_token: null`) → restore ejecutado desde `/admin` por Manuel: filas MP recuperadas + aviso de re-vincular OK.
- [x] `pnpm typecheck` + tests. → verde: 837 tests unit en `apps/api` + 467 en `apps/web`.

### PR 6 — Sesiones de caja + cableado de PDVs + docs

> ✅ **Implementado vía la feature `gestion-posnets`** (2026-07-23): T19 entregó las sesiones de caja
> (D6) y el cableado de PDVs (`09237a4` backend + `a5f9542` frontend); T26 entregó los docs
> (`6f7b078` + `68ed32f`). Checklist tildada retroactivamente el 2026-07-24 con la evidencia
> verificada contra el código.

- [x] 🟦 Migración: cambio de la clave de identidad de `bar_sessions` (D6) — desplegar fuera de turno (invalida sesiones vivas). → `supabase/migrations/20260724000100_bar_sessions_identity.sql` (`09237a4`, T19).
- [x] `bar-sessions.service.ts:7-9`: la identidad deja de incluir `deviceId`; deriva de la sesión autenticada (A5/A7). → `identityFor(user)` en `bar-sessions.service.ts:55`: identidad `rol:username` derivada de la sesión autenticada, sin `deviceId` por pestaña — reentrar siempre devuelve la propia caja.
- [x] `app.ts:205`: sacar la construcción de identidad de la capa de composición (mover a `BarSessionsService`); el logout libera la caja de verdad. → `app.ts` ya solo llama `barSessionsService.leave(user)`; la identidad vive en el service.
- [x] 🟨 `apps/web/src/services/bar-sessions.service.ts:37-45`: eliminar el UUID por pestaña. → eliminado; el cliente ya no manda identidad propia (`a5f9542`).
- [x] 🟨 Cablear `PdvSection` como **tab propio** en `AdminClient.tsx` (no embebido — evita doble `<h1>`). Migrar las Cards 2 (PDV/QR) y 3 (Posnets) de `PagosSection` a `PdvSection`; borrar la tarjeta "Sucursal" duplicada de `PdvSection.tsx:224-252`. Decidir dónde va el bloque de sesiones de barra (`PagosSection.tsx:369-399`) — no es Pagos ni PDV. → tab «PDV y Posnets» en `AdminClient.tsx` (`a5f9542`); las sesiones de barra quedaron en `PdvSection` (`handleForceLogout`), junto a la caja que gestionan.
- [x] 🟨 Renombrar `PdvFormModal.tsx` → `PdvFormPanel.tsx`; accesibilidad de panel lateral (labels asociadas, `Escape` cierra, foco inicial y retorno, **sin** focus trap). → `PdvFormPanel.tsx` (`a5f9542`).
- [x] 🟨 `PagosSection.tsx`: arreglar `handleTestCharge` (pasar el `deviceId`, `:182`), renderizar `testResult` (`:57,:183`), y el `catch {}` que traga fallos de carga (`:107`). → resuelto por eliminación: `handleTestCharge`, `testResult` y el `catch {}` ya no existen en `PagosSection.tsx` — la gestión de Posnets vive en el flujo nuevo de `gestion-posnets`.
- [x] 🟨 Migrar los 6 tests de PDV/Posnet de `PagosSection.test.tsx` a `PdvSection.test.tsx` (des-skipear los de PR 1). Sumar tests de `PdvSection`/`PdvTable`/`PdvFormPanel` (hoy sin ninguno). → `PdvSection.test.tsx`, `PdvTable.test.tsx` y `PdvFormPanel.test.tsx` existen; `PagosSection.test.tsx` quedó sin ningún `skip`.
- [x] **Docs**: actualizar `docs/ARCHITECTURE.md` (modelo de datos MP, flujo OAuth con Edge Function, resolución de credenciales local-first, sesiones de caja, runner de migraciones — corregir §2 sobre internet y §9/§217 sobre init-scripts). → hecho vía T26 de `gestion-posnets` (`6f7b078`); §11 documenta la integración MP y §9 el runner.
- [x] **Docs**: actualizar `docs/ROADMAP.md` (cerrar/reformular R14 y R15; sumar R17 —validación con zod en controllers nuevos— y lo que no se resuelva acá). (R17-R23 ya cargados en el ROADMAP el 21-07.) → hecho vía T26 (`6f7b078` + `68ed32f`).
- [x] **Docs**: `CLAUDE.md` — módulos nuevos (bar-sessions, infra/migrations) y convenciones. Documentar el supuesto "único proceso Node" del que depende el cierre de A8. → hecho vía T26: `CLAUDE.md` quedó reescrito delegando la arquitectura en `ARCHITECTURE.md` (fuente de verdad) y conserva la regla del único proceso Node (no serverless/edge).
- [x] **Docs**: cerrar la Fase 1 de MP en `docs/fases-mp/INDEX.md` (E2E cloud validado esta sesión). Considerar renombrar las fases MP para no colisionar con las del roadmap ("Fase 6" ambigua). → **superado**: `docs/fases-mp/` (y `docs/mp/`) se borraron en la consolidación de specs (`84a2fb3`) — ya no hay índice que cerrar ni fases que renombrar.
- [x] 🟪 Verificación E2E completa de los 4 flujos + SSE. → cubierta, con alcance acotado, por los gates físicos de `gestion-posnets` del 2026-07-23 (T11, T14, T28, T29 con el Posnet real): T28 verificó el E2E de caja/admin; `/carta` y `/barra` siguen **fuera de validación hasta la Fase 7** (decisión ya registrada en el ROADMAP).
- [x] `pnpm typecheck` + `pnpm test` en verde en todo el repo. → 814 tests unit en `apps/api` + 466 en `apps/web`, typecheck en verde (cierre de `gestion-posnets`, 2026-07-23).

### Cierre

- [ ] Migración posterior: `DROP COLUMN access_token, refresh_token` de `mercadopago_sellers` (una vez verificado el cifrado en producción — no en el mismo deploy que las mueve). → **sigue diferida a conciencia, único resto vivo de la spec** (2026-07-24): el cifrado ya está verificado en vivo desde el 22-07 (token `v1.`, columnas en claro `NULL`), pero el DROP procede recién tras un período de operación estable con el camino cifrado — a más tardar, antes del deploy de producción de la Fase 6.
- [x] Actualizar el estado de la spec a `implementada` y registrar en `ROADMAP.md`. → hecho el 2026-07-24, junto con el cierre del PR 5.

> **Recordatorio**: PR 2, 4 y 5 son grandes — usar **Plan Mode**. Los gates 🟪 de PR 3 y PR 4 (cobro con Posnet físico real) son **bloqueantes**: no cerrar el PR sin pasarlos, y el de PR 4 con la red a Cloud cortada.

---

## Changelog de correcciones

Correcciones que se integraron directamente al texto (la versión corregida es la que se lee arriba); acá queda el registro de qué decía la versión previa.

- 2026-07-20 — G/focus-trap: el criterio original pedía focus trap ("se comporta como un diálogo real"); `PdvFormModal` es un panel inline, un trap sería anti-WAI-ARIA.
- 2026-07-20 — D2/FK "entre bases": la spec decía que la clave foránea "apunta a otra base"; la FK siempre fue intra-base — lo que cruzaba bases era la lectura (`mpDb` → Cloud).
- 2026-07-20 — D3/cifrado: la formulación original ("clave derivada del `AUTH_SECRET`") se descartó por acoplar la rotación de la cookie con poder cobrar y por no resolver la Edge Function; el diseño vigente (buzón de traspaso + `MP_TOKEN_SECRET`) pasó al cuerpo de D3.
- 2026-07-20 — Backfill/`bars_code.sql`: la spec afirmaba que `20260719000000_bars_code.sql` no era idempotente; sí lo es (seed con `WHERE NOT EXISTS`), lo que habilitó el backfill por re-ejecución.
- 2026-07-21 — A17/verificación en vivo: la cuenta vinculada el 20-07 no era "la del dueño real" sino la cuenta de prueba de Manuel (`1517393956`); la cuenta del dueño del boliche nunca se vinculó, y el borrado manual de la fila vieja no fue definitivo.
- 2026-07-22 — **PR 4 / fallback al nivel 3**: la tarea decía, sin matices, "envolver el nivel 2 para que un fallo de red **degrade** al nivel 3 (`env.MP_ACCESS_TOKEN`) en vez de propagar (A1b)", y el bloque de Riesgos vendía ese fallback como red de seguridad equivalente para el Posnet. Se corrigió porque se verificó contra la API real que **la visibilidad de los devices Point es por aplicación de MP, no solo por cuenta**: el token de la env (app `4126722482739227`, misma cuenta `1517393956`) devuelve `total: 0` en `GET /point/integration-api/devices`, mientras que el de `MP_APP_ID=2990738606457276` sí ve el lector. La tarea **no se borró** —degradar en vez de propagar sigue siendo correcto— pero ahora lleva adosado el requisito de **misma aplicación** y la aclaración de que sin eso **no salva el cobro por Posnet** (R24). **⛔ Superada el mismo día**: ver la entrada "R24 REFUTADO" más abajo — el requisito de misma-aplicación resultó falso y la tarea se rehizo como estrategia F1.
- 2026-07-22 — **Estado actual / gate físico**: decía "Gate físico bloqueado: los 2 lectores Point están registrados en la cuenta del otro desarrollador… hasta que él los dé de baja". **Ya no es cierto**: el 22-07, operando como colaborador en la cuenta de Matías (`225043369`), la opción "Eliminar el lector de mi cuenta" **transfirió** `PAX_A910__SMARTPOS1493600985` a la cuenta personal de Manuel (`1517393956`) — verificado por API con el `total` del listado de devices pasando de 2→1 y de 0→1 respectivamente. El gate ya no depende de un tercero; lo que falta es pasar el lector a PDV, asignarle store/POS y corregir `MP_POS_DEVICE_ID`.
- 2026-07-22 — **`MP_POS_DEVICE_ID`**: la spec no registraba a qué lector apuntaba. Apunta a `PAX_A910__SMARTPOS1494025317`, que es el que **quedó en la cuenta de Matías**, no el que ahora es de Manuel (`…1493600985`). Cualquier gate corrido sin corregir esa env estaría probando contra el aparato equivocado.
- 2026-07-22 — **Bloque B (local-first)**: los criterios daban por equivalente "degrada al fallback local" y "cobra sin Cloud". Se agregó un criterio explícito de misma-aplicación para el `MP_ACCESS_TOKEN` y una nota de alcance, por el mismo motivo que la corrección del PR 4. **⛔ Superada el mismo día**: ese criterio se reemplazó por los de F1 (guarda de **cuenta** + preflight visible) al refutarse la regla de misma-aplicación.
- 2026-07-22 (segunda pasada) — **R24 / "visibilidad por aplicación": REFUTADO, y la tarea del PR 4 rehecha como estrategia F1.** La versión de la mañana afirmaba, en "Estado actual", en las notas de método, en el bloque B, en Riesgos y en la tarea del PR 4, que **la visibilidad de los devices Point es por aplicación de Mercado Pago**, y de ahí derivaba que el nivel 3 del resolver no podía cobrar con Posnet salvo con un token de la misma aplicación que el lector. Se re-verificó contra la API real el mismo día, más tarde: **con el mismo `MP_ACCESS_TOKEN` del `.env`** —sin tocarlo, sigue teniendo `4126722482739227` como `client_id` embebido y `1517393956` como user, y `MP_APP_ID` sigue siendo `2990738606457276`— `GET /point/integration-api/devices` devuelve ahora `total: 1` con `PAX_A910__SMARTPOS1493600985`, `operating_mode: "PDV"`, `store_id: "85068168"`, `pos_id: 135641665`. Lo que cambió entre las dos observaciones **no fue el token sino el estado del device**, que pasó de `STANDALONE / pos_id: 0 / store_id: ""` a PDV con store y POS (creados el 22-07 ~02:07 ART). Las dos observaciones originales variaban dos cosas a la vez y se le atribuyó el efecto a la equivocada. La referencia oficial del endpoint tampoco menciona la aplicación: devuelve *"los dispositivos Point disponibles asociados a **tu cuenta**"*. **Qué reemplaza a qué**: la tarea del PR 4 pasa a ser la estrategia **F1** (degradar distinguiendo las dos clases de fallo · guarda de cuenta para no cobrar hacia otra cuenta · preflight de solo lectura al boot · exposición en health y `/admin` · tests · `.env.example`), que no afirma nada sobre el fallback sino que lo **mide y lo muestra**. Los criterios del bloque B se reformularon en consecuencia. **Queda abierto**: por qué el token OAuth sí listaba el lector en STANDALONE y el de la env no (distinguirlo exige una prueba destructiva sobre el único aparato), y si el tipo de solución de la aplicación ("Pagos presenciales") afecta el `POST` de payment intent aunque el `GET` funcione — lo cierra el modo 3 del gate del PR 4.
- 2026-07-22 (segunda pasada) — **`MP_POS_DEVICE_ID` y los pasos manuales del gate**: la spec decía que la env apuntaba al lector equivocado (`…1494025317`, el que quedó en la cuenta de Matías) y que faltaba pasar el lector a PDV y asignarle store/POS. **Los tres ya están hechos** y verificados contra la API. Se actualizaron "Estado actual", el gate del PR 3 y el callout de Riesgos.
- 2026-07-22 (segunda pasada) — **Bloque B, criterios 1 y 2**: decían "dado que no hay internet, el cobro con Posnet funciona igual" y "dado que Cloud está caído… el cobro se concreta", sin decir cómo se comprueban. El primero era literalmente inverificable —cobrar con tarjeta siempre exige llegar a `api.mercadopago.com`, cosa que D1 ya aclaraba en su texto pero el criterio contradecía—. Se reformularon para hablar de **conectividad hacia Cloud** (que es lo que el sistema puede garantizar) y con su método de verificación explícito.
- 2026-07-22 — **Modelo mental de OAuth vs. posesión del hardware**: la spec dejaba implícito que vincular por OAuth alcanzaba para operar el Posnet. Se explicitó que **OAuth da permiso sobre una cuenta, no posesión del hardware**: MP no expone ningún endpoint para reclamar ni transferir un lector entre cuentas, así que el flujo "el dueño configura su Posnet desde `/admin`" tiene **un paso manual irreductible** (reclamar el lector desde la app de MP). Una vez reclamado, el token OAuth sí puede listarlo, pasarlo a PDV, crear store/POS y sacar el QR estático.
- 2026-07-22 — **Pregunta abierta de F1.c CERRADA: el tipo de solución de la aplicación NO bloquea el `POST` de payment intent.** Quedaba abierto si una app de MP registrada bajo otro tipo de solución (no "Pagos presenciales") podía listar el lector por `GET` pero fallar recién al crear el intent. El modo 3 del gate del PR 4 lo cerró empíricamente: con el seller local expirado temporalmente, el token de emergencia del `.env` (aplicación `4126722482739227`, **distinta** de la app del OAuth `2990738606457276`) creó el intent `15d5650d…` de $15 a las 23:57 UTC y el cobro salió — **el nivel 3 del resolver puede crear payment intents y cobrar**, no solo listar. El preflight de F1.c mide entonces exactamente lo que hace falta (cuenta + visibilidad del device); no hay una condición oculta por aplicación.
- 2026-07-22 — **Bug encontrado en vivo durante el gate — el A12 del PR 4 rompía todo cobro con 403.** La primera implementación del middleware de contexto (`mp-context.middleware.ts`) validaba `x-bar-id` comparándolo **solo contra `BAR_CODE`**, pero la web manda el **UUID** de la barra → toda solicitud de cobro moría en 403 apenas se activó la validación. Corregido en `00e6ac6`: el middleware acepta code **o** UUID, con lookup cacheado de la barra. Lección: el header que el frontend manda de verdad hay que verificarlo contra tráfico real antes de volverlo autoritativo del lado del server.
- 2026-07-24 — **El PR 6 se implementó vía la feature `gestion-posnets`, no como PR propio.** La spec [`gestion-posnets.md`](./gestion-posnets.md) absorbió el entregable completo: **T19** entregó las sesiones de caja (D6 — migración `20260724000100_bar_sessions_identity.sql`, identidad `rol:username` derivada de la sesión autenticada, sin UUID por pestaña; `09237a4` backend + `a5f9542` frontend con el tab «PDV y Posnets», `PdvFormPanel` y sus tests) y **T26** los docs (`6f7b078` + `68ed32f`). La checklist del PR 6 y los criterios de los bloques D/G/H se tildaron **retroactivamente** el 2026-07-24, verificando cada item contra el código; dos items cambiaron de forma: el de `docs/fases-mp/INDEX.md` quedó **superado** (esos docs se borraron en la consolidación de specs, `84a2fb3`) y la verificación E2E quedó cubierta por los gates físicos de `gestion-posnets` (T11/T14/T28/T29) solo para caja/admin — `/carta` y `/barra` siguen fuera de validación hasta la Fase 7. **Un criterio de G quedó sin tildar** porque la verificación lo desmintió: `PdvSection.tsx:430` todavía hardcodea `"Barra VIP"` como nombre de la caja en la fila del Posnet en vez de leer `storeName` (resto menor, no bloqueante). La spec sigue `in-progress`: queda el PR 5 y el `DROP COLUMN` diferido del Cierre. *(Superado el mismo día: el PR 5 se cerró horas después — entrada siguiente — y `62619b8` achicó el resto de G6.)*
- 2026-07-24 — **PR 5 cerrado y la spec pasa a `implementada`: los cobros MP suben a Cloud al cerrar la noche y vuelven en el restore.** Backend en `93b0e8e` (`pushMpOrders`/`pushMpCajas`/`pushMpDevices`/`pushSellerMetadata` + pulls + `restoreFromCloud()` extendido; 837 tests unit en `apps/api`), frontend en `62619b8` (filas "Cajas MP / Posnets / Cobros MP" en el restore de `SistemaSection` + aviso D3 de re-vincular + fix parcial de G6: la fila del Posnet lee el `storeName` real; 467 tests web) y `f27a0c0` (`pr5-cloud.sql` convergente). El `pullSellerHandoff()` que enumeraba el plan **ya existía desde el PR 4 como `pullSellerFromCloud()`** — se registró la correspondencia, no se duplicó. Plan técnico: [`2026-07-24-pr5-sync-design.md`](../../plans/mercadopago/2026-07-24-pr5-sync-design.md). **Gate físico pasado el mismo día**: cobro real de **$101** con el Posnet (`processed/approved`, intent con `event_id`), cierre de noche, push verificado por REST en Cloud (`mp_orders` con `event_id`, `mercadopago_cajas` `COCKTRAILBAR01`, `mercadopago_cajas_devices` con el PAX activo en PDV, metadata del seller con `access_token: null`, outbox local con `cloud_synced_at` estampado) y restore desde `/admin` con las filas MP y el aviso de re-vincular. Con esto el bloque C quedó completo y la spec pasó a `implementada`; único resto vivo, el `DROP COLUMN` diferido del Cierre. **Tres episodios del gate**:
  1. **`pr5-cloud.sql` v1 falló con `42703`**: las tablas MP **ya existían en Cloud con esquema viejo** — la integración pre-remediación del 17-07 operaba contra Cloud vía `mpDb`. Se reescribió **convergente** (`f27a0c0`): `ADD COLUMN IF NOT EXISTS` columna por columna, drop dinámico de FKs (el archivo histórico queda sin FKs), CHECKs de `mp_orders` recreados con la definición local como `NOT VALID`, y UNIQUEs espejo con dedupe previo.
  2. **El primer cierre de noche marcó `synced` sin subir nada de MP**: el dev server (`tsx watch`) **no recargó** tras los cambios — el proceso hijo era de las 12:22:50, los archivos se escribieron después y el watcher quedó colgado, así que seguía corriendo el `pushEventData` viejo. Se resolvió con flip de `sync_status` a `pending` + restart del server; el sync del boot subió todo. **Lección operativa**: tras tocar el módulo `sync`, verificar que el watcher recargó (o reiniciar a mano).
  3. **R16 mordió de nuevo**: la suite de integración (corrida ~12:22) dejó una noche "activa" fantasma con 4 orders de test en la base compartida; se borró a mano. Queda registrado en R16 del roadmap, junto con el pendiente de limpiar en Cloud las 155 noches $0 históricas que el código viejo sincronizó.
