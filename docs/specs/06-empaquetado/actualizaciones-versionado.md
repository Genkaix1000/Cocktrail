# Actualizaciones y versionado (Fase 6 — empaquetado)

**Estado**: draft
**Fecha**: 2026-07-24
**Diseño previo**: [`docs/specs/06-empaquetado/empaquetado-windows.md`](./empaquetado-windows.md) (empaquetado base) y `docs/plans/06-empaquetado/` (plan a escribir).

## Problema / Por qué

Una vez empaquetado, Cocktrail corre como producto instalado en la PC del boliche:
no hay `pnpm`, no hay `docker compose`, no hay repo clonado. Si aparece un bug o
se agrega una feature (ej. pedido online en Fase 7), **actualizar la instalación
exige SSH, TeamViewer o presencia física** — copiar archivos a mano, correr
migraciones, y rezar que nada haya quedado roto.

Además, **no hay forma de saber qué versión está corriendo** en el boliche: no hay
tags de release, no hay `version.json` en el paquete, y no hay forma de comparar
lo instalado contra lo último disponible. El dueño del boliche (no técnico) jamás
va a enterarse de que hay una actualización.

El riesgo real: el sistema queda congelado en una versión vieja, acumulando bugs
conocidos que ya están arreglados en el repo pero nunca llegaron a producción.

## Objetivo

Un sistema de versionado y actualización **empaquetador-agnóstico** (funciona igual
si se usa Tauri, Electron, Node SEA, o un `.bat` con Node portable), que:

1. **Detecta** cuándo hay una nueva versión disponible (GitHub Releases como fuente
   de verdad).
2. **Anuncia** la disponibilidad en `/admin` sin interrumpir la operación.
3. **Aplica** la actualización de forma segura y verificada: backup automático,
   migraciones de esquema, swap atómico de archivos, smoke test post-update.
4. **Aborta** sin tocar la instalación actual si cualquier paso falla, y deja un
   log estructurado con el diagnóstico exacto.
5. **Persiste** la versión anterior para rollback manual desde `/admin`.
6. Emite **eventos estructurados** que se conectan a Sentry para monitoreo remoto
   de las actualizaciones.

## Historias de usuario

- Como **admin del boliche**, quiero ver en `/admin` si hay una nueva versión
  disponible y poder aplicarla con un botón, sin abrir terminales ni saber qué es
  un contenedor.
- Como **desarrollador**, quiero que cada release de GitHub contenga un manifiesto
  (`update-manifest.json`) que declare qué migraciones, qué versión de schema y qué
  limpieza de datos espera esa versión, para que el sistema lo valide solo.
- Como **desarrollador**, quiero que una actualización fallida no rompa el sistema:
  si algo sale mal, el boliche sigue operando con la versión anterior y yo recibo
  el error en Sentry con el contexto completo (paso que falló, estado del sistema,
  versión origen/destino).
- Como **persona que instala el sistema**, no quiero preocuparme por archivos
  residuales de versiones viejas: cada actualización reemplaza el directorio entero
  (menos `pgdata` y `.env`), sin parchar archivos sueltos.

## Criterios de aceptación

1. **Given** el sistema empaquetado corriendo `v1.0.0` y un release `v1.1.0` en
   GitHub, **when** el orquestador arranca (o se consulta periódicamente), **then**
   `/admin` muestra un banner "Nueva versión v1.1.0 disponible — [Actualizar]".
2. **Given** el banner visible en `/admin`, **when** el admin clickea "Actualizar",
   **then** el sistema ejecuta la secuencia completa de update sin intervención
   humana y notifica éxito o falla al terminar.
3. **Given** una actualización en curso, **when** cualquier paso de la secuencia
   falla (sin espacio en disco, migración rota, checksum inválido, etc.), **then**
   el sistema aborta, deja la instalación `v1.0.0` intacta y funcionando, y
   registra un log de error estructurado con el paso que falló y el diagnóstico.
4. **Given** una actualización exitosa a `v1.1.0`, **when** el admin entra a
   `/admin`, **then** aparece la versión nueva como versión actual y existe la
   opción "Volver a v1.0.0" (rollback manual al backup).
5. **Given** una actualización exitosa, **when** pasan 7 días sin incidencias,
   **then** el backup de la versión anterior se elimina automáticamente.
