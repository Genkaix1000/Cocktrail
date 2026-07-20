# Remediación de la integración Mercado Pago + bar-sessions

**Estado**: `aprobada` — decisiones cerradas el 2026-07-20; plan técnico escrito; enriquecida con hallazgos de verificación en vivo (A1b, A17, A18) y bugs de infraestructura ya corregidos. Lista para `/tasks`.
**Fecha**: 2026-07-20
**Origen**: auditoría del merge `e95404a..8b559b2` (5 commits de Genkaix1000, 2026-07-17, +13.934/−4.066 en 162 archivos)

---

## Problema / Por qué

El 2026-07-17 entró a `develop` la integración completa de Mercado Pago (Fases 0-6: OAuth, provisioning, cobro por QR estático, webhooks) más una feature de sesiones exclusivas de caja por barra. Es trabajo sustancial y en buena parte bien hecho — PKCE correcto, HMAC timing-safe, la RPC `consume_oauth_state` genuinamente atómica, `mercadopago_sellers` bien cerrada con RLS, exclusividad de cajas garantizada por constraint de DB.

Pero se mergeó sin revisión, y una auditoría en profundidad encontró **12 defectos de severidad alta y ~10 de severidad media**. El problema no es la feature: es que en su estado actual **no se puede poner en producción en el boliche** sin riesgo de cobrar dos veces, perder ventas cobradas, o dejar la caja inoperable.

Hay cuatro dolores distintos, y conviene no confundirlos:

**1. Se puede perder o duplicar plata.** `mp_orders` no tiene ninguna restricción de unicidad, así que un webhook reintentado por Mercado Pago —cosa que MP hace por diseño— inserta filas de cobro duplicadas. Si el registro del pedido falla *después* de que MP confirmó el pago, se cobró la plata y no queda pedido: no hay retry ni compensación. Un doble click en "Cobrar" genera dos órdenes reales. Y las llamadas a Mercado Pago no tienen timeout, con lo cual una conexión colgada bloquea el cobro sin límite.

**2. Se rompió la promesa central del producto.** `ARCHITECTURE.md` §2 dice, textual: *"La caja nunca depende de internet"*. Hoy, si están configuradas las variables de cloud, **cada cobro —incluido el del Posnet físico— consulta Supabase Cloud por internet** antes de tocar a Mercado Pago. El Posnet, que antes funcionaba con una variable de entorno local, ahora depende de que un servicio remoto esté vivo. Un corte de Supabase Cloud deja al boliche sin cobrar, aunque MP esté perfecto. Esto no es un bug puntual: es una decisión arquitectónica que se tomó de hecho, sin discutirse ni documentarse.

**3. La conciliación quedó ciega.** Ninguna de las tablas nuevas entró al módulo `sync`. `mp_orders` no se sube al cerrar la noche, así que **todos los cobros de Mercado Pago son invisibles en la nube**. El backup en Cloud —que existe justamente porque ya hubo un incidente real de pérdida de datos— hoy no protege la plata cobrada por MP.

**4. La caja se puede bloquear sola.** El logout no libera la caja: el código pasa un identificador de dispositivo hardcodeado que nunca coincide con el real, y el endpoint de liberación no lo llama nadie. Peor: la identidad del cajero se guarda por pestaña, así que abrir una pestaña nueva lo convierte en otro usuario y **su propia caja le aparece ocupada**, dejándolo afuera hasta que expire el TTL de 2 minutos. En un sábado a la noche, con cola en la barra, eso es una caja parada.

A esto se suman tres deudas de higiene que bloquean trabajar con confianza sobre esta base:

- **Se pushearon 7 tests rotos** a `origin/develop` (`PagosSection.test.tsx`). La suite ya no es una señal confiable: quien corra los tests de ahora en más va a ver rojo y aprender a ignorarlo.
- **641 líneas de código muerto** (`PdvSection.tsx`, `PdvTable.tsx`, `PdvFormModal.tsx`) que nadie importa, conviviendo con una versión embebida y peor de la misma funcionalidad dentro de un `PagosSection.tsx` de 681 líneas.
- **Hay comentarios que mienten sobre el código que documentan.** El más peligroso afirma que el refresh de tokens usa `FOR UPDATE` en transacción; el código que efectivamente lo implementa admite en su propio comentario que no hay lock. Un comentario falso es peor que ninguno: el próximo que lea eso va a asumir que el problema está resuelto.

