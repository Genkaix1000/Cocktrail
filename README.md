# Cocktrail

Sistema de pedidos por QR para boliches. El cliente escanea un QR, pide tragos desde el celu, el barman los prepara y la cajera ve la caja en tiempo real.

**Estado actual**: MVP demo hardcoded, sin base de datos. Para mostrarle el sistema funcionando a un dueño de boliche.

## Stack

- Next.js 16 (App Router) + React 19
- Tailwind v4 + shadcn (base-nova)
- Store in-memory + Server-Sent Events para real-time
- Sin DB, sin Mercado Pago real, sin multi-tenant — todo eso es Phase 2

## Cómo correr

```bash
pnpm install
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

Para que el celular se conecte por LAN (necesario para la demo real):
```bash
pnpm dev -H 0.0.0.0
```
Y desde el celu visitar `http://<ip-de-tu-laptop>:3000`. Si la IP no matchea las que están en `next.config.ts → allowedDevOrigins`, agregala.

## Roles del demo

- **Cliente** → `/carta` (sin login, target del QR)
- **Barman** → `/barra` (login: `barman` / `barman`)
- **Cajera/Admin** → `/admin` (login: `admin` / `admin`)

## Más contexto

Toda la arquitectura, modelo de datos, flujo de la demo y convenciones del proyecto en [CLAUDE.md](./CLAUDE.md).
