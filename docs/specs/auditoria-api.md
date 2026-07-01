# Auditoría de apps/api — SOLID/clean code + tests reales (Fase 1 de 3)

**Estado**: done
**Fecha**: 2026-07-01

> Fase 1 de una iniciativa de 3 fases: **API** (esta spec) → **Web** (god-components:
> `AdminClient.tsx` 3425 líneas, `CajaClient.tsx` 2186, `BarraClient.tsx` 1517) → **E2E** de los
> flujos completos una vez que ambos bloques estén auditados. Cada fase tiene su propia spec en
> `docs/specs/`. Ver `docs/ROADMAP.md`.

---

## Problema / Por qué

`apps/api` no tiene **ningún test**: no hay test runner instalado, no existe un solo archivo
`*.test.ts` en todo el repo. Cualquier cambio (fix, refactor, feature nueva) se verifica hoy a mano
o con `pnpm typecheck`, que solo detecta errores de tipos, no de comportamiento. Esto hace que tocar
código existente sea riesgoso — no hay forma automática de saber si un cambio rompió algo.

Además, la API nunca pasó por una auditoría formal de SOLID/clean code. Aunque a nivel de tamaño de
archivo está razonablemente modularizada (el módulo más grande, `events.service.ts`, tiene 340
líneas), eso no garantiza que las responsabilidades estén bien separadas entre capas
(Controller → Service → Repository) ni que no haya violaciones de SRP, dependencias mal
abstraídas o lógica duplicada entre módulos.

Antes de atacar el problema mucho más visible del frontend (componentes de miles de líneas), se
quiere dejar la API con una red de seguridad de tests reales y el código ya revisado, para que la
Fase 2 (Web) y la Fase 3 (E2E) se apoyen en una base confiable.

## Objetivo

- Cada uno de los 9 módulos de `apps/api/src/modules` (`config`, `tickets`, `auth`, `drinks`,
  `orders`, `users`, `events`, `sync`, `system`) tiene **tests de caracterización** que capturan su
  comportamiento real actual, antes de tocar nada.
- Cada módulo pasa por una **auditoría SOLID/clean code** (violaciones de SRP, abstracciones de
  repositorio mal usadas, duplicación de lógica, mezcla de validación + negocio + acceso a datos en
  el mismo bloque) y se corrige lo que corresponda.
- Los tests quedan **actualizados/ampliados** para cubrir el código ya corregido, de forma que
  reflejan el comportamiento final, no solo el original.
- Queda un test runner instalado y scripteado (`pnpm --filter api test`, `test:unit`,
  `test:integration`, `test:coverage`) que cualquiera puede correr localmente.

## Historias de usuario

- Como **desarrollador** quiero que un cambio en un servicio o repositorio de la API me avise
  automáticamente si rompió el comportamiento existente, para no depender de probar todo a mano.
- Como **desarrollador** quiero que el código de cada módulo respete responsabilidades claras entre
  Controller, Service y Repository, para que agregar una feature nueva no implique tocar lógica
  mezclada en un solo archivo.
- Como **dueño del proyecto** quiero que la base de la API esté sólida y verificada antes de que se
  invierta tiempo en refactorizar el frontend, para no arrastrar bugs de la API hacia una fase que
  depende de ella.

## Criterios de aceptación

- **Dado** cualquiera de los 9 módulos, **cuando** se corre `pnpm --filter api test`, **entonces**
  existen tests unitarios (servicio con repositorio mockeado) e tests de integración (Supertest
  contra el endpoint real, con el stack Supabase local corriendo) que pasan en verde.
- **Dado** el código ya auditado, **cuando** se corre `pnpm typecheck`, **entonces** no hay errores
  en `apps/api`.
- **Dado** un módulo con hallazgos de `architect-reviewer`, **cuando** el fix es chico y de bajo
  riesgo, **entonces** se aplica directo y los tests de caracterización siguen pasando sin
  modificación (o se documenta en el commit por qué cambió el comportamiento esperado).
- **Dado** un hallazgo estructural (mover código entre capas, dividir una clase/servicio),
  **cuando** se detecta, **entonces** se documenta como tarea explícita antes de implementarlo (vía
  `/plan` + `/tasks`), no se aplica "de paso".
- **Dado** que la Fase 1 se da por terminada, **cuando** se revisa `docs/ROADMAP.md`, **entonces**
  está marcada como completa y aparecen registradas las Fases 2 (Web) y 3 (E2E post-refactor) como
  próximos pasos.