Finalmente, un problema que la auditoría destapó y que es **independiente de Mercado Pago pero bloqueante para producción**: **no existe ningún mecanismo para actualizar el schema de una base ya desplegada.** Las 14 migraciones nuevas se aplican únicamente como init-scripts de Docker, y esos solo corren con el volumen vacío. `ARCHITECTURE.md` §9 incluso canoniza esto como convención ("cada migración nueva se agrega como `14-…`, `15-…` en el compose"). El único script de base que existe (`db:reset`) borra datos, no aplica schema. Consecuencia concreta: **hoy no hay forma de llevarle esta actualización a la mini-PC del boliche sin destruir su historial de noches.** Se descubrió porque la propia base local de desarrollo tiene las 8 tablas viejas con 29 tragos y 109 noches, y ninguna de las 14 nuevas.

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

- [ ] **Dado** que Mercado Pago reenvía una notificación ya procesada, **cuando** llega al sistema, **entonces** no se crea un segundo registro de cobro ni se impacta el pedido dos veces. Verificable reenviando la misma notificación N veces y comprobando que el resultado es idéntico al de una sola.
- [ ] **Dado** un cajero que hace doble click en cobrar, **cuando** se dispara la segunda solicitud, **entonces** no se genera una segunda orden de cobro real en Mercado Pago.
- [ ] **Dado** que el cobro se confirmó en Mercado Pago pero falla el registro local del pedido, **cuando** ocurre el fallo, **entonces** el sistema deja constancia recuperable del cobro y lo señala para conciliación — nunca lo descarta en silencio.
- [ ] **Dado** que Mercado Pago no responde, **cuando** pasa un tiempo acotado, **entonces** la operación corta con un error claro para la cajera en vez de colgarse indefinidamente. Aplica tanto al backend como a la espera del pago por QR en pantalla.
- [ ] **Dado** que Mercado Pago devuelve un estado que el sistema no conoce, **cuando** se interpreta, **entonces** no se lo reporta como "pendiente" — se lo distingue de un cobro efectivamente en curso.
- [ ] **Dado** dos cobros simultáneos con el token de acceso próximo a vencer, **cuando** ambos disparan la renovación, **entonces** la cuenta no queda marcada como vencida ni se corta la capacidad de cobrar.

### B. Local-first / disponibilidad (bloqueante)

- [ ] **Dado** que no hay internet, **cuando** la cajera cobra con Posnet, **entonces** el cobro funciona igual que antes de este merge.
- [ ] **Dado** que Supabase Cloud está caído pero Mercado Pago está disponible, **cuando** se intenta cobrar, **entonces** el cobro se concreta.
- [ ] La única parte del flujo que requiere Supabase Cloud es la **vinculación inicial por OAuth** (setup de una vez). Cobrar no lo requiere nunca — ver D1.
- [ ] **Dado** un token de acceso vencido y dos cobros simultáneos, **cuando** ambos disparan la renovación, **entonces** existe un único componente capaz de renovarlo, de modo que la carrera no puede ocurrir por construcción — ver D1.

### C. Conciliación

- [ ] **Dado** un cierre de noche con cobros de Mercado Pago, **cuando** hay conectividad, **entonces** esos cobros suben a la nube junto con los pedidos y tickets.
- [ ] **Dado** un restore de emergencia desde la nube, **cuando** se ejecuta, **entonces** la configuración de Mercado Pago (cajas, dispositivos) y los cobros se recuperan. **Los tokens quedan explícitamente excluidos**: por D3 no son recuperables desde la nube y hay que re-vincular por OAuth. Es un trade-off consciente — ver el plan técnico.
- [ ] El resumen de la noche refleja los cobros de Mercado Pago sin necesidad de mirar el panel de MP.

### D. Operación de caja

