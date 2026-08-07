# Deploy en la nube + comandera

**Estado**: `draft`
**Fecha**: 2026-08-07
**Contexto**: cierra el [PIVOT del ROADMAP](../ROADMAP.md) (2026-08-03). Es la última pieza:
la impresión Bluetooth ya está [hecha](./impresion-bluetooth-comandera.md).

---

## Problema / Por qué

Hoy el sistema corre en una mini-PC del boliche: Postgres en Docker local, la tablet entrando por
IP de LAN, el APK barriendo la subred para encontrar el servidor. Ese modelo murió con el pivot —
la comandera circula por la pista con 4G, hay varias barras, y el Posnet ya salió del flujo.

Además el repo arrastra el costo de esa arquitectura: **~5.750 líneas de producción y ~2.200 de
tests sin ningún uso** (el módulo `sync` local↔nube completo, las rutas `/carta` `/barra` `/pedido`
que un commit desactivó dejando todo el árbol de componentes huérfano, el boot autocurativo que
ejecuta `docker compose up`, los scripts de IP LAN, un APK de 2,7 MB versionado en git).

Y hay una diferencia de fondo entre una LAN cerrada y la internet abierta: **seis agujeros de
seguridad que hoy son inofensivos y mañana son la puerta de entrada** (el endpoint SSE no pide
autenticación, el guard del frontend tiene un secreto de desarrollo hardcodeado como fallback,
CORS y CSP habilitan rangos LAN sobre `http://`, y los usuarios `admin/admin` y `caja/caja` vienen
por defecto).

**Rol beneficiado**: todos. `caja` (opera desde cualquier lado, sin depender del WiFi del local),
`admin` (ve la noche desde su casa), y el dueño (deja de depender de una máquina física encendida).

## Objetivo

Que **BarQR corra en la nube con una URL pública**, la comandera entre desde la tablet por 4G, y
todo el flujo de la noche funcione igual que en la LAN — con la base de datos real de Supabase
Cloud como única fuente de verdad, sin perder un solo dato de los que ya están ahí.

Comportamiento observable:

- Se entra a una URL pública por HTTPS y aparece el login. No hay IPs, ni "buscar servidor", ni
  advertencias de certificado.
- La cajera opera `/caja` desde la tablet con datos móviles: vende, cobra en efectivo, imprime por
  Bluetooth y cierra la noche. El admin ve los totales en vivo desde otro dispositivo.
- El tiempo real (SSE) funciona a través de internet: lo que pasa en la comandera aparece en
  `/admin` sin recargar.
- Los datos que ya están en la nube (la carta de 41 tragos, las 6 noches, los 260 pedidos)
  **siguen intactos** después del deploy.
- Nadie sin credenciales válidas puede leer datos ni abrir un stream de eventos.
- Un deploy nuevo se hace empujando a la rama, y si algo sale mal se vuelve atrás.

## Historias de usuario

- Como **caja (comandera)** quiero entrar al sistema desde la tablet con datos móviles, sin
  depender del WiFi del boliche ni de una computadora encendida en el local.
- Como **caja** quiero instalar BarQR en la pantalla de inicio de la tablet y que abra como una
  app (pantalla completa, ícono propio), no como una pestaña del navegador.
- Como **admin** quiero ver la noche en vivo desde mi celular estando en cualquier lado.
- Como **dueño** quiero no tener que comprar ni mantener una mini-PC en el local.
- Como **desarrollador** quiero que el repo tenga solo el código que realmente corre, para no
  perder tiempo leyendo módulos muertos ni arrastrar dos bases de datos que ya no existen.
- Como **dueño** quiero saber que exponer el sistema a internet no significa que cualquiera pueda
  entrar a ver mi facturación.

## Criterios de aceptación

**Datos (lo más importante)**
1. Después del primer deploy contra Supabase Cloud, `drinks` sigue teniendo sus 41 filas,
   `night_events` sus 6, `orders` sus 260 y `users` su usuario. Ninguna migración destructiva se
   ejecuta sobre datos existentes.
