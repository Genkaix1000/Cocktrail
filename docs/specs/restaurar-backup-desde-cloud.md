# Restaurar backup desde Supabase Cloud

**Estado**: done
**Fecha**: 2026-07-13

---

## Problema / Por qué

Hoy pasó de verdad: la tabla `drinks` de la base local se vació en silencio por un bug de sync
(ya corregido — ver `docs/ROADMAP.md`). El único motivo por el que se recuperó fue que había un
agente de IA con acceso directo a la base para diagnosticarlo y disparar el sync manualmente. Si
el dueño del boliche se encuentra con la carta vacía, un historial de noches vacío, o la base
local corrompida/borrada por cualquier motivo (fallo de disco, error humano, reinstalación de la
mini-PC), **hoy no tiene ninguna forma de recuperarlo desde `/admin`** — no existe un botón de
"Restaurar", y el único "Exportar" que hay es un CSV del historial visible en pantalla (no un
respaldo real de la base).

El sync que ya existe (`SyncService`) resuelve solo una dirección parcial:
- `pullMasterData()` trae `users`/`drinks` de cloud a local — pero **no** trae el historial de
  noches cerradas (`night_events`/`orders`/`tickets`/`cash_sales`).
- El sync transaccional normal va **local → cloud** (push al cerrar la noche), nunca al revés.
- `audit_logs` **no se sincroniza a cloud en absoluto**, ni push ni pull — si se pierde la base
  local, esa auditoría se pierde para siempre, sin importar qué tan reciente sea el backup de
  cloud, porque nunca llegó a cloud.

Para quién: el **admin/dueño del boliche**, que necesita poder recuperar su negocio (carta,
historial de ventas, auditoría) sin depender de que alguien con conocimientos técnicos intervenga
manualmente en la base de datos.

---

## Objetivo

Que desde `/admin` exista una acción de **"Restaurar desde backup"** que traiga a la base local
**todo** lo que haya disponible en Supabase Cloud: `drinks`, `users` (esto ya existe hoy vía
`pullMasterData`), y **además** el historial completo de noches cerradas con sus `orders`,
`tickets` y `cash_sales` — de forma que, ante una base local vacía o dañada, el admin pueda
recuperar la carta y todo el historial de ventas sin ayuda externa.

El restore es **no destructivo**: hace *merge/upsert por id* contra lo que ya haya en local (mismo
criterio que ya usa `pullMasterData` para `drinks`/`users` hoy) — nunca borra datos locales que
cloud no tenga. Si un dato existe en ambos lados, gana la versión de cloud (fuente de verdad para
recuperación, asumiendo que cloud es lo último sincronizado antes del desastre).

Además, `audit_logs` pasa a sincronizarse **hacia cloud** (push, ya que hoy no va en ningún
sentido) para que también sea recuperable — sin esto, "restaurar todo" sería una promesa
incompleta.

El comportamiento de todo lo que ya funciona hoy (`POST /api/system/sync`, `pullMasterData`, el
push normal al cerrar la noche) **no cambia** — esto es una capacidad nueva que se agrega, no un
reemplazo.

---

## Historias de usuario

- Como **admin/dueño**, si la carta de tragos o el historial de noches aparecen vacíos por
  cualquier motivo, quiero un botón en `/admin` que los recupere desde la nube, para no depender
  de que alguien intervenga la base de datos a mano.
- Como **admin/dueño**, quiero saber con confianza que si algún día pierdo la mini-PC o se corrompe
  el disco, puedo levantar una máquina nueva, conectar las mismas credenciales de Supabase Cloud, y
  recuperar todo el negocio (carta, historial, auditoría) apretando un botón.
- Como **admin/dueño**, no quiero que restaurar un backup me borre accidentalmente ventas locales
  recientes que todavía no llegaron a la nube (ej. si el restore se dispara mientras hay datos
  locales sin sincronizar) — el restore tiene que sumar, nunca destruir.