## Fuera de alcance

- No se modifica el modelo de datos ni las migraciones de Supabase, salvo que un hallazgo de la
  auditoría lo requiera explícitamente — en ese caso se coordina aparte con `supabase-expert` y se
  documenta como su propia tarea, no como parte silenciosa de esta fase.
- No se toca `apps/web` en esta fase (es la Fase 2).
- No se agregan tests E2E de flujos completos todavía (es la Fase 3, posterior al refactor de ambos
  bloques).
- No se cambia el comportamiento observable de la API salvo que sea el fix explícito de una
  violación SOLID detectada — esto no es una fase de features nuevas.

## Plan técnico

### Enfoque

Se instala Vitest + Supertest en `apps/api` sin tocar `apps/web`. Los tests unitarios usan mocks de
repositorio (no requieren Docker); los de integración corren contra el stack Supabase local real
(`docker compose up`) usando el mismo cliente `service_role` que usa el backend en producción, con
limpieza selectiva por `DELETE` (no `TRUNCATE`, ver más abajo) entre tests. Se recorre módulo por
módulo en el orden ya fijado; cada módulo pasa por: tests de caracterización → revisión de
`architect-reviewer` → fix (directo si es chico, o registrado como tarea si es estructural) → tests
actualizados. No hay cambios de esquema salvo que un hallazgo lo requiera explícitamente.

### Archivos/módulos afectados

- **`apps/api/package.json`** — nuevas devDependencies (`vitest`, `@vitest/coverage-v8`,
  `supertest`, `@types/supertest`) y scripts `test`, `test:unit`, `test:integration`,
  `test:coverage`.
- **`apps/api/vitest.config.ts`** — config raíz: `globalSetup` para integración, `environment: node`.
- **`apps/api/tests/setup/global-setup.ts`** — verifica que `SUPABASE_URL` responda antes de correr
  `test:integration` (aborta con mensaje claro si no).
- **`apps/api/tests/setup/db-helpers.ts`** — helpers de limpieza por módulo (`cleanNightEvents()`,
  `cleanUsers()`, `cleanDrinks()`, `cleanAppConfig()`, `cleanAuditLogs()`) y factories mínimas
  (`createTestAdmin()`, `createOpenNightEvent()`), usando `supabase-js` con `service_role`.
- **`apps/api/.env.test`** — env de test: mismas `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` que
  `.env` local, pero **sin** `SUPABASE_CLOUD_*` (para que el sync a nube nunca se dispare en tests).
- **Por cada uno de los 9 módulos** (`config, tickets, auth, drinks, orders, users, events, sync,
  system`), en `apps/api/src/modules/<modulo>/`:
  - `<modulo>.service.test.ts` (unitario, co-ubicado, repo mockeado con `vi.fn()`).
  - `apps/api/tests/integration/<modulo>.integration.test.ts` (Supertest contra `app.ts` real).
- Los fixes de la auditoría SOLID caen en los archivos ya existentes de cada módulo
  (`*.service.ts`, `*.repository.ts`, `*.controller.ts`) — sin archivos nuevos salvo que
  `architect-reviewer` recomiende extraer una clase/abstracción, en cuyo caso se documenta como
  tarea explícita en `/tasks` antes de crearla.

### Cambios de datos

- **Sin migraciones nuevas** en esta fase (fuera de alcance salvo hallazgo explícito).
- **Sin cambios en `packages/shared/src/domain.ts`** — esta fase no toca contratos de dominio.
- **Estrategia de limpieza entre tests de integración** (validada con `supabase-expert`):
  - PostgREST **no expone `TRUNCATE`** (solo DML), así que la limpieza es por `DELETE ... WHERE
    true` vía `service_role` — alcanza porque los PKs son `UUID`, no hay `serial`/`identity` que
    resetear.
  - `night_events → orders → tickets (1:1) → cash_sales` son todas `ON DELETE CASCADE`: un
    `DELETE FROM night_events` tira abajo `orders`, `tickets` y `cash_sales` en cascada. Se limpian
    aparte (sin relación entre sí): `users`, `drinks`, `app_config`, `audit_logs` (esta última sin
    FK a `users`, confirmado en `20260629201500_create_audit_logs.sql`).
  - Cada módulo limpia **solo las tablas que toca**, no toda la base — minimiza blast radius entre
    tests y no descarta paralelismo futuro (`test.concurrent`).
  - **No se usa un esquema `test` separado** — agregaría setup redundante (migrar dos veces,
    mantener paridad) sin resolver nada que el `DELETE` selectivo no resuelva ya.
  - Fixtures mínimas: un `admin` en `users` vía `createTestAdmin()` (necesario porque casi todo
    endpoint mutante valida sesión/rol) y un `night_event` en `open` vía `createOpenNightEvent()`
    como factory explícita — **no global** — que solo invocan los tests de `orders`/`tickets`/
    `sync` que la necesitan (no `config`/`drinks`/`users`).
