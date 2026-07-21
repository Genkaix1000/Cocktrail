# Deuda encontrada durante la remediación MP

> Log de trabajo de la implementación de `docs/specs/remediacion-integracion-mp.md`.
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

## Backend / API

- [PR2] `/api/system/status` es caro (fetchs a 1.1.1.1 y MP con timeout 2s) y tiene rate-limit de 10 req/min — cualquier consumidor frontend en polling choca con eso. El split health/status del PR 2 es el patrón a seguir.
- [PR2] Frontera "único archivo del repo que usa `pg`" (`infra/migrations/pg-migrations.repository.ts`): ahora que el driver está en `package.json`, la tentación de usarlo fuera existe (el docstring de `refreshTokenIfNeeded` incluso lo sugiere). La regla debe quedar escrita en CLAUDE.md (PR 6).
- [PR2] `getHealth()` lee el singleton de migraciones sin DI — excepción consciente al patrón constructor-injection del repo; asentado para review.
- [PR1] El retry-loop de `server.ts:139-141` traga errores en silencio (`catch {}` anti-spam) — deuda pre-existente al merge MP; el runner loguea por su cuenta, pero el loop sigue opaco.
- [spec] R17: los controllers MP nuevos validan a mano con `typeof` en vez del `validate.ts` con zod existente — ya identificado en la spec, va al ROADMAP en PR 6.

## Tests / higiene

- [PR1] Los 6 tests de PDV/Posnet de `PagosSection.test.tsx` quedaron en `it.skip` con vencimiento en el PR 6 (migran a `PdvSection.test.tsx`). Si el PR 6 se recorta, quedan skips permanentes.
- [PR1] Nombre de paquete web engañoso: `apps/web` se llama `cocktrail-app` (la api es `cocktrail-api`) — ya causó comandos `--filter` incorrectos. Renombrar a `cocktrail-web` es trivial pero toca lockfile/filters.
- [PR1] **No existe script `test` en el `package.json` raíz**: `pnpm test` en la raíz sale en silencio con exit 0 sin correr nada — da falsa sensación de suite verde. Agregar `"test": "pnpm --filter cocktrail-api test && pnpm --filter cocktrail-app test"` (la spec y AGENTS.md asumen que `pnpm test` corre todo).