- Como **desarrollador/agente** que audita el sistema en el futuro, quiero que la auditoría
  (`audit_logs`) también esté respaldada en cloud, para que "recuperar todo" sea una promesa real
  y no una que se rompe justo en la parte de trazabilidad.

---

## Criterios de aceptación

1. **Dado** que el admin está en `/admin`, **cuando** busca la acción de sincronización/backup,
   **entonces** encuentra un botón/acción claramente distinguible de "Sincronizar" (el push normal
   de la noche actual) — algo como "Restaurar desde backup" — con su propio texto explicando qué
   hace (trae todo el historial disponible desde la nube).
2. **Dado** una base local con `night_events`/`orders`/`tickets`/`cash_sales` vacíos (o
   parcialmente vacíos), **cuando** se dispara el restore, **entonces** al terminar la base local
   tiene todas las noches cerradas que existían en cloud, con sus pedidos, tickets y cierres de
   caja correspondientes — consultables desde Historial de Noches en `/admin` igual que si
   siempre hubieran estado ahí.
3. **Dado** que la base local YA tiene datos que también existen en cloud (no está vacía),
   **cuando** se dispara el restore, **entonces** ningún dato local que no esté en cloud se borra
   — el restore es aditivo/upsert, nunca un `DELETE`.
4. **Dado** que hay datos en cloud y en local con el mismo id pero contenido distinto (ej. un
   pedido que cambió de estado después del último push), **cuando** se restaura, **entonces** gana
   la versión de cloud (es la fuente de verdad asumida para recuperación de desastre).
5. **Dado** el flujo normal de cierre de noche, **cuando** se cierra una noche después de este
   cambio, **entonces** `audit_logs` de esa sesión también queda disponible en Supabase Cloud
   (push), sin que el comportamiento de auditoría local cambie en nada.
6. **Dado** que se restaura la base y luego se dispara un restore de `audit_logs`, **entonces**
   los logs de auditoría que estaban solo en cloud (de antes del desastre) vuelven a estar
   disponibles en `/admin` → Logs.
7. **Dado** un restore que falla a mitad de camino (ej. se corta la conexión a internet), **cuando**
   se revisa el estado de la base local después, **entonces** lo que sí se alcanzó a traer queda
   persistido (no hay rollback parcial que borre lo ya restaurado) y el admin recibe un mensaje de
   error claro indicando que el restore no se completó del todo — no un "éxito" falso (mismo tipo
   de bug que causó el incidente de hoy con `drinks`, no repetirlo acá).
8. **Dado** que Supabase Cloud no está configurada (`SUPABASE_CLOUD_URL`/`SUPABASE_CLOUD_SERVICE_ROLE_KEY`
   vacías), **cuando** el admin intenta restaurar, **entonces** recibe un mensaje claro de que no
   hay backup disponible porque el sync a la nube nunca se configuró — no un error genérico ni un
   crash.
9. **Dado** el volumen de datos de varias noches/meses de historial, **cuando** se restaura,
   **entonces** el admin ve algún tipo de feedback de progreso o al menos un estado de "restaurando…"
   mientras dura — no una espera muda sin indicación de que algo está pasando (puede tardar si hay
   mucho historial).

---

## Fuera de alcance

- **Restore automático/programado** — esto es una acción manual que dispara el admin, no un
  proceso en background que corre solo. Si el escenario es "recuperación de desastre", tiene
  sentido que sea una decisión consciente, no algo que se dispare sin que nadie se entere.
- **Versionado de backups / restaurar a un punto en el tiempo específico** — cloud tiene un solo
  estado (el más reciente sincronizado), no un historial de snapshots. Restaurar siempre trae "lo
  último que hay en cloud", no una noche específica de hace 3 semanas versus otra versión más
  vieja.
- **Backup de `app_config`** (tema visual, nombre del club, config de Mercado Pago) — no es un dato
  transaccional ni de historial, y perderlo no es un desastre del mismo tipo (se reconfigura a
  mano en minutos). Puede ser un ítem futuro si se decide que vale la pena.