6. **Given** un release en GitHub, **when** se arma el artefacto portable para ese
   release, **then** el zip incluye un `update-manifest.json` con: versión,
   `schemaVersion`, `requiresNode`, `requiresPostgres`, `deprecatedFiles`,
   `envChanges` (`added`/`removed`/`required`), `expectedTables` y
   `postMigrationSQL` opcional.
7. **Given** una actualización en curso, **when** el paso `PREFLIGHT` detecta que
   hay una noche abierta, **then** la actualización aborta con diagnóstico
   "Cerrá la noche antes de actualizar".
8. **Given** una actualización en curso, **when** el paso `MIGRATE` aplica una
   migración que falla, **then** el sistema hace rollback de esa transacción
   (no de las anteriores), aborta la secuencia, y deja un log con el archivo
   `.sql` que falló y el error de Postgres.
9. **Given** una actualización en curso, **when** el paso `VERIFY_ARTIFACT` calcula
   el SHA256 del zip descargado, **then** debe coincidir con el `sha256` del
   release de GitHub; si no, aborta (archivo corrupto o manipulado).
10. **Given** el sistema corriendo, **when** `onEvent` recibe eventos del updater,
    **then** los errores (`type: "error"`) disparan una captura en Sentry con
    `tags` (step, from, to), `contexts` (system state) y `breadcrumbs` de los
    pasos exitosos anteriores.
11. **Given** el entorno de desarrollo (`docker compose` + `pnpm dev`), **when** se
    trabaja normalmente, **then** `packages/updater/` no interfiere — es un
    módulo que solo se activa en modo empaquetado (`RUNTIME_MODE=packaged`).

## Fuera de alcance

- **Auto-update completamente desatendido** (sin botón en `/admin`): la decisión de
  iniciar una actualización siempre requiere intervención humana (admin del boliche
  clickeando "Actualizar"). El check de versión sí es automático.
- **Rollback automático** ante falla post-update: si el smoke test falla, el
  sistema queda offline y loguea el error. El rollback es manual desde `/admin`
  (opción "Volver a vX.Y.Z"). Un rollback automático es más riesgo que beneficio
  — reiniciar servicios en un estado incierto puede corromper datos.
- **Actualizar desde ramas que no sean releases**: solo se actualiza desde releases
  taggeados en GitHub. `develop`, `main` sin tag, o artifacts manuales no son
  fuentes de update.
- **Instalador gráfico de updates**: la UI de update es exclusivamente el banner en
  `/admin` + indicador de progreso. No hay ventana nativa del SO.
- **Auto-update de dependencias del SO** (Node, Postgres, PostgREST binarios): si
  una nueva release requiere una versión de Node más nueva de la que trae el
  paquete portable, el update se aborta con diagnóstico "Se requiere Node vXX".
  Actualizar los binarios del runtime implica un nuevo paquete portable completo
  (no se actualizan in-place).
- **Migración de datos entre versiones mayores con breaking changes de dominio**:
  las migraciones de esquema están cubiertas; si hay que transformar datos
  existentes (ej. cambiar la semántica de un campo), eso va en las migraciones
  normales del PR 2, no en el updater.
- **Soporte para macOS/Linux empaquetado** en esta vuelta: el updater es
  packager-agnóstico por diseño, pero los paths (`pgdata/`, `current/`,
  `releases/`) y el mecanismo de auto-arranque se validan solo en Windows por ahora.

## Preguntas abiertas

- **¿El release de GitHub va a ser un zip con todo el paquete portable o solo los
  diffs/artifacts de `apps/api` + `apps/web`?** La spec asume zip completo (más
  seguro: swap de directorio entero), pero si los releases pesan mucho (>200MB por
  el Node portable y los binarios de Postgres), se puede evaluar un enfoque híbrido
  (runtime fijo + solo artifacts de aplicación). Se define al cerrar el diseño
  técnico.
- **¿Con qué frecuencia se consulta GitHub Releases?** Se asume una vez al arrancar
  el orquestador + cada 24 horas. Si hay conectividad intermitente en el boliche,
  el check simplemente falla sin consecuencia.
- **¿El updater se comunica con GitHub por HTTPS?** Sí. Si el boliche no tiene
  internet, el update simplemente no se puede hacer — pero el sistema sigue
  operando offline para cobros (el Posnet sí necesita internet para cobrar, pero
  eso es independiente del updater).