2. El estado de migraciones queda registrado y consistente: un deploy posterior no re-aplica nada
   ya aplicado, y `GET /api/system/health` no reporta estado degradado.

**Funcionamiento**
3. Desde la tablet con 4G: login → `/caja` → venta en efectivo → ticket impreso por la S1 →
   aparece en el historial. Todo contra la URL pública.
4. El SSE funciona a través de internet: una venta en la comandera se refleja en `/admin` abierto
   en otro dispositivo, sin recargar, y la conexión sobrevive más de 5 minutos sin cortarse.
5. Apertura y cierre de noche funcionan; los totales del cierre son correctos.
6. Mercado Pago sigue operativo para lo que quedó en el flujo (el webhook, que en LAN estaba
   inerte por NAT, ahora recibe notificaciones reales).

**Seguridad (todos, antes de exponer)**
7. `GET /api/events` (SSE) exige sesión válida: sin cookie, responde 401.
8. `proxy.ts` es fail-closed: sin `AUTH_SECRET` en el entorno, no valida sesiones con un secreto
   de fallback — rechaza.
9. CORS y CSP apuntan al dominio real por HTTPS; no queda ningún rango LAN ni `http://`.
10. No existen usuarios por defecto: `admin/admin` y `caja/caja` no entran. Las credenciales de
    producción salen de variables de entorno con valores fuertes.
11. `app.set("trust proxy")` configurado, para que el rate-limit vea la IP real de cada cliente y
    no trate a todas las tablets como una sola.
12. La cookie de sesión viaja `Secure` (garantizado por `NODE_ENV=production`).

**Limpieza**
13. El repo no contiene el módulo `sync`, las rutas `/carta` `/barra` `/pedido` ni sus árboles de
    componentes, el boot autocurativo, los scripts de LAN, ni el APK binario.
14. `pnpm typecheck` y todos los tests siguen en verde después de la limpieza; no quedan tests
    testeando código borrado.
15. La documentación (`ARCHITECTURE.md`, `DEPLOY.md`, `CLAUDE.md`, `AGENTS.md`) describe el
    sistema que realmente existe: una sola base en la nube, sin local-first, sin LAN.

**PWA**
16. Desde Chrome en la tablet se puede instalar BarQR en la pantalla de inicio: ícono propio,
    nombre, arranque en pantalla completa. Web Bluetooth sigue funcionando dentro de la PWA
    instalada (la impresora se vincula e imprime igual).

## Fuera de alcance

- **Dominio propio**: se arranca con la URL de Render (`*.onrender.com`). El diseño deja previsto
  el cambio a dominio propio sin tocar código (solo variables de entorno y DNS).
- **Plan pago**: se arranca en free tier. Pasar a Starter (USD 7/mes por servicio) para eliminar
  el "sleep" tras 15 minutos de inactividad es un click, y se decide después de validar.
- **Cola offline de la PWA** (seguir vendiendo sin internet y sincronizar después): es una feature
  en sí misma, con su propia complejidad de conflictos. Va a spec aparte si la operación la pide.
- **Multi-vendedor simultáneo**: hoy `BAR_CODE` sale del entorno y `bar_sessions` tiene un
  `UNIQUE(bar_id)`. Con una comandera alcanza; varias en paralelo es otra spec.
- **Multi-tenant (varios boliches) y RLS**: nunca se implementó y no lo necesita este deploy.
- **Revivir `/carta`** (pedido del cliente por QR): decisión de producto pendiente; si vuelve,
  vuelve como feature nueva y limpia, no desenterrando el código viejo.
- **SPP nativo en el APK** para acelerar la impresión: identificado, es otra spec.
- **CI/CD con tests automáticos previos al deploy**: se usa el auto-deploy de Render; un pipeline
  formal queda para después.

## Preguntas abiertas