- **Exportar el backup a un archivo descargable** (ej. un `.sql` o `.json` para guardar aparte de
  Supabase Cloud) — esta spec asume que Supabase Cloud ES el backup; un export a archivo plano
  es una capa adicional que no se pidió.
- **Cambiar el modelo de sync existente** (local→cloud al cerrar noche, `pullMasterData` para
  drinks/users) — esta feature se **suma** al mecanismo actual, no lo reemplaza ni lo modifica.

---

## Preguntas abiertas

- ¿El botón de restaurar debería requerir alguna confirmación extra (ej. re-ingresar la
  contraseña, como ya hace "Cerrar Noche") dado que trae un volumen de datos potencialmente grande
  y es una acción pensada para un escenario de emergencia? Se define en `/plan`.
- Volumen de datos: si el historial de cloud tiene meses de noches, ¿el restore trae TODO siempre,
  o solo lo que falte localmente (comparando qué `night_events` ya existen en local antes de pedir
  cada uno a cloud, para no re-transferir lo que ya está)? Afecta directamente el criterio 9
  (feedback de progreso) y el rendimiento — se define en `/plan`, probablemente consultando con
  `supabase-expert`.
  **Resuelto en el Plan técnico**: trae TODO siempre (tabla completa, upsert por id) — a esta
  escala (un boliche, un puñado de noches por temporada) no se justifica la complejidad de un
  cursor incremental, y el upsert por id es naturalmente idempotente.
- **Resuelto en el Plan técnico**: el restore SÍ pide confirmar la contraseña (mismo patrón que
  "Cerrar Noche") — no por volumen de datos, sino porque el criterio 4 (gana cloud en conflicto)
  puede pisar silenciosamente un dato local más nuevo que todavía no llegó a cloud; el costo de
  la fricción extra es bajo comparado con ese riesgo.

---

## Plan técnico

Diseñado con el agente `supabase-expert` (2026-07-13), + verificación en vivo (solo lectura)
contra el esquema real de Supabase Cloud para confirmar paridad de columnas antes de comprometerse
al diseño.

### Enfoque

Extender `CloudSyncRepository` (no crear un módulo paralelo) con métodos `pull*` simétricos a los
`push*` que ya existen para `night_events`/`orders`/`tickets`/`cash_sales`, más `pushAuditLogs`/
`pullAuditLogs` nuevos. Cada tabla se trae completa de cloud y se hace upsert local en batches —
sin cursor incremental, sin paginación de lectura salvo que un `select` supere 1000 filas (default
de PostgREST). El resultado de cada tabla se reporta por separado (tally `{ok, failed, error?}`),
nunca se colapsa en un booleano — es la lección directa del bug de `pullUsers`/`pullDrinks` de hoy.

### Verificación de esquema en vivo (bloqueante para el diseño, ya hecha)

- `orders` y `tickets` en cloud **calzan 1:1** con local (mismas columnas, confirmado con
  `GET .../orders?select=*&limit=1` y `.../tickets?select=*&limit=1` reales) — el mapeo inverso al
  que ya usa `pushOrders`/`pushTickets` es seguro tal cual.
- `night_events` en cloud **NO tiene `status`** (confirmado) y **SÍ tiene `totals`** (cloud-only,
  R2). El pull de `night_events` **no puede** ser un `select("*")` → `upsert` directo como
  `pullUsers`/`pullDrinks` — necesita mapeo explícito: `status` se fuerza a `"cerrado"` (todo lo
  que llegó a cloud se pusheó al cerrar una noche, nunca hay noches `activo` en cloud), y `totals`
  se descarta (no existe la columna en local, a propósito, documentado en R2).
- `cash_sales` en cloud ya se había verificado hoy mismo (sesión de la deuda estructural, prueba
  end-to-end real) — mismas columnas que local.

### Archivos/módulos afectados

