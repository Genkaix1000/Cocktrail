# Empaquetado Windows (Fase 6 — primera vuelta)

**Estado**: draft
**Fecha**: 2026-07-13
**Diseño previo**: [`docs/plans/06-empaquetado/2026-07-13-empaquetado-windows-design.md`](../../plans/06-empaquetado/2026-07-13-empaquetado-windows-design.md)

## Problema / Por qué

Hoy Cocktrail corre solo en modo desarrollo: hace falta tener Node y Docker instalados, saber
correr `docker compose up` y `pnpm dev`, y entender la arquitectura para levantar el sistema.
Eso es inviable para el dueño del boliche, que solo tiene una compu con Windows 10 que va a
dejar prendida como servidor. El ROADMAP (Fase 6) ya identificó que Docker no se puede
empaquetar tal cual, pero todavía no existe ninguna forma de que alguien sin conocimientos
técnicos deje el sistema andando solo, ni de que el personal (admin/caja) entre desde la
tablet sin escribir una IP a mano.

## Objetivo

Que la compu Windows 10 que actúa de servidor, al prenderse, deje el sistema completo
funcionando solo (sin que nadie abra una terminal ni corra un comando), y que desde una
tablet en la misma red se pueda entrar a Admin y a Caja escribiendo un nombre fácil de
recordar (no una IP), con un ícono en la pantalla de inicio que se sienta como una app y no
como "abrir el navegador". El cobro con Posnet Mercado Pago tiene que funcionar de punta a
punta, igual que hoy en desarrollo.

Barra y Carta no forman parte de esta vuelta: van a seguir existiendo en el código pero no van
a estar accesibles desde ningún lado del producto empaquetado (se habilitan en una fase
posterior).

**Nota sobre la impresora térmica**: hoy el módulo de impresión asume que la impresora está
conectada por USB a la misma máquina que corre el backend (escribe directo a un dispositivo
del sistema de archivos del server). En el uso real, la impresora va conectada por USB o
Bluetooth **a la tablet** (Android), no al servidor — eso es un cambio de arquitectura del
módulo de impresión en sí (el navegador de la tablet pasa a ser quien le habla a la impresora,
vía Web Bluetooth/WebUSB), independiente de Windows/Docker. Por eso la impresión física queda
**fuera de esta spec** y se resuelve en una spec propia (ver "Fuera de alcance").

## Historias de usuario

- Como **dueño del boliche**, quiero prender la compu servidor y que el sistema esté listo
  solo, para no tener que saber nada de terminales, Docker ni Node.
- Como **admin**, quiero entrar desde la tablet a un nombre fácil de recordar (no una IP) y
  tener un ícono en la pantalla de inicio, para operar el panel como si fuera una app.
- Como **cajera**, quiero lo mismo que el admin pero para la pantalla de Caja: entrar por un
  nombre fácil, con su propio ícono, y poder cobrar con el Posnet sin que nada dependa de
  Docker (la impresión física del ticket queda resuelta en una spec aparte).
- Como **persona que instala el sistema** (yo, en esta primera prueba), quiero copiar una
  carpeta y correr un único paso de instalación, para no tener que instalar Node, Postgres ni
  Docker por separado en la compu Windows.

## Criterios de aceptación

1. **Given** una compu Windows 10 sin Node/Postgres/Docker instalados, **when** se copia la
   carpeta del paquete y se ejecuta el paso de instalación una sola vez, **then** el sistema
   queda configurado para arrancar solo en cada inicio de la compu, sin pasos manuales
   adicionales.
2. **Given** la compu servidor recién prendida, **when** pasa el tiempo de arranque, **then**
   Admin y Caja quedan accesibles desde un dispositivo en la misma red LAN sin que nadie haya
   abierto una terminal.
3. **Given** una tablet en la misma red LAN, **when** se accede al hostname fácil de recordar
   (no una IP numérica) desde el navegador, **then** Admin y Caja cargan correctamente.