- [ ] **Dado** un cajero que cierra sesión, **cuando** el logout se completa, **entonces** su caja queda libre de inmediato.
- [ ] **Dado** un cajero con una caja tomada, **cuando** abre otra pestaña o recarga la página, **entonces** el sistema lo reconoce como el mismo usuario y le devuelve *su* caja — nunca se la muestra como ocupada por un tercero.
- [ ] **Dado** un cajero que pierde conexión o se queda sin luz, **cuando** pasa el tiempo de gracia, **entonces** la caja se libera sin intervención de un admin.
- [ ] **Dado** un admin que desaloja a un cajero, **cuando** se ejecuta el desalojo, **entonces** el cajero desalojado no puede volver a tomar la caja inmediatamente sin pasar por el flujo previsto.

### E. Seguridad

- [ ] Ninguna tabla nueva es escribible por un cliente anónimo. Verificable intentando escribir con la clave pública y obteniendo rechazo.
- [ ] **Dado** un usuario de caja que manipula el contexto de barra o dispositivo en su navegador, **cuando** intenta cobrar, **entonces** el backend rechaza operar contra una barra o Posnet que no le corresponde. La validación es del lado del servidor.
- [ ] Una notificación de Mercado Pago capturada y reenviada fuera de una ventana de tiempo razonable es rechazada.
- [ ] Los tokens de acceso quedan cifrados en reposo, en local y en la nube — ver D3. Verificable inspeccionando la tabla y no encontrando el token legible.
- [ ] **Dado** un seller ya vinculado, **cuando** se vincula una cuenta distinta, **entonces** el seller anterior deja de estar activo — nunca quedan dos sellers activos ni se cobra con el viejo (A17, D9).
- [ ] **Dado** un admin en la pantalla de Pagos, **cuando** quiere resetear la vinculación, **entonces** existe un botón "Desvincular" que borra el seller en local y en Cloud y deja la pantalla en "No vinculada" (A18, D9).
- [ ] El cambio de política de la cookie de sesión (`SameSite`) queda justificado y documentado, o revertido si no es necesario.

### F. Actualización de schema (bloqueante para producción)

- [ ] Existe un procedimiento **único y repetible** para llevar una base existente a la última versión del schema, sin borrar datos.
- [ ] **Dado** el procedimiento corrido dos veces seguidas, **cuando** termina la segunda, **entonces** el resultado es idéntico al de la primera y no falla.
- [ ] **Dado** una base creada de cero y una base migrada incrementalmente, **cuando** ambas terminan, **entonces** tienen el mismo schema.
- [ ] La base local de desarrollo queda actualizada con las 14 tablas nuevas **conservando** sus 29 tragos y 109 noches.
- [ ] El procedimiento está documentado para el día que haya que actualizar la mini-PC del boliche.

### G. Higiene de código

- [ ] `pnpm test` pasa en verde en todo el repo. Los 7 tests rotos se arreglan o se reescriben contra la UI real — no se borran para "poner verde".
- [ ] `pnpm typecheck` sigue pasando.
- [ ] `PdvSection`, `PdvTable` y `PdvFormModal` quedan **cableados** y en uso, y la versión duplicada embebida en `PagosSection` se elimina. No quedan las dos implementaciones conviviendo.
- [ ] Los tres componentes cableados tienen tests (hoy no tienen ninguno).
- [ ] El formulario de alta de PDV es accesible: sus etiquetas están asociadas a sus campos, cierra con `Escape`, lleva el foco al primer campo al abrirse y lo devuelve al disparador al cerrarse.
  > **Corrección (2026-07-20)**: una versión previa exigía "atrapa el foco, se comporta como un diálogo real". **Era incorrecto.** `PdvFormModal` no es un modal: es un **panel lateral inline** (`PdvFormModal.tsx:32` → `w-full lg:w-[420px] shrink-0`, montado como hermano de la tabla en `PdvSection.tsx:254-277`) que no bloquea el fondo. Poner un focus trap ahí **violaría** WAI-ARIA. Por eso el criterio pide foco inicial y retorno, pero **sin trap**. El archivo debería renombrarse a `PdvFormPanel` para que el nombre no siga mintiendo.