- `apps/api/src/modules/sync/cloud-sync.repository.ts` — agregar a la interfaz y la
  implementación:
  - `pullNightEvents(): Promise<{ok: number; failed: number; error?: string}>` — mapeo explícito
    (`status: "cerrado"` forzado, sin `totals`, `sync_status: "synced"`).
  - `pullOrders(): Promise<{ok: number; failed: number; error?: string}>` — igual que
    `pushOrders` invertido, columnas 1:1.
  - `pullTickets(): Promise<{ok: number; failed: number; error?: string}>` — igual que
    `pushTickets` invertido.
  - `pullCashSales(): Promise<{ok: number; failed: number; error?: string}>` — igual que
    `pushCashSales` invertido.
  - `pushAuditLogs(): Promise<{ok: number; failed: number; error?: string}>` — bypasea
    `AuditLogsService` (mismo criterio que `pullUsers`/`pullDrinks` bypasean sus repos): pega
    directo `supabase.from("audit_logs").select("*")` → `supabaseCloud.from("audit_logs").upsert(...)`.
    Push de la tabla completa (no filtrado por sesión/rango — `audit_logs` no tiene FK a
    `night_events`, filtrar por fecha agrega complejidad sin beneficio real a esta escala).
  - `pullAuditLogs(): Promise<{ok: number; failed: number; error?: string}>` — inverso, para el
    criterio 6 (recuperar auditoría de antes del desastre).
  - Todos los `pull*` chequean el error del `upsert` LOCAL explícitamente (no repetir el bug de
    hoy) y hacen los upserts en batches de ~500 filas — acota el radio de un fallo parcial y da
    checkpoints naturales para el reporte de progreso.
- `apps/api/src/modules/sync/sync.service.ts` — nuevo método `restoreFromCloud(): Promise<RestoreResult>`
  (tipo `RestoreResult` exportado desde acá o desde `cloud-sync.repository.ts`) que llama, en
  orden, `cloudSyncRepo.pullNightEvents()` → `pullOrders()` → `pullTickets()` → `pullCashSales()`
  → `pullAuditLogs()` (drinks/users ya los cubre `pullMasterData()`, no se duplica). **Nunca
  lanza** para abortar todo — cada paso se envuelve en su propio try/catch, se acumula en el
  resultado, y sigue con el siguiente paso aunque uno falle (criterio 7: parcial persiste,
  nada de rollback).
- `apps/api/src/modules/events/events.service.ts` — al cerrar la noche
  (`syncEventToCloudBackground`, donde ya se llama `syncService.pushEventData`), agregar la
  llamada a `syncService.pushAuditLogsIfConfigured()` (wrapper delgado en `SyncService` sobre
  `cloudSyncRepo.pushAuditLogs()`) — criterio 5, la auditoría de la sesión queda en cloud junto
  con el resto del cierre.
- `apps/api/src/modules/system/system.controller.ts` — nuevo endpoint
  `POST /api/system/restore` (staff, mismo guard que `/sync`), recibe `{password}` en el body
  (re-autentica con `authenticate()`, mismo patrón que `/shutdown`), llama
  `syncService.restoreFromCloud()`, devuelve el `RestoreResult` completo con status `200` (éxito
  total o parcial — el body ya distingue, no hace falta un código HTTP no estándar).
- `apps/web/src/services/system.service.ts` (o donde viva hoy el service que llama a
  `/api/system/sync` — confirmar nombre exacto en `/tasks`) — nuevo método `restore(password)`.
- `apps/web/src/components/admin/` — nuevo botón "Restaurar desde backup" cerca de
  "Sincronizar" (confirmar ubicación exacta — probablemente Configuración/General o donde ya
  esté el botón de sync existente), con modal de confirmación + campo de contraseña (mismo
  componente/patrón que ya usa `CloseNightModal` para pedir contraseña), y renderizado del
  `RestoreResult` tabla por tabla (criterio 1 y 9: feedback claro, no una espera muda).

### Cambios de datos

