# Deuda encontrada durante la remediación MP

> Log de trabajo de la implementación de `docs/specs/mercadopago/remediacion-integracion-mp.md`.
> Cada deuda/hallazgo nuevo que aparezca durante los 6 PRs se anota acá; en el PR 6
> se vuelca al `docs/ROADMAP.md` (lo que amerite) y este archivo se cierra.
>
> Formato: `- [PR donde se detectó] descripción — acción sugerida`.

## Migraciones / runner (detectadas en el diseño del PR 2)

- [PR2] `supabase/migrations/schema.sql` es un dump cumulativo **stale** (no tiene las tablas MP, no se monta en ningún lado, el runner lo excluye solo por regex). Riesgo de que alguien lo tome por la verdad — borrarlo o regenerarlo automáticamente.
- [PR2] Una migración fallida requiere corregir + reiniciar el backend (o `db:migrate` a mano). Posible futuro: botón "Reintentar migraciones" en /admin.
- [PR2] Drift de checksum sin remediación in-app (la salida es un `UPDATE schema_migrations` manual). Posible futuro: `db:migrate --accept-drift`.
- [PR2] `applyWithoutTransaction` (directiva `-- migrate:no-transaction`) no es atómico: SQL y registro van separados; un crash entre ambos re-ejecuta el `.sql` en el próximo boot. **"Toda migración es idempotente" pasa de buena práctica a invariante duro** — documentar en CLAUDE.md/ARCHITECTURE (PR 6) y vigilar en review.
- [PR2] El default de `DATABASE_URL` embebe credenciales dev (`postgres:postgres@127.0.0.1:54322`). Si alguien overridea `POSTGRES_PASSWORD`/`POSTGRES_EXTERNAL_PORT` sin setear `DATABASE_URL`, el runner falla (visible vía banner, pero confuso). Considerar warning si `NODE_ENV=production` con el default.
- [PR2] Lock huérfano: si un proceso zombie retiene el advisory lock, el runner desiste (~30s) y arranca degradado. Runbook pendiente: matar el backend viejo o `pg_advisory_unlock_all()` desde esa sesión.
- [PR2] La migración de pgTAP (`20260715000600`) ahora también se aplica en producción vía runner (antes era un init-script igual de indiscriminado). Instala una extensión de testing en la mini-PC — falta una convención para migraciones dev-only.
- [PR2] Los `GRANT/REVOKE ... anon, authenticated` de las migraciones asumen los roles del cluster de la imagen supabase (los crea `01-roles.sql`/la imagen). Para el Postgres embebido de la Fase 6, "crear los roles" tendrá que ser migración 0 o bootstrap del runner.
- [PR2] Checksums sensibles a EOL: mitigado normalizando `\r\n→\n` antes de hashear, pero conviene además `.gitattributes` con `*.sql text eol=lf` antes del empaquetado Windows (Fase 6).
- [PR2] Header interno desincronizado en `20260720000100_bar_sessions_last_seen.sql` (decía `20260718020000...`) — se corrige en el PR 2; el patrón (renombrar el archivo sin tocar el header) queda como cosa a vigilar.
- [PR2] **Las migraciones legacy fueron editadas después de aplicadas**: la base de dev tiene `app_config` con `DEFAULT 'normal'/'Cocktrail'` pero el archivo actual de `20240101000000_schema.sql`/`20240102000000_edge_sync.sql` crea `DEFAULT 'bosko'/'Bosko'` — una base de cero y una migrada incrementalmente difieren en esos defaults (solo afecta filas nuevas; funcionalmente inocuo hoy). El backfill por re-ejecución baselinea con el checksum ACTUAL, así que no puede detectar ediciones pasadas — de acá en adelante el drift sí las detecta. Confirma el hallazgo de la auditoría ("migraciones no-op que delatan edición de migraciones ya aplicadas").
- [PR2] La verificación "base de cero == incremental" por `CREATE DATABASE` scratch tiene un límite: una base creada con `CREATE DATABASE` no hereda los DEFAULT PRIVILEGES que la imagen supabase configura en el initdb — la comparación válida es sobre tablas/índices/funciones (dio idéntico), no sobre ACLs.

- [PR2] **Las migraciones legacy regalan `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`** (`20240101000000_schema.sql:69` y `20240102000000_edge_sync.sql:47`): todas las tablas viejas (night_events, orders, tickets, drinks, users…) son escribibles por el rol anónimo vía PostgREST. Las tablas MP nuevas lo revocan una por una, pero las 8 legacy no. Relacionado con el criterio E de la spec (que solo cubre tablas nuevas) — merece entrada propia en el ROADMAP. El runner re-asegura el REVOKE de `schema_migrations` al final de cada corrida justamente por esto.