4. **Given** esa misma tablet, **when** se usa la opción "agregar a pantalla de inicio" del
   navegador para Admin y para Caja, **then** quedan dos íconos independientes que abren cada
   pantalla a pantalla completa, sin barra de direcciones visible.
5. **Given** el sistema empaquetado corriendo, **when** se hace un cobro en Caja con el Posnet
   físico de Mercado Pago, **then** el cobro se confirma y el pedido pasa de estado igual que
   en el entorno de desarrollo actual.
6. **Given** el sistema empaquetado corriendo, **when** se confirma un pedido/cobro que debe
   imprimir ticket, **then** el flujo de negocio se completa igual que hoy aunque la impresión
   física quede pendiente (se valida en la spec de impresión-en-tablet, fuera de esta ronda).
7. **Given** el sistema empaquetado corriendo, **when** se navega a las rutas de Barra o de
   Carta (o se busca algún link hacia ellas en Admin/Caja), **then** no hay ningún acceso
   visible ni link que lleve ahí (el código puede seguir existiendo, pero no debe ser
   alcanzable desde la UI ni promocionado como opción disponible).
8. **Given** el paquete instalado, **when** se reinicia la compu servidor, **then** todos los
   datos cargados antes del reinicio (noche, pedidos, tickets, config) siguen disponibles —
   no se pierde información entre reinicios.
9. **Given** el entorno de desarrollo actual (`docker compose` + `pnpm dev`), **when** se
   trabaja normalmente en la rama de desarrollo, **then** nada de este empaquetado lo
   interrumpe ni lo reemplaza — siguen siendo dos formas de correr el sistema, no una
   migración del entorno de desarrollo.

## Fuera de alcance

- **Impresión térmica física**: la impresora va conectada por USB/Bluetooth a la tablet
  (Android), no al servidor. El módulo actual (`apps/api/src/modules/printer/`) asume backend
  con USB local y no sirve para ese caso — requiere rediseño (el navegador de la tablet habla
  con la impresora vía Web Bluetooth/WebUSB) que se define en una spec propia, no en esta.
  Esta ronda valida el flujo de negocio hasta la confirmación del cobro/pedido, sin la
  impresión física real.
- Habilitar las pantallas de Barra y de Carta (queda para la fase siguiente, ya conversada).
- Instalador gráfico tipo "Next, Next, Finish" (.exe/.msi) — esta vuelta usa un paso de
  instalación más simple (carpeta + un único comando), no un instalador con interfaz.
- Shell de escritorio tipo Electron/Tauri — no hace falta porque el uso es 100% por navegador.
- Empaquetado para macOS/Linux como producto (el docker-compose de desarrollo sigue siendo
  Linux-friendly; empaquetar para otros SO de "producto" queda para más adelante si hace
  falta).
- Multi-tenant / RLS por boliche (ítem propio de Fase 6 en el ROADMAP, no de esta vuelta).
- Reemplazar o modificar el flujo de desarrollo actual (`docker compose` + `pnpm dev`).
- Firma de código / distribución fuera de esta prueba puntual (no se está preparando un
  release público todavía, es una prueba en una compu específica).

## Preguntas abiertas (resueltas)

- **Internet en la compu Windows**: confirmado que va a estar disponible en todo momento de
  operación (necesario porque el Posnet Mercado Pago cobra vía su API, no funciona offline).
- **Impresora térmica**: USB o Bluetooth, conectada a la **tablet** (Android), no al servidor.
  Por eso queda fuera de esta spec (ver "Fuera de alcance") — se resuelve en spec propia.
- **Esta PC Windows vs. la del boliche**: esta ronda es una prueba de instalación en una PC
  Windows separada de la máquina real. La del boliche también es Windows (confirmado) y el
  paso de instalación que se arme acá debe servir igual para instalarlo ahí después — no es
  una prueba descartable de enfoque, es el mismo procedimiento que se va a repetir en
  producción.
- **Relación con `docs/specs/deuda-pre-fase-6/hardening-kong-demo-keys.md`**: esa spec en curso en paralelo
  endurece las demo keys de Kong en el stack Docker de desarrollo/LAN. Como este empaquetado
  saca Kong por completo del modo producto, no se pisan — pero quien cierre esa spec debería
  saber que en el producto empaquetado Kong ya no existe.