- **Sentry: ¿va en `apps/api`, en `packages/updater` o en el orquestador?**
  Sentry se inicializa en el orquestador (`apps/packaging/src/orchestrator.ts`)
  porque es el proceso raíz que tiene visibilidad de todo. Los eventos del updater
  llegan vía `onEvent` y el orquestador los enruta a Sentry.

## Relación con otros specs

- **[`empaquetado-windows.md`](./empaquetado-windows.md)**: este spec define
  **cómo se actualiza** el paquete. El spec de empaquetado define **cómo se
  construye** el paquete. Son specs hermanas, una no bloquea a la otra.
- **[`../deuda-pre-fase-6/activar-sync-cloud.md`](../deuda-pre-fase-6/activar-sync-cloud.md)**:
  el updater es independiente del sync local↔cloud.
- **[`../mercadopago/remediacion-integracion-mp.md`](../mercadopago/remediacion-integracion-mp.md)**:
  la remediación de MP es prerrequisito de Fase 6 en el ROADMAP, pero el updater en
  sí no toca nada de MP.
- **Runner de migraciones (PR 2 de remediación MP)**: es prerrequisito del updater
  — `packages/updater/src/migrator.ts` lo invoca como dependencia, no lo
  reimplementa.

---

## Arquitectura

### Principio: empaquetador-agnóstico

`packages/updater/` es un módulo TypeScript puro que no importa nada de Tauri,
Electron, Node SEA ni ningún framework de empaquetado. Expone una función `Updater`
que recibe paths y callbacks. Cualquier packager la invoca igual.

Esto significa que el diseño del updater **no depende de qué empaquetador se elija**
después. Se puede escribir, testear y tener listo antes de tomar esa decisión.

### Estructura del paquete `packages/updater/`

```
packages/updater/
├── src/
│   ├── index.ts              # exporta { Updater, UpdateManifest, UpdateEvent, ... }
│   ├── checker.ts            # GET /repos/{owner}/{repo}/releases/latest, compara versiones
│   ├── downloader.ts         # descarga release asset (.zip), verifica SHA256
│   ├── preflight.ts          # checks pre-update (detalle abajo)
│   ├── migrator.ts           # invoca el migration runner existente del PR 2
│   ├── swapper.ts            # backup pgdata → swap current/ → restore si falla
│   ├── verifier.ts           # smoke tests post-update + verificación de esquema
│   ├── manifest.ts           # carga, valida y compara update-manifest.json
│   └── types.ts              # UpdateManifest, UpdateResult, UpdateStep, UpdateEvent, ErrorCode
├── package.json
├── tsconfig.json
└── __tests__/                # unitarios de cada módulo
```

### State machine

Cada paso de la secuencia es una función que retorna `UpdateStepResult`:

```ts
type UpdateStepResult =
  | { success: true; next: UpdateStep }
  | { success: false; step: UpdateStep; error: ErrorCode; details: string }
```

**Secuencia completa:**

```
IDLE
  → CHECK_VERSION        // ¿hay release más nuevo en GitHub?
  → DOWNLOAD              // descargar .zip del release, verificar SHA256
  → VERIFY_ARTIFACT       // abrir el zip, verificar que update-manifest.json existe y es válido
  → PREFLIGHT             // checks de seguridad pre-update
  → BACKUP                // backup de pgdata + snapshot de version.json actual
  → MIGRATE               // correr migraciones pendientes contra el schema actual
  → VERIFY_SCHEMA         // ¿el schema post-migración coincide con expectedTables del manifest?
  → SWAP                  // mover current/ → releases/vX.Y.Z/, mover _update/ → current/
  → POST_CHECK            // smoke test: GET /api/health, GET /api/system/version
  → COMPLETE              // loguear éxito, programar limpieza del backup en 7 días
```

Si **cualquier paso** retorna `success: false`, la secuencia termina en `FAILED`.
La instalación actual **nunca se toca** antes de `SWAP`. Hasta ese punto, todos
los pasos trabajan sobre archivos temporales en `_update/`.

### Paso PREFLIGHT — checks pre-update