## Backend / API

- [PR2] `/api/system/status` es caro (fetchs a 1.1.1.1 y MP con timeout 2s) y tiene rate-limit de 10 req/min — cualquier consumidor frontend en polling choca con eso. El split health/status del PR 2 es el patrón a seguir.
- [PR2] Frontera "único archivo del repo que usa `pg`" (`infra/migrations/pg-migrations.repository.ts`): ahora que el driver está en `package.json`, la tentación de usarlo fuera existe (el docstring de `refreshTokenIfNeeded` incluso lo sugiere). La regla debe quedar escrita en CLAUDE.md (PR 6).
- [PR2] `getHealth()` lee el singleton de migraciones sin DI — excepción consciente al patrón constructor-injection del repo; asentado para review.
- [PR1] El retry-loop de `server.ts:139-141` traga errores en silencio (`catch {}` anti-spam) — deuda pre-existente al merge MP; el runner loguea por su cuenta, pero el loop sigue opaco.
- [spec] R17: los controllers MP nuevos validan a mano con `typeof` en vez del `validate.ts` con zod existente — ya identificado en la spec, va al ROADMAP en PR 6.

## Integridad del cobro (detectadas en el PR 3)

- [PR3] **Reintento A11 puede duplicar el pedido de dominio**: `POST /api/orders` no tiene idempotencia propia — si el create llegó al servidor pero la respuesta se perdió, el reintento desde el banner crea un segundo pedido. La solución real es llevar la misma semilla de idempotencia a `orders` (candidato PR 5/6).
- [PR3] **La ligadura orders↔mp_orders sigue sin existir** — la conciliación "cobro processed sin pedido" es manual (cruzando `mp_orders` con la constancia local de `pendingSales`).
- [PR3] **Los cobros Posnet no dejan fila en `mp_orders`** (el service legacy no inserta) — `event_id` y el push del PR 5 solo verán cobros QR. Afecta el criterio C para débito.
- [PR3] La constancia A11 vive en localStorage — se pierde con "borrar datos de navegación" (mitigada por la fila `processed` en el servidor).
- [PR3] La frescura del webhook depende del reloj de la mini-PC (ventana 300s) — conviene NTP en la máquina del boliche.
- [PR3] Estado `unknown` persistente: si MP inventa un estado no terminal, el polling corre hasta el expiresAt y cancela — la order podría quedar pagada en MP y cancelada local (el reconcile/webhook la corrige). Vigilar en producción.
- [PR3] La semilla de idempotencia solo viaja en QR; el intent del Posnet queda con la protección del device (un intent abierto por vez + retries DEVICE_BUSY).
- [PR3] Truncado de `external_ref` (`COCKTRAIL-{key}` a 64 chars): dos keys que compartan los primeros 54 chars colisionarían — con UUIDs (36) no pasa nunca; solo con keys largas artesanales.
- [PR3] Webhooks sin header `x-request-id` se persisten con id sintético — sin dedupe posible entre sus reintentos (solo ruido: el reconcile es idempotente).
- [PR3] `markFailed` de webhook events no es atómico (read-modify-write de `attempts`; PostgREST no incrementa) — depende del single-writer de un solo proceso Node (supuesto del frente H).
- [PR3] Ventana mínima de doble reconcile entre el drain oportunista y un webhook en proceso (sin lock por evento) — inofensivo por idempotencia del reconcile.
- [PR3] El reset de la semilla en cancelaciones manuales de QR depende de que la UI llame `resetPaymentAttempt()` — un camino de cancelación futuro que lo olvide podría replayear una order cancelada. Candidato: mover la cancelación QR adentro del hook.
- [PR3] `retryPendingSale` exitoso desde el banner no muestra la pantalla de éxito/ticket (el registro va a barra igual) — si se quiere ticket para ventas recuperadas, es trabajo aparte.

## Gestión de dispositivos Posnet (hallazgo 2026-07-21, NO previsto en la spec)