## Plan técnico

### Enfoque

Un paquete nuevo y hermano en el monorepo, `apps/packaging`, orquesta un modo de arranque
alternativo al de Docker: levanta Postgres embebido (`embedded-postgres`) y `postgrest.exe`
como procesos hijos apuntando a un `pgdata` propio dentro de la carpeta portable, aplica a
mano (con el driver `pg`, sin `psql`) el mismo set de SQL que hoy corre
`docker-entrypoint-initdb.d` (roles + JWT + migraciones) solo la primera vez, y recién
después arranca `apps/api` (build de producción) y `apps/web` (`next start`) como procesos
hijos propios. Kong se elimina: `SUPABASE_URL` pasa a apuntar directo a PostgREST, bindeado
explícitamente a `127.0.0.1` (nunca `0.0.0.0`). Ni los `Supabase*Repository` ni el contrato
`supabase-js` cambian una línea — el reemplazo es puramente de infraestructura. Todo el modo
"empaquetado" (orquestación, mDNS, gate de pantallas) se aísla en `apps/packaging` y en un
módulo de config compartido, sin `if` de modo esparcidos dentro de `api`/`web`.

### Archivos/módulos afectados

- **Nuevo paquete `apps/packaging/`** (package.json propio, no depende de `api`/`web` como
  código fuente, solo de sus build artifacts):
  - `src/orchestrator.ts` — arranca Postgres embebido → aplica init SQL si `pgdata` no existe
    → arranca `postgrest.exe` → arranca `apps/api` (`dist/server.js`) → arranca `apps/web`
    (`next start`). Maneja shutdown limpio (`pg_ctl stop -m fast` antes de salir, no `kill -9`).
  - `src/init-sql.ts` — lee `supabase/docker/roles.sql`, `jwt.sql` y `supabase/migrations/*.sql`
    en el mismo orden string-sort que hoy usa el compose; interpola a mano las variables que
    hoy vienen de `\set` de psql (`POSTGRES_PASSWORD`, `JWT_SECRET`) antes de ejecutar cada
    archivo como una transacción propia con el cliente `pg`. Agrega el `CREATE ROLE` completo
    de `anon`/`authenticated`/`service_role`/`authenticator` + grants de schema `public` que
    hoy trae gratis la imagen `supabase/postgres` y que un Postgres vanilla de zonky no trae.
  - `src/mdns.ts` — anuncia `bosko.local` (librería `bonjour-service`), arrancado como módulo
    aparte por el orquestador, no dentro de Express.
  - `scripts/build-portable.mjs` — arma la carpeta portable final: copia Node.js portable
    Windows + `postgrest.exe` + binarios de `embedded-postgres` + los `dist/` de `api`/`web` +
    un `.bat` de instalación (registra la Tarea Programada con `schtasks`).
- **`apps/api/src/server.ts`**: extraer la lógica de "boot autocurativo" (intentos de
  `supabase start`/`docker compose up -d`) a una interfaz `BootStrategy` con dos
  implementaciones (`DevBootStrategy` = comportamiento actual, `PackagedBootStrategy` = no-op
  porque Postgres ya está arriba), seleccionada una sola vez en el entrypoint según una env var
  (ej. `RUNTIME_MODE=packaged|dev`), no repetida en cada punto de chequeo.
- **`apps/web/next.config.ts`**: sacar el `http://localhost:3001` hardcodeado del rewrite de
  `/api/:path*` y reemplazarlo por `process.env.API_INTERNAL_URL ?? "http://localhost:3001/..."`
  — lo setea el orquestador. Es un fix independiente del empaquetado en sí (hoy ya es una
  config no externalizada), pero lo destraba.