| Check | Qué valida | Error code si falla |
|---|---|---|
| **Noche abierta** | ¿`night_events` tiene una fila con `closed_at IS NULL`? | `PREFLIGHT_NIGHT_OPEN` |
| **Cobros pendientes** | ¿`mp_orders` tiene rows con `state != 'FINISHED'`? | `PREFLIGHT_PENDING_PAYMENTS` |
| **Espacio en disco** | `df` (Unix) / `wmic` (Windows) → ¿hay ≥ 2x el tamaño del zip libre? | `PREFLIGHT_DISK_SPACE` |
| **Permisos de escritura** | ¿se puede escribir en `releases/` y `_update/`? | `PREFLIGHT_PERMISSIONS` |
| **Postgres responde** | `SELECT 1` contra el Postgres embebido | `PREFLIGHT_POSTGRES_DOWN` |
| **Schema version actual vs expected** | ¿`schema_migrations` tiene la última migración que espera el manifest actual? | `PREFLIGHT_SCHEMA_MISMATCH` |
| **Env vars requeridas** | Compara `.env` actual con `envChanges.required` del nuevo manifest | `PREFLIGHT_MISSING_ENV` |
| **Runtime version** | ¿Node actual ≥ `requiresNode` del nuevo manifest? ¿Postgres ≥ `requiresPostgres`? | `PREFLIGHT_RUNTIME_VERSION` |

### Paso VERIFY_SCHEMA

Después de correr migraciones, compara `information_schema.tables` contra
`expectedTables` del `update-manifest.json`. Si falta alguna tabla esperada, aborta
con `VERIFY_MISSING_TABLE`. Si sobra alguna no esperada, emite warning (no aborta).

### Estrategia de archivos: swap completo de directorio

```
cocktrail/
├── current/              ← symlink o directorio activo (lo que corre)
│   ├── node/             ← Node portable
│   ├── postgrest.exe     ← PostgREST binario
│   ├── api/              ← apps/api dist/
│   └── web/              ← apps/web .next/
├── releases/             ← versiones descargadas y backups
│   ├── v1.0.0/           ← copia de la instalación original
│   └── v1.1.0/           ← nueva versión después del update
├── _update/              ← carpeta temporal durante la actualización
│   └── v1.2.0/           ← zip descargado y extraído (se borra al terminar)
├── pgdata/               ← datos de Postgres (NUNCA se toca)
├── .env                  ← configuración local (NUNCA se toca)
├── logs/                 ← logs del orquestador y del updater
├── version.json          ← {"current": "v1.1.0", "schemaVersion": 5, "updatedAt": "..."}
└── orchestrator.exe      ← entry point (o .bat, o lo que sea)
```

**El swap** (paso `SWAP`):
1. `mv current releases/v1.0.0` (la versión actual pasa a ser backup)
2. `mv _update/v1.2.0 current` (la nueva pasa a ser la actual)
3. Actualizar `version.json`

Esto garantiza que **no queda ningún archivo residual** de la versión anterior
en `current/`. Si el swap falla (ej. archivo en uso), se aborta y `current/`
sigue intacto.

**El backup** (`releases/v1.0.0/`) se conserva 7 días. Después el orquestador lo
borra automáticamente. Mientras existe, `/admin` muestra "Volver a v1.0.0".

### `update-manifest.json` — contrato entre versiones

Cada release de GitHub incluye este archivo en la raíz del zip portable:

```jsonc
{
  "version": "v1.1.0",
  "schemaVersion": 6,
  "requiresNode": ">=22",
  "requiresPostgres": ">=17",
  "deprecatedFiles": [
    "api/old-endpoint-handler.js",
    "web/.next/cache/previous-build/"
  ],
  "envChanges": {
    "added": ["SENTRY_DSN"],
    "removed": ["DEPRECATED_API_KEY"],
    "required": ["AUTH_SECRET", "JWT_SECRET", "JWT_SHARED_SECRET"]
  },
  "expectedTables": [
    "orders",
    "tickets",
    "night_events",
    "mp_orders",
    "mercadopago_cajas",
    "mercadopago_cajas_devices",
    "audit_logs",
    "schema_migrations"
  ],
  "postMigrationSQL": [
    "DELETE FROM orders WHERE payment_status = 'pendiente_de_cobro' AND created_at < now() - interval '90 days'",
    "DROP TABLE IF EXISTS cash_sales"
  ]
}
```

**Validación automática** en `manifest.ts`:
- `version` debe ser > `version.json#current` según semver.
- `schemaVersion` debe ser ≥ el schema actual.
- `required` env vars deben existir en `.env` (o el update se aborta en PREFLIGHT).
- `expectedTables` se verifica contra `information_schema.tables` post-migración.
- `postMigrationSQL` se ejecuta dentro de transacciones individuales después de
  migrar; si una falla, se loguea pero no aborta (son queries de limpieza, no
  estructurales).