- [PR3] **La UI de Posnets del admin es decorativa a los fines de cobrar.** El cobro de `/caja` resuelve el device en `mercadopago.service.ts:178` (`deviceId || env.MP_POS_DEVICE_ID`), y el `deviceId` sale del header `x-device-id` que **el frontend nunca envía** (`api-client.ts` solo manda `X-Bar-Id`; grep de `x-device-id` en `apps/web/src` = 0). Registrar o vincular un Posnet desde `/admin?tab=pagos` **solo escribe en `mercadopago_cajas_devices`**, tabla que ningún camino de cobro lee. Consecuencia práctica: cambiar de Posnet físico obliga a editar `apps/api/.env` y reiniciar el backend — no se puede hacer desde la app.
  - La spec contempló los **síntomas** (criterio G línea 125: el botón de prueba apunta al device correcto → PR 6; A12 línea 388: validar `x-device-id` server-side → PR 4; D5: cablear el CRUD con "vincular Posnet" → PR 6) pero **no la causa**: no existe el camino "device vinculado en la base → cobro a ese device".
  - Atenuante: la spec se compromete con **un solo PDV** (línea 143), así que el device en env no es incoherente con el modelo. El defecto es que la UI aparente lo contrario.
  - **Decisión pendiente para el PR 6**: o el cobro resuelve el device desde la caja vinculada (y la env queda como fallback), o la env queda como fuente única y la UI se vuelve honesta (mostrar el device activo, sin prometer que se administra ahí).
- [PR3] El formulario de alta de Posnet tiene el prefijo **hardcodeado** `PAX_A910__SMARTPOS` y solo acepta el sufijo numérico (`PagosSection.tsx:151`, `:504`) — un aparato de otro modelo no se puede registrar desde la UI.
- [PR3] **No hay forma de descubrir el device ID desde la app**: `GET /point/integration-api/devices` se consulta en dos lugares (`mercadopago.service.ts:432-455` y `mercadopago-provisioning.service.ts:617-628`) pero ambos filtran por un ID conocido y descartan el resto. No existe endpoint que liste los devices de la cuenta — hay que sacar el ID del aparato o del panel de MP. Un `GET /api/mercadopago/devices` que exponga la lista sería barato y resolvería el alta a ciegas.
- [PR3] **A17 reapareció**: al 2026-07-21 hay **2 sellers activos** en Cloud (`1517393956` GARCIAMANUEL del 20/07 18:38 y `225043369` ASMA4106894 del 20/07 21:12, que se había borrado a mano y volvió a vincularse). Hoy el cobro usa el correcto solo porque `findFirstActive` toma el más viejo y ese resulta ser el del dueño. Confirma la urgencia de D9 (vincular reemplaza + Desvincular) en el PR 4.

## Vinculación de cuentas MP ↔ Posnet (hallazgos del 2026-07-21, en vivo)

- [PR3] **La titularidad del lector manda sobre el login.** Un Point queda registrado en la cuenta que lo reclamó, y **cerrar sesión no la libera** (verificado: el lector figura "Sin sesión activa" y sigue listado en la cuenta ajena). Entrar como *colaborador* con el propio email permite configurarlo, pero **los cobros entran a la cuenta del titular** — comprobado con un cobro de prueba de $15 que quedó en las ventas de la otra cuenta. Para moverlo hay que darlo de baja desde la cuenta titular o hacer el cambio de titularidad de MP.
- [PR3] **El lector, el seller vinculado por OAuth y la caja provisionada tienen que ser de la misma cuenta de MP.** Hoy nada valida ni advierte esta coherencia (→ R23).
- [PR3] **Los lectores deben estar en modo `PDV`, no `STANDALONE`**, para recibir cobros por la Integration API. Nada en la app lo muestra ni lo corrige (la API sí permite cambiarlo por `PATCH`).
- [PR3] **Cambiar de cuenta deja las cajas huérfanas** (→ R22): `mercadopago_cajas` guarda `seller_user_id` y su `store_id`/`pos_id_mp` viven en la cuenta de ese seller, pero no hay re-provisión ni limpieza al vincular otra. **Ojo: el QR cambia** si se re-provisiona en otra cuenta.
- [PR3] Diagnosticar todo esto requirió consultas manuales a `/users/me` y `/point/integration-api/devices` con cada token. **Un endpoint de diagnóstico** (o el chequeo de salud de R23) habría ahorrado horas.

## Tests / higiene

- [PR1] Los 6 tests de PDV/Posnet de `PagosSection.test.tsx` quedaron en `it.skip` con vencimiento en el PR 6 (migran a `PdvSection.test.tsx`). Si el PR 6 se recorta, quedan skips permanentes.
- [PR1] Nombre de paquete web engañoso: `apps/web` se llama `cocktrail-app` (la api es `cocktrail-api`) — ya causó comandos `--filter` incorrectos. Renombrar a `cocktrail-web` es trivial pero toca lockfile/filters.
- [PR1] **No existe script `test` en el `package.json` raíz**: `pnpm test` en la raíz sale en silencio con exit 0 sin correr nada — da falsa sensación de suite verde. Agregar `"test": "pnpm --filter cocktrail-api test && pnpm --filter cocktrail-app test"` (la spec y AGENTS.md asumen que `pnpm test` corre todo).