- **Gate de pantallas (Barra/Carta ocultas)**: nuevo módulo de config compartido (candidato:
  `packages/shared/src/feature-flags.ts`) que expone algo como `screensEnabled: Set<Screen>`
  leído de una env var. Dos consumidores, mismo flag:
  - `apps/web/src/proxy.ts` — el matcher ya cubre `/barra`; se le suma `/carta` y un chequeo
    contra el flag que devuelve 404/redirect antes de que la request llegue a la page.
  - Layout/nav de Admin y Caja (`apps/web/src/app/layout.tsx`, componentes de sidebar) — no
    linkear ni generar QR hacia `/carta`/`/barra` cuando el flag está apagado, condicional en
    el punto de composición del nav, no `display:none` de CSS.
- **PWA**: `apps/web/public/manifest.json` (nuevo) + íconos con branding Bosko,
  `display: "standalone"`, dos entradas (Admin, Caja) o un manifest con `start_url`
  parametrizable por ruta.
- **`docker-compose.yml`, `pnpm dev`, `pnpm build`**: sin cambios — siguen siendo el flujo de
  desarrollo, el modo empaquetado es un camino nuevo y paralelo.

### Cambios de datos

- **Sin migraciones nuevas de dominio.** Se reutiliza el mismo set de
  `supabase/migrations/*.sql` + `supabase/docker/roles.sql` + `jwt.sql` que hoy aplica el
  compose, ejecutado por `init-sql.ts` contra el Postgres embebido en vez de por
  `docker-entrypoint-initdb.d`.
- **Sin cambios en `packages/shared/src/domain.ts`.**
- **Versión de Postgres**: el binario zonky embebido debe ser **17.x** para matchear
  `supabase/postgres:17.6.1.136`. Única extensión en uso es `uuid-ossp` (confirmado por grep en
  las migraciones), viene en el `contrib` estándar de Postgres — no hay bloqueo de extensiones
  Supabase-específicas (no se usa `pgjwt`, `pg_graphql`, `vault`).
- **Sync local↔cloud**: sin impacto — sigue hablando con `SUPABASE_CLOUD_URL` real igual que
  hoy, es ortogonal a cómo se sirve la REST local.
- **Offline-first**: sin impacto — el modo empaquetado sigue siendo Postgres local como fuente
  de verdad, cloud diferida al cierre de noche.

### Real-time

- Sin cambios de eventos: el SSE (`GET /api/events`, EventEmitter en proceso de `apps/api`)
  sigue viviendo dentro del mismo proceso Express, ahora lanzado como hijo del orquestador en
  vez de por `pnpm dev`/Docker. Justamente por esto el modo empaquetado no puede ser
  serverless/edge — ya es una regla existente del repo, se mantiene igual.

### Auth/permisos

- Sin cambios en el modelo de roles (`admin | caja | barman`) ni en `UserPermissions`.
- El gate de pantallas (Barra/Carta ocultas) es una capa de **disponibilidad de ruta**, no de
  permisos: un `barman` sigue siendo un rol válido en el dominio, solo que en este build no hay
  entrypoint visible hacia `/barra` y no se crea usuario `barman` real en el seed de esta
  prueba. `AUTH_SECRET`/`COCKTRAIL_AUTH_SECRET` deben seguir coincidiendo entre `api` y `web`
  igual que hoy, seteados en el `.env` que arma `build-portable.mjs`.

### Riesgos

- **PostgREST expuesto sin Kong delante**: mitigado bindeando `postgrest.exe` explícitamente a
  `127.0.0.1` (nunca `0.0.0.0`) — verificar con `netstat -an` en el smoke test del instalador —
  y sumando una regla de Windows Firewall que bloquee ese puerto hacia la LAN como refuerzo.
  PostgREST igual sigue validando el JWT de `service_role` vía `PGRST_JWT_SECRET`; Kong nunca
  hizo esa parte, solo filtraba por `apikey`.
- **Roles de Postgres no vienen gratis**: un Postgres vanilla de zonky no trae
  `anon`/`authenticated`/`service_role`/`authenticator` (los trae la imagen `supabase/postgres`
  hoy). Hay que crear esos roles + grants a mano en `init-sql.ts` antes de correr el resto del
  SQL, o el primer arranque rompe.
