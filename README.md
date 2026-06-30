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

pnpm dev          # api (:3001) + web (:3000) en paralelo
# para que el celu acceda por LAN: pnpm dev:web ya usa -H 0.0.0.0
```

Roles de prueba (fallback): `admin/admin`, `caja/caja`, `barra/barra`.

## Pantallas

`/carta` (cliente) · `/barra` (barman/KDS) · `/caja` (cajera) · `/admin` (dueño).

## Comandos

```bash
pnpm typecheck    # tsc --noEmit en api + web
pnpm build        # build de ambas apps
docker compose up -d # Supabase local (REST en :54321) — ver docs/DEPLOY.md
```

## Documentación

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura real (fuente de verdad).
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — fases, pendientes, riesgos/deuda.
- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — desplegar en la PC del boliche (Docker + app + LAN).
- [`docs/AGENTS.md`](./docs/AGENTS.md) — subagents y skills.
- [`docs/specs/`](./docs/specs/) — specs de features (SDD nativo).
- [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) — reglas para agentes de IA.