1. **¿El proyecto de Supabase Cloud actual es "el bueno"?** Tiene datos reales pero también
   arrastre de pruebas (ver R29: un seller de Mercado Pago de otro desarrollador figura activo).
   ¿Se limpia y se usa, o se crea uno nuevo y se migran solo los datos que valen?
2. **Credenciales de producción**: quién define las contraseñas reales de `admin` y `caja`, y
   dónde se guardan (hoy hay defaults inseguros en el código).
3. **Base de datos para tests**: hoy los tests de integración pegan contra la misma base que el
   dev server y ya borraron datos reales dos veces (R16). Con una única base en la nube esto pasa
   de molesto a inaceptable. ¿Proyecto Supabase aparte para tests, o se prohíben los tests de
   integración contra la nube?
4. **"Transferencia MP"**: el pivot dice que los pagos son efectivo y transferencia MP, pero no
   está definido si eso es el QR dinámico (R14, no implementado) o algo más simple (alias/CBU a
   ojo). No bloquea el deploy, pero define si falta código.

---

## Plan técnico

### Enfoque

**Un solo servicio en Render**, con Docker, corriendo los dos procesos que ya existen: Express en
el puerto interno y Next.js en el público, con el rewrite same-origin de Next apuntando a
`localhost` — exactamente la misma topología que en desarrollo, que ya sabemos que funciona. Esto
evita los tres problemas de separar en dos servicios con URLs `*.onrender.com`: cookies
cross-site (onrender.com está en la Public Suffix List, así que los subdominios son sitios
distintos), un segundo arranque en frío, y el SSE atravesando dos proxies. El sistema **no puede
escalar horizontalmente de todas formas** (el bus de eventos es un `EventEmitter` en proceso), así
que separar servicios no compraría nada.

Supabase Cloud pasa a ser la **única** base: desaparece el concepto de local-vs-nube y con él todo
el módulo `sync`. Primero se limpia el repo y se tapan los agujeros de seguridad, después se
deploya — sobre un baseline de migraciones hecho a mano para no tocar los datos que ya están.

### Orden obligatorio

```
1. BASELINE de migraciones en Cloud  ← bloqueante, sin esto se pierde la carta
2. Limpieza (sync, rutas muertas, boot autocurativo, scripts LAN)
3. Hardening (los 6 puntos)
4. Empaquetado (Dockerfile + supervisor + render.yaml)
5. Deploy y verificación
6. PWA (manifest + íconos)
7. Docs
```

### Archivos/módulos afectados

**Baseline de migraciones** (paso 1, antes que nada):
- `apps/api/src/infra/migrations/` — el runner ya existe y es correcto. Lo que falta es un script
  nuevo, `apps/api/src/scripts/baseline-cloud.ts`: crea `schema_migrations` en Cloud e inserta las
  40 versiones de `supabase/migrations/*.sql` con `applied_by='baseline'` y su checksum, **sin
  ejecutar el SQL**. Debe (a) verificar antes que el schema real ya tenga las tablas y datos,
  (b) negarse si `schema_migrations` ya existe con filas, (c) imprimir qué va a hacer y pedir
  confirmación explícita (`--yes`), (d) ser idempotente.
- Motivo: `supabase/migrations/20260724150000_drink_categories.sql:32` (`DELETE FROM drinks`) y
  `20260725060000_delete_mojito_drinks.sql:2` se ejecutarían como parte del backfill.

**Limpieza — eliminar** (paso 2):
- Módulo sync completo: `apps/api/src/modules/sync/` (`sync.service.ts` 342 + `cloud-sync.repository.ts`
  569 + tests 1.009), `apps/api/src/scripts/verify-sync.ts` (+ test, 401), el cliente `supabaseCloud`
  de `apps/api/src/shared/supabase.ts:11-12`, las env `SUPABASE_CLOUD_*` (`env.ts:26-27`), el
  wiring de `app.ts:63-64,85-86,88,309`, los enganches de `events.service.ts:29,106,320,324`, los
  endpoints `POST /api/system/sync` y `/restore` (`system.controller.ts:50-96`), la UI de restore
  (`SistemaSection.tsx:194-325`) y sus tipos en `services/system.service.ts`. **Rescatar antes**:
  `ensureLocalMasterDataSeeded()` (`sync.service.ts:149`) se convierte en `apps/api/src/scripts/seed.ts`
  manual — nunca en el boot (hoy sembraría admin/admin sobre producción).