- **Meta-comandos `\set` de psql en los `.sql` actuales**: `roles.sql`/`jwt.sql` usan `\set`
  para interpolar `POSTGRES_PASSWORD`/`JWT_SECRET` desde variables de entorno del shell — el
  driver `pg` no los entiende, hay que interpolarlos en Node antes de ejecutar.
- **Idempotencia del init**: a diferencia de `docker-entrypoint-initdb.d` (que solo corre si el
  volumen está vacío, gratis), acá hay que decidir a mano cómo se detecta "primer arranque"
  (chequear si `pgdata` existe/está vacío) y no reintentar el init en cada boot.
- **Cierre abrupto de Windows**: si el proceso muere sin pasar por el shutdown del orquestador,
  riesgo de corrupción de WAL en Postgres embebido — el orquestador debe manejar señales de
  cierre del SO y llamar `pg_ctl stop -m fast`, no matar el proceso a la fuerza.
- **`postgrest.exe` sin firmar**: puede disparar SmartScreen de Windows en el primer arranque —
  documentar "más información → ejecutar de todos modos" en el paso de instalación.
- **Ocultar Barra/Carta a medias**: si el gate queda solo en el nav (CSS/link condicional) sin
  tocar `proxy.ts`, cualquiera que adivine la URL igual entra — el gate tiene que ser de
  ruta (server-side), no solo visual.
- **Deuda ya conocida que este empaquetado no resuelve** (fuera de alcance, ver ROADMAP): la
  deuda estructural de Fase 2 (`SyncService`, `auth.service.ts`, capa SSE) y la limpieza de
  lint a nivel repo (R11) no se tocan acá.

### Alternativas consideradas

- **Mantener Kong embebido en vez de sacarlo**: descartado — Kong es un gateway
  Lua/OpenResty/nginx pesado y sin binario Windows standalone soportado oficialmente; no aporta
  nada que PostgREST no haga ya (la validación real del `service_role` es el JWT, que la hace
  PostgREST solo). Sacarlo simplifica sin perder seguridad real.
- **Reescribir los repositorios para hablar `pg` directo (sin PostgREST)**: descartado para
  esta ronda — implicaría tocar los ~8+ `Supabase*Repository` existentes y el cliente
  `supabase-js` compartido, mucho más riesgo/trabajo que mantener el mismo contrato REST y
  cambiar solo qué lo sirve.
- **Shell Electron/Tauri con Postgres como sidecar**: descartado — no hace falta ventana nativa
  porque el uso es 100% por navegador (admin/caja desde la tablet); hubiera sumado una capa de
  empaquetado extra sin beneficio para este caso de uso.
- **Instalador gráfico (.exe/.msi con NSIS/WiX) para esta primera prueba**: descartado por
  ahora — carpeta portable + `.bat` alcanza para validar el enfoque; un instalador más pulido
  puede evaluarse después de la primera prueba real, no antes.
- **Orquestador viviendo dentro de `apps/api/src/packaging/`**: descartado — mezclaría una
  responsabilidad de infraestructura de despliegue (spawn de procesos del SO, ciclo de vida de
  Postgres/PostgREST) dentro del árbol Controller→Service→Repository de la API, y arrastraría
  dependencias (`embedded-postgres`, `bonjour-service`) al build de producción de `apps/api`
  que ni el server ni Next necesitan resolver en dev/Docker.

## Tareas

### 0. Scaffolding del paquete nuevo

- [ ] Crear `apps/packaging/` con `package.json` propio (agregar al `pnpm-workspace.yaml` si
  hace falta), `tsconfig.json`, dependencias `embedded-postgres`, `pg`, `bonjour-service`.
  No debe declarar `apps/api`/`apps/web` como dependencias de código — solo los consume como
  build artifacts (`dist/`, `.next/`) en runtime.
- [ ] Agregar script raíz `pnpm --filter cocktrail-packaging ...` o equivalente en
  `package.json` de la raíz para buildear/correr el paquete nuevo.

### 1. Datos / init SQL (requiere `supabase-expert`)