- `deprecatedFiles` se usa en post-check para borrar archivos que hayan quedado
  fuera de `current/` (ej. logs viejos, cache).

### Integración con Sentry

El updater **no importa Sentry**. Expone un callback `onEvent`:

```ts
type UpdateEvent =
  | { type: "step_start"; step: UpdateStep; timestamp: string }
  | { type: "step_complete"; step: UpdateStep; duration: number; timestamp: string }
  | { type: "step_error"; step: UpdateStep; errorCode: ErrorCode; details: string }
  | { type: "update_complete"; fromVersion: string; toVersion: string; duration: number }
  | { type: "update_failed"; fromVersion: string; toVersion: string; step: UpdateStep; errorCode: ErrorCode; details: string; system: SystemSnapshot }
```

El orquestador (`apps/packaging/`) inicializa Sentry y conecta el callback:

```ts
import * as Sentry from "@sentry/node"
import { Updater } from "@cocktrail/updater"

Sentry.init({ dsn: process.env.SENTRY_DSN })

const result = await Updater.checkAndUpdate({
  currentVersion: "v1.0.0",
  repo: "matiasasin/cocktrail",
  pgdataPath: path.join(APP_ROOT, "pgdata"),
  installPath: path.join(APP_ROOT, "current"),
  onEvent: (event) => {
    if (event.type === "step_error") {
      Sentry.captureException(new Error(event.details), {
        tags: {
          step: event.step,
          errorCode: event.errorCode,
        },
        contexts: {
          update: {
            fromVersion: currentVersion,
            toVersion: latestVersion,
            step: event.step,
          },
        },
      })
    }
    if (event.type === "update_failed") {
      Sentry.captureException(new Error(event.details), {
        tags: { step: event.step, errorCode: event.errorCode },
        contexts: {
          update: { fromVersion: event.fromVersion, toVersion: event.toVersion, step: event.step },
          system: event.system,   // disk_free, db_size, night_open, etc.
        },
      })
    }
  },
})
```

Esto permite:
- **Monitoreo remoto**: el desarrollador ve en Sentry si un update falló en el
  boliche, con el paso exacto y el estado del sistema.
- **Breadcrumbs**: cada `step_start`/`step_complete` se puede enviar como
  breadcrumb de Sentry para tener la traza completa.
- **Sin dependencia**: si `SENTRY_DSN` no está configurado, el updater funciona
  igual — simplemente no se emiten eventos a ningún lado.

### API en `/api/system`

Se agregan endpoints para que `/admin` pueda consultar el estado:

- `GET /api/system/version` → `{ current: "v1.1.0", schemaVersion: 5, latestAvailable: "v1.2.0" | null, updateAvailable: true | false }`
- `POST /api/system/update` → inicia la secuencia de update. Retorna `202 Accepted` y el frontend consulta el progreso.
- `GET /api/system/update/status` → `{ status: "idle" | "checking" | "downloading" | ... | "complete" | "failed", step: UpdateStep, progress: number }`
- `POST /api/system/rollback` → vuelve al backup de la versión anterior.
- `GET /api/system/health` → (ya existe o se agrega) `{ healthy: true, uptime: number, version: string }`

El orquestador expone estos endpoints en `apps/api` detrás de auth de admin.

### Rollback manual desde `/admin`

Cuando existe un backup en `releases/`:

1. `POST /api/system/rollback` → el backend swapea `current/` por `releases/v1.0.0/`.
2. Las migraciones de schema **no se revierten** (las migraciones son `IF NOT EXISTS` / acumulativas, y el código viejo convive con columnas/tablas nuevas sin problema).
3. El orquestador se reinicia apuntando a `current/v1.0.0`.

---

## Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-U1 | **Corte de luz durante el update**: si el swap está en curso y se corta la corriente, `current/` puede quedar corrupto (mitad archivos viejos, mitad nuevos). | Sistema no arranca. | El swap se hace con `mv` atómico (renombrar directorio en el mismo filesystem es atómico en NTFS). Si falla, `current/` viejo sigue intacto porque el swap solo mueve punteros. |
| R-U2 | **Migración de schema incompatible hacia atrás**: una migración agrega una columna `NOT NULL` sin default. El código viejo (rollback) no sabe llenarla. | Si se hace rollback, las escrituras del código viejo fallan. | Las migraciones del proyecto ya siguen el patrón `ADD COLUMN ... DEFAULT ...` o `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Agregar este check como parte de `preflight.ts`. |
| R-U3 | **GitHub API rate limit**: el check de versiones consulta la API sin autenticación (60 req/hora por IP). | Si el boliche comparte IP con otros servicios, puede rate-limitarse. | El check se hace 1 vez al arrancar + cada 24h. En el peor caso, el update simplemente no se detecta hasta la próxima ventana. Opcional: usar un PAT de solo-lectura en el `.env`. |
| R-U4 | **postMigrationSQL destructivo**: un `DROP TABLE` mal escrito borra datos reales. | Pérdida de datos. | Cada query de `postMigrationSQL` corre en su propia transacción con `ROLLBACK` si falla. Queries `DROP` solo se permiten si la tabla está vacía (check previo). |
| R-U5 | **Sentry no configurado y update falla**: sin Sentry, el desarrollador no se entera. | Update fallado sin diagnóstico remoto. | Los logs del updater se persisten en `logs/updater.log` localmente. El desarrollador puede revisarlos por SSH si necesita. Sentry es un plus, no el único canal. |
| R-U6 | **Dependencia circular**: `packages/updater` referencia el migration runner de `apps/api`. | Acoplamiento entre paquetes. | El migration runner actual (PR 2) se extrae a `packages/shared/` o se expone como un script standalone que el updater invoca vía `spawn`. Se define en el diseño técnico. |

---

## Tareas

### 0. Preparación

- [ ] `packages/updater/`: scaffolding del paquete nuevo (`package.json`, `tsconfig.json`, dependencias mínimas: `semver`, `tar` o `adm-zip` para extraer el zip, `pg` para checks de DB). Sin dependencia de ningún packager.
- [ ] Agregar `packages/updater/` al `pnpm-workspace.yaml`.
- [ ] Script `pnpm --filter cocktrail-updater typecheck` y `pnpm --filter cocktrail-updater test`.

### 1. `update-manifest.json` — tipado, validación, generación

- [ ] `packages/updater/src/manifest.ts`: tipos TypeScript para `UpdateManifest` (`version`, `schemaVersion`, `requiresNode`, `requiresPostgres`, `deprecatedFiles`, `envChanges`, `expectedTables`, `postMigrationSQL`).
- [ ] `manifest.validate(manifest: unknown): UpdateManifest | ValidationError[]` — zod o validación manual.
- [ ] `manifest.compare(current: UpdateManifest, next: UpdateManifest): ManifestDiff` — detecta cambios en env vars, runtime requirements, expected tables.
- [ ] Script en `apps/packaging/scripts/generate-manifest.mjs` que genera `update-manifest.json` a partir de los archivos del repo y lo incluye en el build portable.
- [ ] `update-manifest.json` versionado en la raíz del repo como plantilla base (sin valores de release, que los completa el script de build).

### 2. `checker.ts` — detección de nueva versión

- [ ] `checker.getLatestRelease(repo: string): Promise<GitHubRelease>` — consulta `GET /repos/{repo}/releases/latest` (sin auth, o con `GITHUB_TOKEN` del `.env` si existe).
- [ ] `checker.isUpdateAvailable(current: string, latest: string): boolean` — usa `semver.gt()`.
- [ ] Tests: mock de la respuesta de GitHub API (release encontrado, 404 sin releases, rate limit).
- [ ] Manejar errores de red: timeout 10s, sin internet → `{ available: false, error: "NETWORK_UNREACHABLE" }` (no tira excepción).

### 3. `downloader.ts` — descarga y verificación

- [ ] `downloader.download(release, destFolder): Promise<string>` — descarga el asset `.zip` del release a `_update/vX.Y.Z/`. Soporta resume (si el zip se descargó parcialmente antes).
- [ ] Verificar SHA256: el release de GitHub debe incluir un archivo `SHA256SUMS` o el hash en el body. Comparar antes de extraer. Si no coincide → `DOWNLOAD_CHECKSUM_MISMATCH`.
- [ ] Extraer el zip en `_update/vX.Y.Z/`. Verificar que `update-manifest.json` existe en la raíz del zip.
- [ ] Tests: mock de download + extracción, checksum válido, checksum inválido, archivo corrupto.

### 4. `preflight.ts` — checks pre-update

- [ ] `preflight.run(options): Promise<PreflightResult>` — ejecuta todos los checks en orden, se detiene en el primero que falla.
- [ ] Cada check es una función independiente y testeable:
  - `checkNoOpenNight(pgClient)` → `SELECT 1 FROM night_events WHERE closed_at IS NULL`
  - `checkNoPendingPayments(pgClient)` → `SELECT 1 FROM mp_orders WHERE state != 'FINISHED'`
  - `checkDiskSpace(path, requiredBytes)` → usa `fs.statfs` o `check-disk-space` npm package
  - `checkWritePermissions(...paths)` → `fs.access(path, W_OK)` en cada directorio
  - `checkPostgresResponds(pgClient)` → `SELECT 1`
  - `checkSchemaVersion(pgClient, expected)` → compara `schema_migrations` con `update-manifest.json#schemaVersion`
  - `checkEnvVars(manifest)` → compara `.env` actual con `envChanges.required`
  - `checkRuntimeVersion(manifest)` → `process.version` vs `requiresNode`, `SELECT version()` vs `requiresPostgres`