- **Offline-first / sync**: no se ve afectado — los tests de integración corren solo contra
  `supabase` (local); `.env.test` deja `SUPABASE_CLOUD_*` sin setear para que `pushEventData` /
  `pullMasterData` nunca se disparen contra una nube real durante la corrida.

### Real-time

No se agregan ni consumen eventos SSE nuevos. Los tests de integración que ejercitan endpoints que
emiten `DomainEvent` (`order.created`, `event.opened`, etc. vía `modules/sse/sse.controller.ts` /
`shared/sse/sse-manager.ts`) no necesitan abrir una conexión `EventSource` real — alcanza con
verificar el efecto persistido (fila en la tabla) y, si corresponde, que el service llamó al
`SseManager` mockeado en el test unitario. Verificar el frame SSE en sí (end-to-end) queda para la
Fase 3.

### Auth/permisos

Los tests de integración de endpoints protegidos (`users`, `config`, `events` open/close, `tickets`
redeem, `system`) necesitan simular la cookie HMAC `cocktrail_session` real — se agrega un helper
`signTestSession(role, username)` en `db-helpers.ts` que replica la firma de
`auth.middleware.ts`/`auth.service.ts` usando el mismo `AUTH_SECRET` del `.env.test`, para no
mockear el middleware de auth y así también cubrirlo con los tests de integración.

### Riesgos

- **Contaminación de datos de dev**: los tests de integración corren contra la **misma** instancia
  Docker que usa el dev para trabajar (no hay DB de test separada). Mitigación: `DELETE` acotado por
  módulo + fixtures propias con IDs generados en cada test, nunca IDs fijos que puedan chocar con
  datos reales cargados a mano. Si esto genera fricción en la práctica, revisar en `/tasks` si
  conviene un segundo container Postgres dedicado a tests (se descartó ahora por complejidad, no por
  imposibilidad).
- **`R5` (deuda ya conocida)**: credencial `cajavip/cajavip` hardcodeada en `auth.service.ts` — si
  la auditoría SOLID de `auth` la toca, se resuelve ahí y se marca en el ROADMAP; si no, queda
  igual y se anota como pendiente.
- **`R7` (deuda ya conocida)**: apikeys demo de Kong hardcodeadas — no se toca en esta fase (no es
  código de `apps/api`), pero los tests de integración dependen de que ese stack siga arrancando tal
  cual está.
- Migrar código entre capas durante la auditoría SOLID puede introducir regresiones silenciosas si
  el refactor se hace **antes** de tener el test de caracterización de ese módulo — por eso el orden
  fijado en la spec (tests primero, refactor después) es no negociable módulo por módulo.
- Los **módulos `printer`, `mercadopago`, `cash-sales`, `audit-logs` y `sse`** no están en la lista
  de 9 módulos de la spec — quedan **sin tests ni auditoría en esta fase**. Se deja anotado en
  `docs/ROADMAP.md` como pendiente para una fase futura (no se decide ahora si es Fase 2.5 o se
  suma a la Fase 3), para que no se pierda de vista.

### Alternativas consideradas

- **Jest en vez de Vitest** — descartado: Vitest tiene mejor soporte nativo de ESM/TS (el repo ya
  usa `"type": "module"` + `tsx`), arranca más rápido y comparte config con lo que ya podría usar
  `apps/web` a futuro si se decide testear el front con el mismo runner.
- **Mockear Supabase en vez de tests de integración reales** — descartado para la capa de
  integración: el objetivo explícito de la spec es tener red de seguridad real contra el cableado
  Controller→Service→Repository→DB, no solo contra la lógica de negocio aislada (eso ya lo cubren
  los unitarios).