- [ ] El nombre y el código del punto de venta que se muestran en pantalla son los reales, no literales fijos.
- [ ] No quedan comentarios que afirmen garantías que el código no da. Especialmente el que asegura un bloqueo transaccional inexistente.
- [ ] Los defectos de UI verificados quedan resueltos: el botón de prueba de Posnet apunta al dispositivo correcto y su resultado se muestra al usuario.
- [ ] Los errores de red o de Mercado Pago dejan de tragarse en silencio: si la pantalla no pudo cargar, el usuario se entera.

### H. Documentación

- [ ] `docs/ARCHITECTURE.md` describe el sistema real: el modelo de datos de MP, el flujo OAuth con la Edge Function, la resolución de credenciales, las sesiones de caja, y el nuevo mecanismo de migraciones. Se corrige la afirmación de §2 sobre internet para que diga la verdad —sea cual sea la decisión que se tome.
- [ ] `docs/ROADMAP.md` se actualiza: R14 (QR real) queda cerrado o reformulado, R15 (Orders API vs legacy) refleja que el QR ya usa Orders API y el Posnet sigue en la API vieja, y los riesgos nuevos que no se resuelvan en esta spec entran a la tabla.
- [ ] `CLAUDE.md` refleja los módulos nuevos y las convenciones que apliquen.
- [ ] Las decisiones arquitectónicas tomadas de hecho en este merge (dependencia de cloud, `mercadopago_sellers` viviendo en dos bases) quedan registradas como decisiones explícitas con su fundamento — o revertidas.
- [ ] La discrepancia entre la resolución de credenciales que declara la spec de MP (4 niveles), la que declara su índice de fases (2 niveles) y la que implementa el código (3 niveles) se resuelve dejando una sola versión verdadera.

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

Se gana: cobrar sobrevive una caída **o una pausa por inactividad** de Cloud, desaparece la clave foránea entre dos bases, y se cierra A8. Se asume: un camino de sync nuevo, que sigue exactamente el patrón que el repo ya usa para las noches.

**Opción complementaria evaluada — keep-alive ("ping-pong") de la nube.** Un pinger externo siempre-encendido (UptimeRobot / cron-job.org / un GitHub Action programado) que golpee un endpoint de Supabase cada pocos días evita que el proyecto se pause por inactividad. Se considera **defensa en profundidad, no un reemplazo de D1**, por tres motivos: (1) solo cubre la pausa, no una caída real ni un problema de conectividad; (2) el pinger tiene que correr fuera de la mini-PC —que está apagada justo durante la inactividad— y fuera de `pg_cron` —que se pausa junto con el proyecto—, o sea suma una pieza externa que también puede fallar; (3) no cambia que, sin D1, el cobro siga *dependiendo* de la nube. **Recomendación**: el ping tiene sentido para mantener disponible la nube para sus usos legítimos (push al cerrar la noche, restore, OAuth), nunca para justificar que la caja dependa de ella. Para producción con plata real, evaluar además el plan Pro de Supabase (no se pausa); pero D1 hace que el sistema aguante en el plan gratuito igual. **Fuera del alcance de esta spec** — es infra de operación, no código del repo.

### D2 — `mercadopago_sellers` pasa a tener copia completa en local

Consecuencia directa de D1. Cloud es donde escribe la Edge Function; local tiene la copia completa que se lee para cobrar y es el único que refresca.

> **Corrección (2026-07-20)**: una versión previa decía que la clave foránea "apunta a otra base". Es impreciso: `mercadopago_cajas.seller_user_id REFERENCES mercadopago_sellers(user_id)` (`20260715000200:13`) siempre se declaró **dentro** de cada base. Lo que cruzaba bases era la **lectura** (`mpDb` → Cloud) contra una FK local satisfecha por filas stub sin tokens — que es lo que motivó `20260718010000_sellers_nullable_tokens.sql`. Con D1 los stubs se vuelven filas completas y la incoherencia desaparece **sin DDL sobre la FK**.

### D3 — Los tokens se cifran a nivel aplicación