- [ ] Cada check retorna `{ ok: true } | { ok: false, errorCode: ErrorCode, details: string }`.
- [ ] Tests: mock de pgClient, mock de fs, cada escenario de falla.

### 5. `migrator.ts` — migraciones de esquema

- [ ] `migrator.run(pgdataPath, manifest): Promise<MigrateResult>` — invoca el migration runner existente (PR 2).
- [ ] El migration runner debe estar disponible como script standalone o como función exportable desde `apps/api/` a `packages/updater/` (se resuelve en el diseño técnico; opciones: extraer a `packages/shared/`, spawn de un script, o inyectar como dependencia).
- [ ] Cada migración en su propia transacción. Si una falla → rollback de esa transacción, aborto del update.
- [ ] Log de cada migración aplicada (archivo `.sql` + timestamp).
- [ ] Tests: mock del runner, migración exitosa, migración fallida.

### 6. `swapper.ts` — backup + swap atómico

- [ ] `swapper.backup(pgdataPath, destDir)` — comprime `pgdata/` con tar/zip a `_backup/pre-vX.Y.Z-pgdata.tar.gz`. Verifica integridad del backup (checksum).
- [ ] `swapper.swap(currentPath, newPath, backupPath)` — `mv current backup && mv new current`. Atómico en NTFS/ext4 porque es rename dentro del mismo filesystem.
- [ ] `swapper.restore(backupPath, currentPath)` — revierte el swap (rollback).
- [ ] `swapper.cleanup(backupPath, maxAge)` — borra backups de más de N días.
- [ ] `swapper.cleanupDeprecatedFiles(manifest.deprecatedFiles)` — borra archivos listados en deprecatedFiles si existen fuera de `current/`.
- [ ] Tests: mock de fs con rename, verificar que el swap no pierde archivos, rollback funcional.

### 7. `verifier.ts` — smoke tests post-update

- [ ] `verifier.smokeTest(baseUrl, timeout)` — `GET {baseUrl}/api/health` + `GET {baseUrl}/api/system/version`. Ambos deben responder 200. Retry 3 veces con backoff exponencial (el orquestador puede tardar en levantar).
- [ ] `verifier.verifySchema(pgClient, expectedTables)` — `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'` vs `expectedTables`.
- [ ] `verifier.runPostMigrationSQL(pgClient, manifest.postMigrationSQL)` — ejecuta cada query en su propia transacción. Si falla, loguea pero no aborta.
- [ ] Tests: mock de fetch para smoke test, mock de pgClient para verifySchema.

### 8. State machine — orquestación

- [ ] `packages/updater/src/index.ts`: `Updater.checkAndUpdate(options): Promise<UpdateResult>`.
- [ ] Cada paso llama al módulo correspondiente, emite `UpdateEvent` vía `onEvent`.
- [ ] Si un paso falla, no se ejecutan los siguientes. Se emite `update_failed`.
- [ ] `Updater.checkOnly(options): Promise<CheckResult>` — solo CHECK_VERSION + DOWNLOAD (sin aplicar), para el banner de `/admin`.
- [ ] `Updater.rollback(options): Promise<RollbackResult>` — swaper.restore + reinicio del orquestador.
- [ ] Tests de integración: secuencia completa mockeada, fallo en cada paso, evento emitido correctamente.