- Rutas muertas del commit POS-puro: `apps/web/src/app/{carta,barra,pedido}/` completos (incluido
  `barra/BarraClient.tsx`, 874 líneas), `apps/web/src/components/{barra,carta}/`,
  `hooks/useOfflineScanQueue.ts` + `useScannerInput.ts`, `lib/activeOrder.ts`, `lib/orderStatus.ts`,
  y el matcher `/barra` de `apps/web/src/proxy.ts:9-10,102-112`.
- Huérfanos varios: `components/shared/{OSHeadbar,OSProfileFooter,DrinkSkeleton}.tsx`,
  `components/caja/ProductSearch.tsx`, `apps/api/src/modules/printer/printer.service.selfcheck.ts`.
  Revisar `lib/mockDashboard.ts` (datos mock importados por `AdminClient.tsx:44-48`).
- LAN: `apps/web/scripts/{print-lan-url,ensure-lan-https}.mjs` y los scripts `dev:https`,
  `allowedDevOrigins` (`next.config.ts:13-21`), `getLanIp()` + banner (`server.ts:12-32,87-93`),
  `NEXT_PUBLIC_LAN_HOST` (variable fantasma: cero referencias en código).
- Boot autocurativo: `ensureDatabaseConnection()` con sus `exec("supabase start")` /
  `exec("docker compose up -d")` (`server.ts:34-82`) y el loop infinito silencioso (`:175-196`) →
  reemplazar por fail-fast; que Render reinicie el contenedor.
- Operación local: `POST /api/system/shutdown` (`system.controller.ts:98-131` +
  `system.service.ts:220-241`, sin ningún caller), `checkInternet()` (`:91-109`), los campos
  `localDb`/`cloudDb`/`sync` de `SystemStatus`.
- APK: `apps/web/public/miboliche-caja.apk` (2,7 MB) del repo, y la tarjeta "App de caja" de
  `SistemaSection.tsx:129-192`. **`apps/caja-android/` se conserva en el repo** (es el shell USB
  del puesto fijo) pero se le saca el descubrimiento LAN: `ServerFinder.kt` (96) y
  `assets/connect.html` (423) se eliminan, `MainActivity.kt` se reduce a URL fija por
  `BuildConfig`, y se quita `usesCleartextTraffic`.
- Tests de todo lo anterior (~2.200 líneas).
- Docs obsoletos: `docs/specs/06-empaquetado/`, `docs/plans/06-empaquetado/`.

**Hardening** (paso 3):
- `apps/api/src/modules/sse/sse.controller.ts` — agregar `authMiddleware` al `GET /api/events`.
  Verificar que `EventSource` manda la cookie (mismo origen: sí).
- `apps/web/src/proxy.ts:39-42` — eliminar el fallback `"dev-secret-change-me..."`; sin secreto,
  rechazar. Además usar comparación timing-safe (hoy `sig !== expected`, `:64-66`).
- `apps/api/src/app.ts` — `app.set("trust proxy", 1)` (Render está detrás de proxy); CORS al
  `FRONTEND_URL` real y sin la apertura total en `development` cuando `NODE_ENV=production`; CSP
  `connectSrc` sin `http://192.168.*`/`10.*`/`172.*` (`:244`).
- `apps/api/src/config/env.ts:19-22` — eliminar los defaults `admin/admin` y `caja/caja`: en
  producción, obligatorias. `SUPABASE_SERVICE_ROLE_KEY` (`:25`) sin default placeholder.