- [ ] `apps/packaging/src/init-sql.ts`: leer y ejecutar contra el Postgres embebido, en orden,
  con el cliente `pg`: `CREATE ROLE` completo de `anon`/`authenticated`/`service_role`/
  `authenticator` + grants de schema `public` (no existen hoy en ningún `.sql` del repo porque
  la imagen `supabase/postgres` los trae gratis — hay que escribirlos desde cero, idealmente
  con `supabase-expert` para no desviarse del comportamiento real de Supabase).
- [ ] Adaptar `supabase/docker/roles.sql` y `jwt.sql`: reemplazar los meta-comandos `\set` (que
  psql resuelve y `pg` no) por interpolación de `POSTGRES_PASSWORD`/`JWT_SECRET` hecha en
  Node antes de ejecutar cada archivo como texto.
- [ ] Ejecutar, en el mismo orden string-sort que hoy usa `docker-compose.yml`, el set completo
  `supabase/migrations/*.sql` (incluye `schema.sql`, `edge_sync.sql`, `add_closed_by.sql`,
  `create_audit_logs.sql`, `add_keyword.sql`) contra el Postgres embebido.
- [ ] Envolver cada archivo en su propia transacción; si uno falla, abortar el arranque con un
  mensaje claro (no dejar el `pgdata` a medio inicializar).
- [ ] Definir cómo se detecta "primer arranque" (chequear si `pgdata` existe/está vacío antes
  de correr el init) para no reintentarlo en cada boot.
- [ ] Confirmar con `supabase-expert` que el binario zonky a usar es la línea **17.x** (matchear
  `supabase/postgres:17.6.1.136`) y que `uuid-ossp` alcanza como única extensión requerida.

### 2. Backend (`apps/api`)

- [ ] `apps/api/src/config/env.ts`: agregar `RUNTIME_MODE` (`"dev" | "packaged"`, default
  `"dev"`).
- [ ] Extraer la lógica de auto-heal de `apps/api/src/server.ts` (`ensureDatabaseConnection`)
  a una interfaz `BootStrategy` con `DevBootStrategy` (comportamiento actual: intenta
  `supabase start`/`docker compose up -d`) y `PackagedBootStrategy` (no-op, Postgres ya está
  arriba). Seleccionar la implementación una sola vez en el entrypoint según `RUNTIME_MODE`.
- [ ] Verificar que `apps/api` build de producción (`pnpm build:api` → `dist/server.js`)
  arranca correctamente pasándole `SUPABASE_URL` apuntando directo al puerto de PostgREST
  embebido (sin Kong) vía variables de entorno que setea el orquestador.

### 3. Config compartida (gate de pantallas)

- [ ] `packages/shared/src/feature-flags.ts` (nuevo): exponer `screensEnabled: Set<Screen>`
  leído de una env var (ej. `ENABLED_SCREENS=admin,caja`), con default que incluye las 4
  pantallas (no romper el entorno de desarrollo actual).
- [ ] `apps/web/src/proxy.ts`: sumar `/carta` al `matcher` (hoy solo cubre admin/caja/barra) y
  chequear el flag antes de dejar pasar la request a `/barra` y `/carta` — 404/redirect si
  están deshabilitadas.
- [ ] Auditar `apps/web/src/app/layout.tsx`, sidebars de Admin/Caja y la sección de generación
  de QR en Admin (buscar componente QR bajo `apps/web/src/app/admin` o
  `apps/web/src/components/admin`) para que no linkeen ni generen accesos hacia `/carta`/
  `/barra` cuando el flag está apagado.

### 4. Frontend — PWA e íconos

- [ ] `apps/web/public/manifest.json` (nuevo) con branding Bosko, `display: "standalone"`,
  entradas para Admin y Caja (o `start_url` parametrizable).
- [ ] Íconos PWA (varios tamaños) en `apps/web/public/icons/`.
- [ ] Enlazar el manifest en `apps/web/src/app/layout.tsx` (`<link rel="manifest">`).
- [ ] `apps/web/next.config.ts`: sacar el `http://localhost:3001` hardcodeado del rewrite de
  `/api/:path*`, reemplazar por `process.env.API_INTERNAL_URL ?? "http://localhost:3001/..."`.