### 9. API endpoints en `apps/api`

- [ ] `GET /api/system/version` — devuelve versión actual + si hay update disponible.
- [ ] `POST /api/system/update` — dispara `Updater.checkAndUpdate()` en background. Retorna `202 Accepted`.
- [ ] `GET /api/system/update/status` — devuelve el estado actual de la state machine (idle/downloading/preflight/migrating/complete/failed).
- [ ] `POST /api/system/rollback` — dispara `Updater.rollback()`.
- [ ] `GET /api/system/health` — extender con `version` y `uptime`.
- [ ] Solo accesible con rol `admin` (usar guard existente).

### 10. Frontend — banner en `/admin`

- [ ] Componente `UpdateBanner` en `apps/web/src/components/admin/UpdateBanner.tsx`: muestra "Nueva versión vX.Y.Z disponible" con botón "Actualizar" y "Ignorar".
- [ ] Al clickear "Actualizar": llama `POST /api/system/update`, muestra progreso (spinner + paso actual).
- [ ] Al completar: muestra "Actualización exitosa — reiniciando..." y recarga la página.
- [ ] Al fallar: muestra "Error: [diagnóstico]" con el paso que falló.
- [ ] Sección "Versión" en settings de `/admin`: versión actual, fecha de última actualización, botón "Buscar actualizaciones", botón "Volver a vX.Y.Z" (si hay backup).
- [ ] Polling cada 24h a `GET /api/system/version` para detectar updates sin recargar.

### 11. Sentry — integración en el orquestador

- [ ] `apps/packaging/src/orchestrator.ts`: inicializar Sentry si `SENTRY_DSN` está en `.env`.
- [ ] Conectar `onEvent` del updater: `step_error` y `update_failed` → `Sentry.captureException()`.
- [ ] Agregar `SENTRY_DSN` a `.env.example` (opcional, comentado por default).
- [ ] Documentar en `docs/ARCHITECTURE.md` cómo configurar Sentry para el modo empaquetado.

### 12. `version.json` y metadata de versión

- [ ] Formato: `{ "current": "v1.1.0", "schemaVersion": 6, "installedAt": "2026-07-24T...", "updatedAt": "2026-08-01T..." }`.
- [ ] El script `build-portable.mjs` del empaquetado genera `version.json` inicial.
- [ ] El updater actualiza `version.json` después de cada update exitoso o rollback.
- [ ] Tests: lecto-escritura concurrente (dos updates no pueden correr a la vez — lock file).

### 13. Documentación

- [ ] Actualizar `docs/ROADMAP.md`: agregar este spec como entregable de Fase 6, tildar "versionado y actualizaciones" cuando esté implementado.
- [ ] Actualizar `docs/ARCHITECTURE.md` §9: documentar `packages/updater/`, la state machine, el formato `update-manifest.json`, y la estructura de directorios del paquete portable.
- [ ] `packages/updater/README.md`: guía para desarrolladores (cómo agregar un nuevo release, cómo escribir `update-manifest.json`, cómo testear el updater localmente).

### 14. Verificación

- [ ] `pnpm typecheck` en verde (incluye `packages/updater`).
- [ ] `pnpm --filter cocktrail-updater test` en verde (unitarios de cada módulo de la state machine).
- [ ] Test de integración: simular un update completo con Postgres embebido real (sin GitHub — usar un zip local), verificar que todos los pasos corren y el sistema arranca post-update.
- [ ] Smoke test manual: desde una instalación empaquetada real, disparar un update a un release simulado, verificar banner en `/admin`, progreso, éxito, y rollback funcional.

---

**Nota de proceso**: esta spec se escribe **antes de decidir el empaquetador** (Tauri/Electron/
Node SEA). `packages/updater/` es un módulo TypeScript puro — no depende de ninguna decisión
de empaquetado. Se puede implementar y testear en paralelo con la spec
[`empaquetado-windows.md`](./empaquetado-windows.md), incluso antes de que `apps/packaging/`
exista. El único punto de contacto es el orquestador (`apps/packaging/src/orchestrator.ts`),
que inicializa Sentry y conecta el callback `onEvent` — eso se resuelve cuando el
empaquetado esté andando.