D1 hace que los tokens ahora también vivan en el disco de la mini-PC del boliche, no solo en Cloud: la superficie crece y el texto plano deja de ser aceptable. Se cifran **a nivel aplicación**, y se descarta `pgsodium`/Vault por agregar una dependencia de Postgres que choca con el Postgres embebido de la Fase 6.

> **Enmienda (2026-07-20)**, a partir del diseño técnico. La formulación original —"clave derivada del `AUTH_SECRET`"— era insuficiente por dos motivos:
>
> 1. **Acopla rotar la cookie de sesión con poder cobrar.** Hoy rotar `AUTH_SECRET` solo desloguea gente; si además cifrara los tokens, rotarlo **dejaría al boliche sin cobrar**. Se usa una env dedicada `MP_TOKEN_SECRET` (con `AUTH_SECRET` como default para no romper instalaciones existentes), más `key_version` por fila y una `MP_TOKEN_SECRET_PREVIOUS` opcional para re-cifrar en el boot.
> 2. **No decía nada de la Edge Function**, que es donde los tokens nacen. Y no se resuelve compartiéndole la clave: guardar la clave en los secrets de Supabase, al lado del ciphertext en la misma base de Supabase, no protege contra el atacante que motiva el criterio E.
>
> **Cloud deja de ser almacén de tokens y pasa a ser buzón de traspaso**: la Edge Function cifra las credenciales con una `MP_HANDOFF_KEY` propia y las deja en una tabla de handoff con vencimiento corto; en `mercadopago_sellers` de Cloud escribe **solo metadata no secreta**. El local baja el handoff, lo re-cifra con su clave, persiste y **borra el handoff**. Resultado: en Cloud no queda token legible **ni recuperable**, lo que cumple el criterio E de forma más fuerte que cifrarlo con una clave guardada al lado.
>
> **Consecuencia aceptada**: un restore desde la nube tras romperse el disco de la mini-PC recupera cajas, dispositivos y cobros, pero **no el token** — hay que re-vincular por OAuth (dos minutos de un admin). El criterio C se redactó excluyendo tokens.

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

El runner de migraciones que sale de acá es insumo de la Fase 6: `docs/specs/empaquetado-windows.md` depende de que exista una forma de actualizar una instalación desplegada.

### D9 — El modelo es de UN solo seller: vincular debe REEMPLAZAR, y debe existir "Desvincular" (a partir de A17/A18)

El negocio es de un solo comercio (un dueño recibe toda la plata — ver `docs/fases-mp/INDEX.md`, "single-seller"). Pero el código quedó en un híbrido roto: acumula filas (upsert por `user_id` → vincular otra cuenta crea una segunda fila) pero solo usa una (la más vieja, por el `order asc` de A17). Resultado observado en vivo: se vincula una cuenta nueva y el sistema sigue cobrando con la vieja, en silencio.

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
- **A17 reproducido.** Había 2 sellers activos en Cloud (una cuenta de prueba de 07-17 + la del dueño real vinculada el 20-07); la UI mostraba la vieja por el `order asc`. Se resolvió borrando la fila vieja a mano (DELETE contra la REST API de Cloud) — exactamente el "desvincular" que A18 dice que falta en la app.
- **Setup de OAuth documentado** en `docs/fases-mp/setup-oauth.md` (nuevo): las 3 env del backend, los 4 secrets de la Edge Function, el registro del redirect URI y PKCE en el panel de MP.

### Bugs de infraestructura encontrados y corregidos en esta sesión

No estaban en la auditoría original (aparecieron al levantar el entorno). **Ya corregidos** — pendientes de commit:

- **Login roto por cookie cross-origin.** `apps/web/.env` tenía `NEXT_PUBLIC_API_URL` apuntando a la IP LAN, así que el navegador hacía el fetch de login cross-origin y la cookie de sesión **no se guardaba** para `localhost:3000` → login daba 200 pero la app rebotaba a `/login`. Arreglo: `NEXT_PUBLIC_API_URL` vacío (cliente same-origin, la cookie pega, y anda igual desde la LAN sin CORS).
- **Puerto del backend hardcodeado en el proxy de Next.** `apps/web/next.config.ts` tenía `destination: "http://localhost:3001/api/..."` fijo, pero el backend corre en 8080 → el proxy daba ECONNREFUSED. Arreglo: el rewrite ahora lee `API_PROXY_TARGET` (default 3001). Bug real del repo: cualquiera que cambie `PORT` se lo comía.
- Se agregó `API_PROXY_TARGET=http://localhost:8080` a `apps/web/.env`.