**Empaquetado** (paso 4):
- `Dockerfile` (nuevo, raíz): multi-stage. Build: pnpm install + `pnpm build` (api → `dist/`,
  web → Next standalone). Runtime: Node 20 slim, copia los dos builds **y `supabase/migrations/`**
  (el runner las resuelve por ruta relativa, `server.ts:106-109` — si no están, no migra).
- `.dockerignore` (nuevo).
- `scripts/start-cloud.mjs` (nuevo): supervisor mínimo — levanta `node apps/api/dist/server.js` y
  el server de Next; si cualquiera muere, mata al otro y sale con código ≠ 0 para que Render
  reinicie. Sin dependencias externas.
- `render.yaml` (nuevo): un `web` service, plan free, `dockerfilePath: ./Dockerfile`, health check
  `/health`, `autoDeploy` en la rama elegida, y el bloque `envVars` (con `sync: false` para los
  secretos, que se cargan en el dashboard).
- `package.json` raíz: sacar el `postinstall` (`supabase/generate-keys.mjs`) del build cloud.
- `apps/web/next.config.ts` — `output: "standalone"`; `API_PROXY_TARGET` default a
  `http://127.0.0.1:3001`; documentar la variable en `.env.example` (hoy falta).

**PWA** (paso 6):
- `apps/web/public/manifest.webmanifest` (nuevo) + íconos 192/512 derivados de `public/app-icon.png`.
- `apps/web/src/app/layout.tsx:13` — `metadata.manifest`, `appleWebApp`, `themeColor`.
- Sin service worker por ahora (sería el vehículo de la cola offline, que está fuera de alcance).

### Cambios de datos

- **Sin migraciones nuevas.** El schema de Cloud ya está al día; lo único que falta es la tabla de
  control `schema_migrations`, que crea el script de baseline.
- La columna `night_events.sync_status` queda inerte (no se borra: tocar el schema es riesgo sin
  beneficio).
- Se elimina la tabla/flujo `mercadopago_seller_handoff` del código (el buzón de traspaso existía
  para pasar el token de la nube a una instalación local nueva); la tabla queda en la base.
- `DATABASE_URL` pasa a apuntar al connection string de Supabase Cloud. **Usar el "Session
  pooler"** (puerto 5432 del host `*.pooler.supabase.com`), no el transaction pooler ni la
  conexión directa: el runner toma un advisory lock de sesión (`pg_try_advisory_lock`,
  `pg-migrations.repository.ts:58`) que el modo transaction no sostiene, y la conexión directa de
  Supabase hoy es IPv6-only, que Render no garantiza.

### Real-time

Sin eventos nuevos. Lo que cambia es el entorno: el SSE atraviesa el proxy de Render. Ya está
`X-Accel-Buffering: no` (`sse.controller.ts:13`) y el ping cada 25s (`:24`), que es lo que
mantiene viva la conexión. **Verificar explícitamente** que Render no corta conexiones largas
(criterio 4: >5 minutos). Si las cortara, el fallback es que el cliente reconecte
(`EventSource` reconecta solo) y bajar el ping.

### Auth/permisos

Sin roles nuevos. Todo lo relevante es de hardening (criterios 7-12). El punto fino: el rol
`barman` deja de tener pantalla (se borra `/barra`), pero el rol sigue existiendo en el dominio —
no se toca el modelo de usuarios en este deploy.

### Riesgos

1. **Pérdida de la carta por el backfill de migraciones** (CRÍTICO, ya ocurrió una vez —
   ROADMAP:115-121). Mitigación: el baseline manual del paso 1, con verificación de conteos
   antes y después, y **backup previo** (export de `drinks`, `night_events`, `orders`, `users`,
   `tickets` a JSON en `docs/runbooks/`).
2. **Migraciones en el boot**: si algo falla, el runner es fail-open (arranca degradado con banner
   rojo). En la nube eso puede pasar desapercibido. Mitigación: chequear
   `GET /api/system/health` como parte de la verificación post-deploy.
3. **Sleep del free tier**: primera carga de la noche ~50s. Mitigación operativa: abrir la app 1
   minuto antes de empezar. Si molesta, USD 7/mes lo elimina.