- **Esquema Postgres `test` separado dentro del mismo container** — descartado (ver "Cambios de
  datos"): complejidad de mantener migraciones duplicadas sin beneficio real dado que los tests
  corren serializados.
- **`pg` (driver directo) para todo el helper de limpieza** — descartado por ahora: el `DELETE` vía
  `supabase-js`/`service_role` alcanza porque los PKs son `UUID`. Se deja anotado que si aparece un
  caso real que necesite `TRUNCATE`/reset de secuencia, ahí sí se suma `pg` solo al helper de test
  (nunca a código de producción).

## Tareas

### 0. Setup del test runner (bloquea todo lo demás)

- [x] Instalar devDependencies en `apps/api/package.json`: `vitest`, `@vitest/coverage-v8`,
  `supertest`, `@types/supertest`.
- [x] Agregar scripts en `apps/api/package.json`: `test`, `test:unit`, `test:integration`,
  `test:coverage`.
- [x] Crear `apps/api/vitest.config.ts` (environment `node`, `globalSetup` solo para
  `test:integration`).
- [x] Crear `apps/api/tests/setup/global-setup.ts` — verifica que `SUPABASE_URL` responda antes de
  `test:integration`; aborta con mensaje claro si el stack Docker no está arriba.
- [x] Crear `apps/api/.env.test` (copia de `.env` local **sin** `SUPABASE_CLOUD_*`).
- [x] Crear `apps/api/tests/setup/db-helpers.ts` con: `cleanNightEvents()` (cascadea
  orders/tickets/cash_sales), `cleanUsers()`, `cleanDrinks()`, `cleanAppConfig()`,
  `cleanAuditLogs()`, `createTestAdmin()`, `createOpenNightEvent()`, `signTestSession(role,
  username)`.
- [x] Correr `pnpm --filter api test` (debe pasar vacío/sin suites todavía, solo valida que el
  runner arranca) y confirmar que `docker compose up` + `global-setup.ts` detectan el stack
  correctamente.

### 1. Módulo `config` (menor riesgo, arranca la iteración)

- [x] Tests de caracterización: `apps/api/src/modules/config/config.service.test.ts` (unitario,
  repo mockeado) + `apps/api/tests/integration/config.integration.test.ts` (Supertest, `GET/POST
  /api/config`, tokens enmascarados).
- [x] `architect-reviewer` audita `config.controller.ts` + `config.repository.ts` contra SOLID.
- [x] Aplicar fixes chicos directo; si hay hallazgo estructural, anotarlo en esta checklist como
  sub-tarea antes de tocarlo.
- [x] Actualizar/ampliar los tests sobre el código ya corregido.
- [x] `pnpm typecheck` en verde.

### 2. Módulo `tickets`

- [x] Tests de caracterización: `tickets.service.test.ts` (unitario) +
  `tests/integration/tickets.integration.test.ts` (`POST /api/tickets/redeem`, incluye caso de
  doble canje — ver riesgo `R3` del ROADMAP).
- [x] `architect-reviewer` audita `tickets.controller.ts` / `tickets.service.ts` /
  `tickets.repository.ts` / `tickets.crypto.ts`.
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 3. Módulo `auth`

- [x] Tests de caracterización: `auth.service.test.ts` (unitario, incluye fallback de usuarios por
  env) + `tests/integration/auth.integration.test.ts` (`POST /login`, `/logout`, `GET /me`,
  captcha tras 3 fallos, rate limiting).
- [x] `architect-reviewer` audita `auth.controller.ts` / `auth.service.ts` / `auth.middleware.ts`.
  Revisar explícitamente la credencial hardcodeada `cajavip/cajavip` (deuda `R5` del ROADMAP) — si
  entra en el hallazgo, resolverla acá y marcar `R5` como resuelta.
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 4. Módulo `drinks`

- [x] Tests de caracterización: `drinks.service.test.ts` (unitario) +
  `tests/integration/drinks.integration.test.ts` (`GET`, `POST/PATCH/DELETE` admin-only).
- [x] `architect-reviewer` audita `drinks.controller.ts` / `drinks.service.ts` /
  `drinks.repository.ts`.
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 5. Módulo `orders`

- [x] Tests de caracterización: `orders.service.test.ts` (unitario, incluye máquina de estados
  `pagado→preparando→listo→entregado` + `cancelado`) +
  `tests/integration/orders.integration.test.ts` (`POST /api/orders`, `GET /by-token/:token`,
  `GET /active`, `PATCH /:id`, transiciones inválidas rechazadas).
- [x] `architect-reviewer` audita `orders.controller.ts` / `orders.service.ts` /
  `orders.repository.ts` (foco: la máquina de estados no debería vivir mezclada con acceso a
  datos).
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 6. Módulo `users`

- [x] Tests de caracterización: `users.service.test.ts` (unitario, incluye hash de password) +
  `tests/integration/users.integration.test.ts` (`GET/POST/PATCH/DELETE`, permisos granulares
  `UserPermissions`).
- [x] `architect-reviewer` audita `users.controller.ts` / `users.service.ts` /
  `users.repository.ts` (es el repo más grande del set, 229 líneas — foco en SRP).
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 7. Módulo `events`

- [x] Tests de caracterización: `events.service.test.ts` (unitario, incluye auto-cierre por día
  calendario AR) + `tests/integration/events.integration.test.ts` (`POST /open` con keyword
  obligatoria, `PATCH /current/keyword`, `POST /close`, `GET /history`, `GET /state`).
- [x] `architect-reviewer` audita `events.controller.ts` / `events.service.ts` /
  `events.repository.ts` (es el módulo más grande, 340+200 líneas — foco en SRP y si la lógica de
  auto-cierre debería vivir en el service o en un colaborador aparte).
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 8. Módulo `sync`

- [x] Tests de caracterización: `sync.service.test.ts` (unitario, mockeando ambos clientes
  `supabase`/`supabaseCloud`: `pullMasterData`, `pushEventData`, `syncAllPendingEvents`,
  `ensureLocalMasterDataSeeded`). **Sin test de integración contra cloud real** — se simula con
  mocks, ya que no hay Supabase Cloud disponible en CI/local del dev.
- [x] `architect-reviewer` audita `sync.service.ts` (foco: mezcla de pull/push/seed en una sola
  clase — evaluar si conviene separar responsabilidades).
- [x] **Recomendado**: co-revisar con `supabase-expert` cualquier fix que toque el cálculo de
  `computeTotals` o el manejo de `sync_status`, dado que ya hay deuda conocida (`R2`: columna
  `night_events.totals` no está en migraciones locales).
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 9. Módulo `system`

- [x] Tests de caracterización: `system.controller.ts` no tiene service/repo propio — tests de
  integración directos en `tests/integration/system.integration.test.ts` (`GET /status`, `/logs`,
  `POST /sync`, `POST /shutdown` — este último con cuidado de no matar el proceso real del test
  runner, mockear el `process.exit`/handler correspondiente).
- [x] `architect-reviewer` audita `system.controller.ts` (242 líneas, es el 2do más grande del
  set — foco en si debería tener un service propio en vez de lógica inline en el controller).
- [x] Aplicar fixes chicos directo; documentar hallazgos estructurales como sub-tarea.
- [x] Actualizar/ampliar tests sobre el código corregido.
- [x] `pnpm typecheck` en verde.

### 10. Cierre de la fase

- [x] Correr `pnpm --filter api test` completo (unit + integration) y `pnpm --filter api
  test:coverage` — revisar que no haya módulos con cobertura sospechosamente baja.
- [x] Correr `pnpm typecheck` en la raíz (api + web) — debe pasar en verde.
- [x] Actualizar `docs/ROADMAP.md`: marcar la Fase 1 (auditoría API) como completa, agregar la
  Fase 2 (auditoría Web / god-components) y Fase 3 (E2E post-refactor) como próximos pasos
  explícitos, y actualizar el estado de `R5` (si se resolvió en el módulo `auth`) y anotar que
  `printer`/`mercadopago`/`cash-sales`/`audit-logs`/`sse` quedaron sin cobertura en esta fase.
- [x] Actualizar `docs/ARCHITECTURE.md` **solo si** algún refactor estructural cambió el mapa de
  capas/módulos descrito en §4; si los fixes fueron todos internos sin cambiar la forma pública del
  módulo, no hace falta tocarlo.
- [x] Cambiar el estado de esta spec (`docs/specs/auditoria-api.md`) de `approved` a `done`.

---

> **Nota de implementación**: dado el tamaño (9 módulos × tests + auditoría + fixes), conviene
> implementar con **Plan Mode** módulo por módulo (no todo de una), tildando `- [x]` a medida que
> cada sección se completa y corre en verde antes de pasar a la siguiente.

## Preguntas abiertas

- Ninguna pendiente de decisión de producto: el enfoque (orden de trabajo, stack de testing,
  estructura de archivos, criterio de módulo por módulo, criterio de "terminado") ya se validó en la
  sesión de brainstorming previa a esta spec. Quedan para `/plan`: mapeo concreto de qué tablas
  truncar por módulo en el `afterEach` de integración, y el detalle de fixtures/seed mínimo por
  módulo.