Estos tres tocan config local (`.env`) y un archivo commiteado (`next.config.ts`). El cambio de `next.config.ts` conviene commitearlo — es una corrección genuina, independiente del `.env` de cada uno.

### Actualización de schema en producción — análisis

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
- **Backfill**: en una instalación creada por init-scripts, las 14 migraciones ya están aplicadas. Hay que marcarlas como tales o el runner las reintentará.
  > **Corrección (2026-07-20)**: una versión previa de esta spec afirmaba que `20260719000000_bars_code.sql` no era idempotente. **Es idempotente** — su seed usa `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM bars WHERE code = 'BARRA-01')`. Eso habilita la estrategia de backfill por re-ejecución que adopta el plan técnico.
- **Política de fallo**: si una migración falla a mitad, ¿el backend arranca igual con schema viejo, o se niega a arrancar? Para una caja en pleno turno, la respuesta no es obvia y hay que elegirla a conciencia.

### Lo que está bien hecho (no tocar sin motivo)

PKCE S256 correcto · `consume_oauth_state` genuinamente atómico (`DELETE ... RETURNING`, con `search_path` fijado y permisos revocados) · `mercadopago_sellers` bien cerrada (RLS + política restrictiva + revoke, con tests pgTAP que lo verifican) · HMAC timing-safe · fail-closed si falta el secreto de webhooks · ningún endpoint quedó sin autenticación · los tokens nunca se loguean ni llegan al frontend · exclusividad de cajas con constraint real de base y manejo del conflicto · inyección de dependencias por constructor · cobertura de tests real en los módulos nuevos del backend.

---

## Plan técnico

> Escrito el 2026-07-20 tras consultar a `supabase-expert` (diseño del runner y de la inversión del token) y `architect-reviewer` (secuenciación y boundaries). Ambos corrigieron errores de la spec original, ya enmendados arriba.

### Enfoque

Se ataca en seis entregables secuenciales, cada uno desplegable y verificable por separado. El criterio de corte es que **cada PR o no cambia comportamiento observable, o cierra un bloque completo de criterios con su migración adentro** — nunca se deja el sistema en un estado intermedio roto. El orden lo manda una dependencia dura que no es de deploy sino de *verificabilidad*: la base local no tiene ninguna de las 14 migraciones nuevas, así que **sin el runner de migraciones nada de lo que requiera schema nuevo se puede probar localmente** — y los frentes de cobro, sync, seguridad y sesiones requieren todos migración nueva. Por eso el runner va segundo, apenas detrás de dejar la suite en verde.

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
- `apps/api/src/modules/mercadopago/credentials-resolver.service.ts:66-67` — se borra el comentario que promete un `FOR UPDATE` inexistente (no se reemplaza por otra promesa)
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

**Alto — el flujo de cobro con Posnet físico es el único probado en vivo, y hoy corre por el fallback legacy.** Verificado en el entorno real: `MP_ACCESS_TOKEN` y `MP_POS_DEVICE_ID` están seteadas, pero **`MP_APP_ID` y `MP_CLIENT_SECRET` están vacías** — el OAuth ni siquiera se puede ejecutar (`mercadopago-oauth.service.ts:51` lanzaría). Por lo tanto no hay ningún seller vinculado, `findFirstActive()` nunca devuelve uno, y **todo cobro de hoy sale por el nivel 3 del resolver**. Lo validado el 2026-07-13 fue ese camino.

Por eso: **el fallback a `MP_ACCESS_TOKEN` no se elimina en esta ronda.** El PR 4 cambia de dónde sale el token, que es justo el tipo de cambio con bugs sutiles posibles (token mal descifrado, seller que no bajó, migración a medias); si se borra la red de seguridad en el mismo entregable que cambia la fuente, el peor caso pasa de "cae al camino viejo que funciona" a "el boliche no cobra". Se elimina en una ronda posterior, recién con el camino nuevo validado contra el Posnet físico.