4. **SSE cortado por el proxy de Render**: ver arriba; hay fallback.
5. **Romper algo al borrar 5.750 líneas**: mitigación: borrar en commits separados por bloque, con
   `pnpm typecheck` + tests entre cada uno, y todo recuperable de git.
6. **Tests de integración contra la base de producción** (R16, ya mordió dos veces). Mitigación
   inmediata: marcar los tests de integración como opt-in explícito y **no** correrlos apuntando a
   Cloud. La solución de fondo es la pregunta abierta 3.
7. **Secretos**: `AUTH_SECRET` debe ser el mismo para api y web (con un solo contenedor es
   trivial), y `MP_HANDOFF_KEY` debe seguir coincidiendo con la Edge Function de Supabase si se
   conserva el flujo OAuth de MP.

### Alternativas consideradas

- **Dos servicios en Render (web + api)**: descartada para el arranque. Con URLs `*.onrender.com`
  las cookies no se comparten (Public Suffix List), duplica el arranque en frío y mete un salto
  extra en el SSE. Con dominio propio pasa a ser viable, y el diseño no lo impide.
- **Web en Vercel + API en Render**: descartada. El plan Hobby de Vercel prohíbe uso comercial
  (un boliche cobrando lo es) y el SSE atravesando funciones de Vercel se corta por timeout.
  Requeriría Pro (USD 20/mes) + dominio propio, para un beneficio (CDN) que este caso no necesita.
- **Serverless para la API**: imposible por diseño — el bus de eventos es un `EventEmitter` en
  proceso (`ARCHITECTURE.md:187`).
- **Migraciones como job previo al deploy** en vez de en el boot: mejor práctica, pero el runner
  actual ya resuelve concurrencia con advisory lock y el fail-open evita que un error tire el
  servicio. Se deja como está para no reescribir algo que funciona; puede revisarse después.
- **Conservar el módulo `sync` "por si vuelve el local"**: descartada. Son ~1.900 líneas cuyo
  disparador (`SUPABASE_CLOUD_*`) desaparece; mantenerlo vivo sin usarlo es deuda pura, y git lo
  guarda.

---

## Tareas

### Bloque 0 — Salvaguarda de datos (BLOQUEANTE, antes de todo) ✅ *(hecho 2026-08-07)*

> **Resultado**: backup de 16 tablas en `~/dev/cocktrail-backups/` (fuera del repo: son datos de
> producción). Baseline aplicado desde el SQL Editor de Supabase — el `TARGET_DATABASE_URL` para
> el script quedó pendiente, así que se generó el SQL equivalente y se corrió a mano dentro de una
> transacción. Verificado después contra la nube: `schema_migrations` con **40 filas, todas
> `baseline`**, y los datos intactos (41 drinks, 6 noches, 260 orders, 260 tickets, 1 user).
> Son 40 y no 42: el runner ignora `schema.sql` (dump acumulativo) por su patrón de nombre.

- [x] **T1 — Backup completo de Supabase Cloud**: export a JSON de `drinks`, `drink_categories`,
  `night_events`, `orders`, `tickets`, `users`, `audit_logs`, `app_config` y tablas `mercadopago_*`
  a `docs/runbooks/2026-08-XX-backup-pre-cloud.json` (o fuera del repo si pesa). Verificar conteos:
  41 drinks, 6 night_events, 260 orders, 1 user.
- [x] **T2 — Script de baseline** `apps/api/src/scripts/baseline-cloud.ts`: crea `schema_migrations`
  e inserta las 40 versiones con checksum y `applied_by='baseline'`, SIN ejecutar SQL. Con
  verificaciones previas, `--dry-run` por defecto y `--yes` para confirmar. *(subagent `supabase-expert`)*
- [x] **T3 — Correr el baseline contra Cloud** y verificar: `schema_migrations` con 40 filas,
  conteos de datos **idénticos** a T1. Gate: si algún conteo cambió, revertir del backup.