### 5. Orquestador y mDNS

- [ ] `apps/packaging/src/orchestrator.ts`: levantar Postgres embebido → correr init SQL (paso
  1) si corresponde → levantar `postgrest.exe` (bindeado a `127.0.0.1`, verificar con
  `netstat`) → levantar `apps/api` (`dist/server.js`, `RUNTIME_MODE=packaged`) → levantar
  `apps/web` (`next start`).
- [ ] Manejar shutdown limpio: capturar señales de cierre del SO y llamar `pg_ctl stop -m fast`
  antes de salir (no matar procesos a la fuerza).
- [ ] `apps/packaging/src/mdns.ts`: anunciar `bosko.local` con `bonjour-service`, como módulo
  separado arrancado por el orquestador (no dentro de Express).

### 6. Empaquetado portable para Windows

- [ ] `apps/packaging/scripts/build-portable.mjs`: arma la carpeta final con Node.js portable
  Windows (`node-vX.Y.Z-win-x64.zip`), `postgrest.exe`, binarios de `embedded-postgres`, los
  `dist/`/`.next/` de `api`/`web`, y un `.env` con `AUTH_SECRET`/`COCKTRAIL_AUTH_SECRET`
  coincidente entre ambas apps.
- [ ] `.bat` de instalación: registra la Tarea Programada de Windows (`schtasks`) para
  auto-arranque al iniciar sesión/sistema, corriendo el orquestador en background.
- [ ] Documentar el paso manual de SmartScreen ("más información → ejecutar de todos modos")
  para `postgrest.exe` sin firmar, en un README dentro de la carpeta portable.
- [ ] Agregar regla de Windows Firewall (o documentar el paso) que bloquee el puerto de
  PostgREST hacia la LAN, como refuerzo del bind a `127.0.0.1`.

### 7. Documentación

- [ ] Actualizar `docs/ARCHITECTURE.md` §9 (Containerización/deploy): agregar el modo
  empaquetado como alternativa al `docker compose`, dejando explícito que Kong no existe en
  ese modo y que PostgREST se sirve embebido.
- [ ] Actualizar `docs/ROADMAP.md` Fase 6: tildar los ítems que este trabajo resuelve
  ("elegir shell de empaquetado" → resuelto como "sin shell, solo servidor + navegador";
  "App doble-click" → resuelto vía Tarea Programada) y anotar que Barra/Carta quedan
  pendientes de habilitar y que la impresora-en-tablet es spec aparte.

### 8. Verificación

- [ ] `pnpm typecheck` en verde (incluye el paquete nuevo `apps/packaging` si suma TS).
- [ ] Smoke test manual en la PC Windows de prueba: instalar desde cero, reiniciar la compu,
  confirmar que Admin y Caja cargan solos desde `bosko.local` sin abrir terminal.
- [ ] Validar los 9 criterios de aceptación de la spec uno por uno contra la instalación real
  (instalación limpia, acceso LAN por hostname, PWA instalable, cobro real con Posnet,
  persistencia de datos tras reinicio, Barra/Carta no accesibles, dev sigue andando igual).
- [ ] `e2e-playwright-tester`: correr contra la instancia empaquetada (una vez accesible por
  `bosko.local` o la IP LAN) los flujos de Admin y Caja de punta a punta, confirmando que el
  SSE real-time sigue funcionando igual que en desarrollo.
- [ ] Probar el cobro real con el Posnet físico de Mercado Pago contra la instancia empaquetada
  (`mercadopago-integrator` si aparece algo específico del modo empaquetado, no debería haber
  cambios de esa integración en sí).

---

**Nota de proceso**: para la implementación, usar Plan Mode dado el tamaño del cambio
(paquete nuevo + cambios cross-cutting en `api`/`web`/`shared`). Ir tildando `- [x]` tarea por
tarea a medida que se completa cada una, no todas al final.

