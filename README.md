# Cocktrail (BarQR)

Sistema de pedidos QR + cobro para boliches. **App local-first**: corre en una mini-PC/laptop del local,
sin depender de internet. El cliente escanea un QR → arma su pedido → recibe un ticket → lo retira en la barra.
La caja cobra presencial (efectivo / débito Posnet / QR) y el admin ve totales en vivo y cierra la noche.

> 📐 Arquitectura completa: **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** · Plan: [`docs/ROADMAP.md`](./docs/ROADMAP.md)

## Stack

Monorepo pnpm: **`apps/api`** (Express 5 + TypeScript) · **`apps/web`** (Next.js 16 + React 19.2) · **`packages/shared`** (dominio).
Persistencia: **Supabase local (Postgres)** como fuente de verdad + **Supabase cloud opcional** para sync diferido.
Real-time por SSE. Auth por cookie HMAC. Mercado Pago Point (Posnet) real.

## Correr

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # completar AUTH_SECRET, etc.
cp apps/web/.env.example apps/web/.env   # AUTH_SECRET debe coincidir con la api

docker compose up -d   # levanta Supabase local (Postgres + PostgREST + Kong, REST en :54321)
pnpm dev                # api (:3001) + web (:3000) en paralelo
# para que el celu acceda por LAN: pnpm dev:web ya usa -H 0.0.0.0
```

Roles de prueba (fallback): `admin/admin`, `caja/caja`, `barra/barra`.

## Pantallas

`/carta` (cliente) · `/barra` (barman/KDS) · `/caja` (cajera) · `/admin` (dueño).

## Comandos

```bash
pnpm typecheck    # tsc --noEmit en api + web
pnpm build        # build de ambas apps
docker compose up -d    # levanta Supabase local (REST en :54321) — ver docs/DEPLOY.md
docker compose down     # baja el stack local (agregá -v para borrar también el volumen de datos)
```

## Resetear datos (dejar la base limpia)

`pnpm --filter cocktrail-api db:reset -- --target=local|cloud` vacía `night_events`, `orders`,
`tickets`, `users` y `audit_logs` (noches, pedidos, tickets y usuarios custom creados desde
`/admin`). **No toca** `drinks` (la carta) ni `app_config` — es contenido real del local, no
dato de prueba. Ver `apps/api/src/scripts/reset-data.ts`.

```bash
pnpm --filter cocktrail-api db:reset -- --target=local            # pide confirmación tipeada
pnpm --filter cocktrail-api db:reset -- --target=local --yes      # sin confirmación (solo local)
pnpm --filter cocktrail-api db:reset -- --target=cloud            # SIEMPRE pide confirmación tipeada, sin --yes posible
```

- **`--target=local`**: usalo todas las veces que quieras durante desarrollo/testeo para limpiar
  la base de la mini-PC (ej. después de probar un flujo de cobro, antes de una demo). No requiere
  nada especial, `docker compose up -d` alcanza.
- **`--target=cloud`**: borra los datos reales de Supabase Cloud (producción). Requiere
  `SUPABASE_CLOUD_URL` y `SUPABASE_CLOUD_SERVICE_ROLE_KEY` configuradas en `apps/api/.env` — si
  no están, el comando falla explícitamente en vez de fallar en silencio. **Correr solo el día de
  la entrega real**, no antes (mientras se sigue developeando conviene tener datos de prueba en
  cloud para verificar que el sync funciona).
- Después de un reset, la tabla `users` se re-siembra sola con el admin default al reiniciar el
  server (`ensureLocalMasterDataSeeded`) — el login de `admin`/`caja`/`barra` sigue funcionando
  igual en cualquier caso, porque tiene un fallback por variables de entorno independiente de la
  tabla (`apps/api/src/modules/auth/auth.service.ts`).
- El server **ya no siembra historial de demo automáticamente al arrancar** (antes lo hacía si no
  había noches cerradas) — así un reset queda limpio de verdad entre reinicios.

## Documentación

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura real (fuente de verdad).
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — fases, pendientes, riesgos/deuda.
- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — desplegar en la PC del boliche (Docker + app + LAN).
- [`docs/specs/`](./docs/specs/README.md) — specs de features (SDD nativo), organizadas por fase. El índice completo está en [`docs/specs/README.md`](./docs/specs/README.md).
- [`docs/plans/`](./docs/plans/) — planes técnicos, con las mismas subcarpetas por fase que `docs/specs/`.
- [`docs/AGENTS.md`](./docs/AGENTS.md) — subagents y skills.
- [`AGENTS.md`](./AGENTS.md) — reglas para agentes de IA.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — constitución del proyecto (reemplaza a CLAUDE.md).