Ninguna migración nueva. `audit_logs.id` ya es `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
(generado una vez al insertar) — upsert por id es naturalmente idempotente, no hace falta agregar
`sync_status` a esta tabla. No se toca `packages/shared/src/domain.ts` (todo el mapeo es interno a
`CloudSyncRepository`, no hay tipos de dominio nuevos — `RestoreResult` es un tipo de infraestructura
de sync, no de dominio de negocio).

### Impacto en sync / offline-first

Es 100% aditivo sobre el mecanismo existente — no cambia `pushEventData`/`pullMasterData`/
`syncAllPendingEvents`. Sigue funcionando 100% offline si no hay cloud configurada (el nuevo
endpoint devuelve un error claro, criterio 8, no un crash). El único cambio a un flujo existente
es agregar el push de `audit_logs` al cierre de noche — no bloqueante (fire-and-forget, mismo
patrón que `syncEventToCloudBackground`, un fallo ahí no debe impedir que la noche cierre).

### Real-time (SSE)

Sin cambios de contrato de eventos. Opcional (no bloqueante para esta spec): emitir un evento SSE
tipo `restore.completed` para que otras pantallas abiertas (ej. otra pestaña de `/admin`) se
enteren sin poll manual — se puede resolver en `/tasks` como nice-to-have, no es necesario para
cumplir los criterios de aceptación (el admin que dispara el restore ya ve el resultado en su
propia pantalla).

### Auth/permisos

`POST /api/system/restore` requiere el mismo guard que `/sync` hoy
(`authMiddleware` + `requireRole("admin", "caja", "barman")` — **revisar en `/tasks` si conviene
restringir a solo `admin`**, dado que es una acción de recuperación de emergencia con el criterio
de "gana cloud" que puede pisar datos locales recientes; hoy `/sync` es staff genérico pero
`restore` tiene más blast radius). Re-autenticación con contraseña vía `authenticate()`, mismo
patrón que `/shutdown` y `CloseNightModal`.

### Riesgos

- **Divergencia de esquema no detectada a tiempo** (la razón de todo el trabajo de verificación en
  vivo de esta sección) — mitigado: ya se confirmaron las 3 tablas transaccionales antes de
  comprometerse al diseño. Si en `/tasks`/implementación aparece alguna columna sorpresa, repetir
  el mismo patrón de verificación en vivo antes de escribir el mapeo.
- **FK violation en cascada** (`orders.event_id`/`tickets.order_id` con `ON DELETE CASCADE`): si el
  batch de `night_events` falla parcialmente, un `order` cuyo `event_id` no llegó a upsertearse
  falla con `23503` (constraint real de Postgres, no hay forma de saltearlo ni conviene) — el
  batch de `orders` tiene que capturar ese error específico y reportarlo distinguible ("N orders
  no restaurados: night_event no disponible"), no mezclarlo con un error genérico.
- **Volumen real desconocido**: se asume "escala de un boliche" (decenas de noches, no miles) — si
  algún día el volumen crece mucho, el patrón de `select("*")` sin paginar empieza a truncarse en
  1000 filas por tabla (límite default de PostgREST) de forma silenciosa. No se resuelve ahora
  (fuera de alcance a propósito, ver spec), pero **hay que anotarlo como deuda conocida** si se
  llega a ese volumen.
- **Reautenticación con contraseña en un endpoint de "solo lectura hacia cloud, escritura local"**:
  revisar que el mensaje de error de contraseña incorrecta no dé pistas de qué credenciales existen
  (mismo cuidado que ya tiene `/shutdown`).

### Alternativas consideradas

- **RPC/función Postgres transaccional para el restore completo**: descartada — mismo
  razonamiento que en `atomicidad-canje-ticket` (ver esa spec): la invariante acá no necesita una
  transacción real, con upserts idempotentes por id y un orden de escritura correcto (night_events
  antes que sus hijos) alcanza, sin agregar el primer stored procedure del proyecto.
- **Cursor incremental** (traer solo lo que falta en local comparando ids antes de pedir a cloud):
  descartada para esta iteración — a la escala de un boliche, traer la tabla completa y dejar que
  el upsert por id sea el mecanismo de "solo lo nuevo importa" es más simple y decisión reversible
  si el volumen crece.
- **Restaurar solo `night_events`+`totals` (sin desagregar orders/tickets/cash_sales)**: descartada
  — el objetivo explícito de la spec es que el Historial de Noches en `/admin` funcione idéntico
  después de un restore, y esa vista consume el detalle desagregado (drinks vendidos, sesiones
  individuales), no solo el agregado.

### Corrección encontrada al escribir las tareas

El plan asumía que ya existía un botón "Sincronizar" en `/admin` cerca del cual ubicar el nuevo
botón de restore. **No es así** — se confirmó (grep sobre `apps/web/src`) que `POST
/api/system/sync` y `GET /api/system/status` **no tienen ningún consumidor en el frontend hoy**;
son endpoints que solo se usaron manualmente (curl) hasta ahora. Esto no cambia el diseño del
backend, pero sí las tareas de frontend: hay que crear la UI de sync/backup desde cero, no
"agregar al lado de" algo existente. El lugar más natural es `LogsSection.tsx` (ya muestra
`audit_logs`, es la pestaña más afín a "sistema/auditoría" que existe en el sidebar de
`/admin` hoy — pestañas actuales: `monitoreo`/`historial`/`logs`/`carta`/`pagos`/`usuarios`).

---

## Tareas

### Backend — `CloudSyncRepository` (extiende el repo de hoy)

- [x] `apps/api/src/modules/sync/cloud-sync.repository.ts` — agregar tipo `RestoreTableResult =
  { ok: number; failed: number; error?: string }` a la interfaz `CloudSyncRepository`.
- [x] Agregar `pullNightEvents(): Promise<RestoreTableResult>` — mapeo explícito (`status:
  "cerrado"` forzado, sin `totals`, `sync_status: "synced"`, `synced_at: now`), batches de ~500,
  chequea el error del upsert local explícito.
- [x] Agregar `pullOrders(): Promise<RestoreTableResult>` — mapeo inverso a `pushOrders` (columnas
  1:1 confirmadas en vivo), batches de ~500. Capturar el error `23503` (FK violation contra
  `night_events`) por separado del resto y reportarlo distinguible en el `error` del resultado
  ("N pedidos no restaurados: la noche asociada no llegó de cloud").
- [x] Agregar `pullTickets(): Promise<RestoreTableResult>` — mapeo inverso a `pushTickets`.
- [x] Agregar `pullCashSales(): Promise<RestoreTableResult>` — mapeo inverso a `pushCashSales`.
- [x] Agregar `pushAuditLogs(): Promise<RestoreTableResult>` — `supabase.from("audit_logs").select("*")`
  → `supabaseCloud.from("audit_logs").upsert(...)`, tabla completa, bypasea `AuditLogsService`
  (mismo criterio que `pullUsers`/`pullDrinks`).
- [x] Agregar `pullAuditLogs(): Promise<RestoreTableResult>` — inverso.

### Backend — `SyncService` (orquestación)

- [x] `apps/api/src/modules/sync/sync.service.ts` — nuevo tipo `RestoreResult = { nightEvents,
  orders, tickets, cashSales, auditLogs: RestoreTableResult }` (importado de `cloud-sync.repository.ts`
  o definido acá).
- [x] Nuevo método `restoreFromCloud(): Promise<RestoreResult>` — llama en orden
  `pullNightEvents()` → `pullOrders()` → `pullTickets()` → `pullCashSales()` → `pullAuditLogs()`.
  Cada paso en su propio try/catch, nunca aborta el resto si uno falla (criterio 7). Si
  `!cloudSyncRepo.isConfigured()`, devuelve un resultado con `error` claro en cada tabla sin
  intentar nada (criterio 8).
- [x] Nuevo método delgado `pushAuditLogsIfConfigured(): Promise<void>` — wrapper sobre
  `cloudSyncRepo.pushAuditLogs()`, no lanza (fire-and-forget, mismo criterio que
  `syncEventToCloudBackground`).
- [x] `apps/api/src/modules/events/events.service.ts` — en `syncEventToCloudBackground` (o el
  punto de cierre de noche), agregar la llamada a `this.syncService.pushAuditLogsIfConfigured()`
  (criterio 5).

### Backend — controller

- [x] `apps/api/src/modules/system/system.controller.ts` — nuevo `POST /api/system/restore`.
  Guard: **decidir en esta tarea** si es `requireRole("admin")` únicamente (recomendado en el
  plan, dado el blast radius de "gana cloud") o el mismo staff genérico que `/sync` — confirmar
  con el usuario si hay duda. Recibe `{ password }`, re-autentica con `authenticate()` (mismo
  patrón que `/shutdown`), en caso de fallo `401` sin detalle de qué credencial existe. Si OK,
  llama `syncService.restoreFromCloud()` y devuelve el `RestoreResult` completo, `200`.

### Tests backend

- [x] `cloud-sync.repository.test.ts` — agregar tests para cada `pull*`/`pushAuditLogs`: caso
  éxito, caso "upsert local falla" (mismo patrón que el test ya existente para `pullDrinks`),
  caso FK violation en `pullOrders` reportado distinguible.
- [x] `sync.service.test.ts` — tests de `restoreFromCloud()`: éxito total, falla parcial (una
  tabla falla, las demás igual se intentan y el resultado lo refleja), sin cloud configurada.
- [x] Test de integración nuevo (`apps/api/tests/integration/system.integration.test.ts` o un
  archivo nuevo) — `POST /api/system/restore` contra Supabase local real: sembrar datos en el
  local "cloud" de test (o mockear cloud si no hay proyecto de test separado — confirmar
  estrategia), verificar que el `RestoreResult` sea correcto y que los datos queden en la base
  local. **Ojo**: correr esto contra Supabase Cloud REAL (no un mock) al menos una vez a mano
  durante la implementación, mismo criterio que se usó para verificar el push en la spec
  `deuda-estructural-fase2` — es la única forma honesta de confirmar el mapeo de columnas.

### Frontend

- [x] `apps/web/src/services/` — crear `system.service.ts` (no existe hoy) con `restore(password:
  string)` → `POST /api/system/restore`, y de paso `getStatus()` → `GET /api/system/status` si se
  decide mostrar el estado del sistema en la misma pantalla (opcional, no bloqueante para los
  criterios de aceptación).
- [x] `apps/web/src/components/admin/LogsSection.tsx` (candidato más afín, confirmar antes de
  implementar) — agregar el botón "Restaurar desde backup" + modal de confirmación con campo de
  contraseña (mismo patrón visual que `CloseNightModal`) + render del `RestoreResult` tabla por
  tabla ("Noches: 12/12", "Pedidos: 340/342 — 2 fallaron: night_event no disponible", etc.) —
  criterios 1 y 9.
- [x] Test del componente nuevo/modificado (mismo patrón que el resto de `components/admin/*.test.tsx`).

### Documentación y cierre

- [x] `docs/ARCHITECTURE.md` §6 (Sincronización) — documentar la dirección nueva (cloud→local para
  historial completo, no solo master data) y el endpoint `POST /api/system/restore`.
- [x] `docs/ROADMAP.md` — agregar esta feature como completada cuando cierre, referenciando el
  incidente real de hoy (drinks vacíos) como motivación.
- [x] `pnpm typecheck` (api + web) en verde.
- [x] Suite completa (unit + integration, api + web) en verde.
- [x] Probar manualmente el escenario completo: vaciar `drinks`/`night_events` en LOCAL (no en
  cloud — mismo cuidado que ya se tuvo hoy con los datos de prueba), apretar "Restaurar desde
  backup" en `/admin`, confirmar que todo vuelve — este es el test end-to-end real que motivó la
  spec, no debería saltarse.
- [x] Cambiar el estado de esta spec de `draft` a `done`.

---

**Siguiente paso**: implementar en Plan Mode — toca sync real contra Supabase Cloud (mismo nivel
de cuidado que el punto 2 de `deuda-estructural-fase2`), un endpoint nuevo con re-autenticación, y
UI nueva desde cero. Verificar cada tabla del `RestoreResult` contra cloud real antes de dar la
tarea por completa, no confiar solo en tests con mocks.