### Bloque A — Limpieza

- [ ] **T4 — Rescatar el seed**: extraer `ensureLocalMasterDataSeeded()` a
  `apps/api/src/scripts/seed.ts` (manual, nunca en el boot).
- [ ] **T5 — Eliminar el módulo sync completo** (service, repository, tests, `verify-sync`,
  cliente `supabaseCloud`, envs `SUPABASE_CLOUD_*`, wiring, endpoints `/sync` y `/restore`, UI de
  restore). `pnpm typecheck` + tests.
- [ ] **T6 — Eliminar rutas muertas** `/carta`, `/barra`, `/pedido` con sus árboles de componentes,
  hooks (`useOfflineScanQueue`, `useScannerInput`), libs (`activeOrder`, `orderStatus`), el matcher
  `/barra` del proxy, y sus tests. `pnpm typecheck` + tests.
- [ ] **T7 — Eliminar huérfanos varios** (`OSHeadbar`, `OSProfileFooter`, `DrinkSkeleton`,
  `ProductSearch`, `printer.service.selfcheck.ts`) y decidir sobre `mockDashboard.ts`.
- [ ] **T8 — Eliminar ataduras LAN**: scripts `print-lan-url`/`ensure-lan-https` + `dev:https`,
  `allowedDevOrigins`, `getLanIp()` y banner LAN, `NEXT_PUBLIC_LAN_HOST`.
- [ ] **T9 — Boot fail-fast**: reemplazar `ensureDatabaseConnection()` (con sus `exec` de docker y
  supabase) y el loop infinito por: intentar conectar, y si no puede, salir con código ≠ 0.
  Conservar el patrón "abrir el puerto primero" (health check de Render).
- [ ] **T10 — Eliminar operación local**: `POST /api/system/shutdown` + `SystemService.shutdown()`,
  `checkInternet()`, campos `localDb`/`cloudDb`/`sync` de `SystemStatus` y sus tests.
- [ ] **T11 — Sacar el APK del repo** (`apps/web/public/miboliche-caja.apk`, 2,7 MB) y la tarjeta
  "App de caja" de `SistemaSection.tsx`. Limpiar `apps/caja-android/`: eliminar `ServerFinder.kt`
  y `connect.html`, reducir `MainActivity` a URL fija por `BuildConfig`, quitar
  `usesCleartextTraffic`, actualizar su README.
- [ ] **T12 — Archivar docs obsoletos**: `docs/specs/06-empaquetado/`, `docs/plans/06-empaquetado/`.

### Bloque B — Hardening (los 6 puntos)

- [ ] **T13 — Auth en el SSE**: `authMiddleware` en `GET /api/events`; verificar que el
  `EventSource` de la web sigue conectando (mismo origen). Test.
- [ ] **T14 — `proxy.ts` fail-closed**: sin `AUTH_SECRET`/`COCKTRAIL_AUTH_SECRET`, rechazar (no
  usar el fallback de dev); comparación timing-safe de la firma. Tests.
- [ ] **T15 — `trust proxy` + CORS + CSP**: `app.set("trust proxy", 1)`; CORS restringido a
  `FRONTEND_URL` (sin apertura total cuando `NODE_ENV=production`); sacar rangos LAN y `http://`
  del CSP.
- [ ] **T16 — Sin credenciales por defecto**: `ADMIN_USER/PASS` y `CAJA_USER/PASS` obligatorias en
  producción (fallar el arranque si faltan); `SUPABASE_SERVICE_ROLE_KEY` sin default placeholder.
- [ ] **T17 — Verificar `Secure` en la cookie** con `NODE_ENV=production` (test).
- [ ] **T18 — Aislar los tests de integración** para que no puedan correr contra Cloud (R16):
  opt-in explícito + guard que falle si la URL apunta a `supabase.co`.

### Bloque C — Empaquetado