**Corolario del hallazgo A1b — el PR 4 tiene un trabajo extra que no estaba previsto**: no alcanza con leer el token de local. Hay que **hacer que el fallback sea alcanzable**, envolviendo el nivel 2 para que un fallo de red degrade al nivel 3 en vez de propagar la excepción. Hoy esa red de seguridad está desconectada.

**Gate obligatorio**: cobro real con el Posnet físico (el test de $15) al cerrar el PR 3 y al cerrar el PR 4 — este último **con la red hacia Supabase Cloud cortada a mano**, que es la única prueba de que D1 realmente funciona.

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

**Nota sobre D7**: la spec asumía que "los 7 tests rotos se arreglan primero" era un paso independiente. Al inspeccionarlos resultó que **6 de los 7 prueban PDVs y Posnets**, es decir código que D5 muda a `PdvSection` — no se reparan, **se migran**, y por eso viajan en el PR 6. El séptimo (toggle Sandbox) es un defecto real de accesibilidad donde **el test tiene razón y el componente está mal** (`PagosSection.tsx:599-612`: un `<button>` sin nombre accesible ni `aria-pressed`, con un `<span>Sandbox</span>` al lado), y ese sí se arregla primero, en el PR 1.

### Alternativas consideradas

- **Revertir el merge** — descartado: perdería semanas de integración con MP que en buena parte está bien hecha (PKCE correcto, RPC atómica, HMAC timing-safe, exclusividad por constraint real).
- **CLI de Supabase (`supabase db push`) como mecanismo de migración** — descartado: mete una dependencia externa en la mini-PC justo cuando la Fase 6 quiere eliminar Docker, y el compose es un Supabase mínimo hecho a mano, no el stack del CLI. El runner propio sobrevive al Postgres embebido porque habla el protocolo de Postgres, no Docker.
- **`postgres.js` en vez de `pg`** — descartado: `pg` ejecuta un `.sql` completo con múltiples statements en una sola llamada por protocolo simple, mientras que `postgres.js` tiene un parseo propio que puede tropezar con bloques `DO $$ ... $$`.
- **Backfill por manifiesto de "probes"** (una consulta por migración para detectar si ya se aplicó) — descartado a favor de **backfill por re-ejecución**: se auditan las 19 migraciones para que sean idempotentes y en el primer arranque se aplican todas. En una base nueva son no-ops; en la de dev, las 5 viejas son no-ops y las 14 nuevas se aplican de verdad. No hay mapeo a mano que se pueda equivocar, y satisface literalmente los criterios F ("correr dos veces = mismo resultado", "de cero == incremental").
- **Compartirle la clave de cifrado a la Edge Function** — descartado: guardar la clave en los secrets de Supabase, al lado del ciphertext en la misma base de Supabase, no protege contra el atacante que motiva el criterio E. De ahí el diseño de Cloud como buzón de traspaso y no como almacén.
- **Mutex in-process para el race del refresh (A8)** — descartado a favor de eliminarlo por construcción con el único-escritor de D1. Un mutex funciona, pero deja la clase de bug latente.
- **Embeber `PdvSection` dentro de `PagosSection`** — descartado: `PdvSection.tsx:188` tiene su propio `<h1>` y `PagosSection.tsx:247` también; embeber uno en otro produce dos `<h1>` en la misma página. Va como tab propio.
- **Fail-closed en el runner** (negarse a arrancar si una migración falla) — descartado por el análisis de riesgo de arriba.

### Cabo suelto identificado

Las **sesiones de barra** viven hoy embebidas en la tarjeta de PDV de `PagosSection` (`:369-399`, `handleForceLogout`). No son ni Pagos ni PDV: son operación de caja. Al repartir las cards hay que decidir dónde van — componente propio o `SistemaSection` — o como mínimo dejar registrado que la ubicación es de conveniencia. Se resuelve en `/tasks`.