- [ ] **T19 — `Dockerfile` multi-stage + `.dockerignore`**: build de api (`dist/`) y web
  (standalone), runtime slim, **copiando `supabase/migrations/`**; sin el `postinstall` de
  generate-keys. Verificar local: `docker build` + `docker run` con envs de prueba.
- [ ] **T20 — `scripts/start-cloud.mjs`**: supervisor de los dos procesos; si uno muere, salir ≠ 0.
- [ ] **T21 — `render.yaml`**: servicio web free, health check `/health`, autoDeploy, `envVars`
  con `sync: false` para secretos. Documentar la lista completa de variables a cargar.
- [ ] **T22 — `next.config.ts`**: `output: "standalone"`, `API_PROXY_TARGET` a `127.0.0.1:3001`,
  y documentarla en `.env.example`.

### Bloque D — Deploy y verificación

- [ ] **T23 — Crear el servicio en Render** y cargar variables (usando el **MCP de Render**, que
  el usuario instalará; si no, por dashboard). Generar `AUTH_SECRET` fuerte, credenciales reales,
  `DATABASE_URL` del pooler de Supabase con SSL, `SUPABASE_URL`/`SERVICE_ROLE_KEY` de Cloud,
  `FRONTEND_URL` = la URL de Render, `NODE_ENV=production`.
- [ ] **T24 — Primer deploy** y revisar logs: migraciones sin cambios (todo ya baseline),
  `GET /api/system/health` sin degradar, conteos de datos intactos (re-verificar contra T1).
- [ ] **T25 — Verificación funcional desde la tablet con 4G** *(con Manuel)*: login → `/caja` →
  venta efectivo → ticket por la S1 → historial → cierre de noche. Criterios 3, 5.
- [ ] **T26 — Verificar SSE en producción**: `/admin` en otro dispositivo recibe la venta en vivo,
  y la conexión sobrevive >5 minutos. Criterio 4.
- [ ] **T27 — Verificar seguridad en vivo**: `GET /api/events` sin cookie → 401; `admin/admin` no
  entra; headers de seguridad correctos. Criterios 7-12. *(skill `security-review`)*
- [ ] **T28 — Verificar webhook de MP** ahora que hay IP pública (R26).

### Bloque E — PWA

- [ ] **T29 — Manifest + íconos**: `manifest.webmanifest`, íconos 192/512 desde `app-icon.png`,
  metadata en `layout.tsx` (`manifest`, `appleWebApp`, `themeColor`).
- [ ] **T30 — Instalar en la tablet y verificar** *(con Manuel)*: "Agregar a pantalla de inicio" →
  abre en pantalla completa con ícono propio → **vincular la S1 e imprimir desde la PWA instalada**
  (verificar que Web Bluetooth funciona en modo standalone). Criterio 16.

### Bloque F — Documentación

- [ ] **T31 — Reescribir `docs/DEPLOY.md`**: de guía de mini-PC a guía de Render + Supabase Cloud
  (variables, primer deploy, rollback, cómo pasar a plan pago, cómo agregar dominio propio).
- [ ] **T32 — Actualizar `docs/ARCHITECTURE.md`**: §2 deja de ser "local-first + cloud diferida";
  eliminar §6 (sync), actualizar §9 (deploy) y §12 (variables). Corregir las contradicciones
  detectadas (`SameSite` dice Strict y el código dice Lax; `LocalJSON*`/`InMemory*` ya no existen;
  `NEXT_PUBLIC_LAN_HOST` no se usa).
- [ ] **T33 — Actualizar `CLAUDE.md` y `AGENTS.md`**: sacar las reglas sobre repos muertos que ya
  no existen, y el modelo local-first.
- [ ] **T34 — `docs/ROADMAP.md`**: marcar el pivot como completo, dejar el estado post-deploy y
  los pendientes reales (cola offline, multi-vendedor, transferencia MP, SPP nativo).

> Implementar con **Plan Mode**. El Bloque 0 es **bloqueante**: sin el baseline, el primer deploy
> borra la carta. Ir tildando `- [x]`.
