# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Última actualización: 2026-06-30.

---

## Fase actual — MVP local-first para el boliche de prueba

**Objetivo**: que el sistema funcione completo en una máquina local del boliche (mini-PC/laptop),
sin depender de internet, con caja + barra + pedido por LAN, y reconciliación a la nube al cerrar la noche.

### Ya construido
- [x] Monorepo pnpm (`apps/api` Express + `apps/web` Next.js 16 + `packages/shared`).
- [x] Persistencia en **Supabase local** (Postgres) como fuente de verdad.
- [x] **Sync local → cloud** al cerrar la noche + reintento de pendientes al bootear.
- [x] **Pull de datos maestros** cloud → local (users, drinks).
- [x] Operación **offline-first** (si no hay nube, todo sigue funcionando).
- [x] **Boot autocurativo** (levanta `supabase start` / `docker compose` solo).
- [x] **Auto-cierre por día calendario** (zona AR).
- [x] 3 roles (`admin/caja/barman`) con permisos granulares + captcha + rate limiting.
- [x] **Mercado Pago real** (Point/Posnet físico).
- [x] Real-time por SSE (KDS barra, ticket cliente, totales admin).
- [x] Tickets con código HMAC + canje (escáner o manual).
- [x] Audit logs.

### Pendiente de esta fase
- [ ] **Documentación consolidada** (este commit): `docs/ARCHITECTURE.md` + `ROADMAP.md`, `CLAUDE.md` reescrito, `AGENTS.md`, README. *(en progreso)*
- [x] **Limpieza de código muerto**: borrados los repos `LocalJSON*` / `InMemory*` (~397 líneas) y los `apps/api/src/data/*.json`. Verificado: `app.ts` solo usa `Supabase*Repository`, sin tests afectados, `pnpm typecheck` pasa. Se conservaron `SEED_DRINKS` (lo usa `sync`), `hashPassword` y `DEFAULT_CONFIG`.
- [x] **Resuelto el mismatch de `docker-compose.yml`** (R1): ahora levanta un stack Supabase mínimo (db + PostgREST + Kong) que expone la REST en `:54321`. Verificado con curl. Ver `docs/DEPLOY.md`.
- [ ] **Migración faltante**: la columna `night_events.totals` que usa el sync no está en las migraciones locales. Agregarla o documentar que es cloud-only.
- [ ] **Guía de despliegue en la mini-PC**: `docs/DEPLOY.md` con pasos reproducibles (instalar Docker/Supabase CLI, env, arranque, acceso por LAN, generación del QR).
- [ ] **Activar el sync cloud** (la lógica ya existe en `sync.service.ts`; falta config): el usuario YA tiene proyecto en supabase.com. Pasos: (1) asegurar que el esquema cloud matchea las migraciones + la columna `night_events.totals` (R2); (2) setear `SUPABASE_CLOUD_URL` + `SUPABASE_CLOUD_SERVICE_ROLE_KEY` en `apps/api/.env`; (3) probar un cierre de noche con internet y confirmar el push. Diferido a pedido del usuario.
- [ ] **Verificación E2E del flujo demo** completo (carta → ticket → barra → entregado → caja efectivo → cerrar noche → sync).
- [ ] **Tests**: smoke/E2E con Playwright de los 4 flujos (cliente, barra, caja, admin).
- [ ] Revisar **atomicidad del canje de ticket** (evitar doble canje bajo concurrencia).

---

## Fase 1 — Tickets + impresora térmica 🖨️

**Objetivo**: cuando se vende un trago en caja, imprimir un ticket físico (POS 58mm) para que el
cliente lo retire en la barra. El dueño ya compró la impresora térmica.

- [ ] Integrar impresora térmica POS 58mm (protocolo ESC/POS; conexión USB/serie/red según el modelo).
- [ ] Imprimir el ticket al confirmar la venta en caja (reusar el mismo código HMAC que el ticket digital).
- [ ] Manejo de errores de impresión (sin papel / desconectada) sin frenar la venta.
- [ ] Config de impresora en `/admin` (seleccionar dispositivo + test de impresión).

---

## Fase 2 — Pulir UI de caja ⚡

**Objetivo**: que la pantalla de caja sea más rápida y dinámica para el ritmo real de una barra
(menos clicks, cobro más ágil), antes de empaquetar y llevar al boliche.

- [ ] Revisar el flujo de cobro: atajos de teclado, montos/medios de pago rápidos, menos pasos.
- [ ] Bajar la latencia percibida en la operación de caja.
- [ ] Detallar el resto con el uso real en el boliche (test en LAN, sin empaquetar todavía).

---

## Fase 3 — Empaquetado y producto 📦

**Objetivo**: que el dueño abra la app con **doble-click**, sin instalar Docker ni Node ni levantar
nada a mano.

> 🔑 **Decisión clave (bloqueante del empaquetado): sacar Docker.**
> Hoy el stack corre con `docker compose` (Postgres + PostgREST + Kong). **Node sí se puede *embeber***
> en el ejecutable (Node SEA / Tauri / Electron), pero **Docker NO se empaqueta**. Para el doble-click
> hay que reemplazar el Docker por un **Postgres embebido**: un binario que la app arranca sola
> (p.ej. `embedded-postgres`) o un shell **Tauri/Electron** con Postgres como *sidecar*.
>
> **Implicancia**: en modo empaquetado, **Kong + PostgREST + las demo keys pasan a ser descartables**
> (solo emulan la "puerta apikey" de Supabase cloud); localmente se le habla a Postgres directo. El
> stack Docker actual sigue sirviendo para el test en LAN ahora y para que el esquema cloud matchee.
>
> **Ojo**: para *probar en el boliche* NO hace falta esperar al empaquetado — se hace setup una sola
> vez en la mini-PC y todos entran por navegador a la IP de la LAN. El empaquetado es para el producto.

- [ ] Elegir shell de empaquetado (Tauri vs Electron vs Node SEA + binarios).
- [ ] **App "doble-click"** = Node embebido + Postgres embebido (sin Docker).
- [ ] Integrar la impresora térmica (Fase 1) dentro del paquete.
- [ ] Multi-tenant (slug por boliche) + RLS en Supabase.

---

## Fase 4 — Pedido online "en la web" 🌐 *(lo último de lo último)*

**Objetivo**: que el cliente pueda pedir desde internet (fuera de la LAN del local), reciba su ticket
online, y ese pedido aparezca en la barra local y se reconcilie al cerrar la caja.

- [ ] Definir el path cloud del pedido online (¿se sirve `/carta` + `/pedido/[token]` desde la nube?).
- [ ] **Sync bidireccional**: pedidos creados en la nube → bajan a la barra local (hoy el sync sube; falta el camino inverso para órdenes online).
- [ ] Auth de la zona cloud (las cookies HMAC LAN no sirven cross-origin contra un host cloud).
- [ ] Reconciliación de tragos online al **cerrar la caja** (juntar lo online con lo presencial en el resumen de la noche).
- [ ] Mercado Pago **online** (Checkout Pro / QR / Bricks) además del Point físico — usar el plugin oficial de MP (ver `docs/AGENTS.md`).

---

## Backlog / más adelante

- [ ] Métricas avanzadas (hora pico, ticket promedio).
- [ ] Edición de carta avanzada, fidelidad/puntos, propinas.

---

## Riesgos / deuda técnica conocida

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R1 | `docker-compose.yml` levantaba Postgres pelado en `:54321`, pero el cliente espera la REST de Supabase ahí. | El arranque sin Supabase CLI no funcionaba. | ✅ Resuelto (2026-06-30) — stack db+PostgREST+Kong |
| R2 | `night_events.totals` no está en migraciones locales (solo cloud). | El push de totales asume schema cloud. | Abierto |
| R3 | Canje de ticket podría no ser atómico (read-check-write). | Doble canje bajo concurrencia. | A verificar |
| R4 | Código muerto (`data/*.json`, repos `LocalJSON/InMemory`). | Confunde, sugiere persistencia que no se usa. | ✅ Resuelto (2026-06-30) |
| R5 | Credencial `cajavip/cajavip` hardcodeada en `auth.service.ts`. | Acceso no documentado. | A revisar |
| R6 | `next-env.d.ts` y `apps/api/src/data/*.json` aparecen como modificados en runtime. | Ruido en git. | Considerar `.gitignore` |
| R7 | `supabase/docker/kong.yml` usa las **demo keys públicas** de Supabase (JWT secret demo incluido), hardcodeadas. Kong DB-less **no** interpola env vars en el campo `key` de key-auth (ni `${{}}` de decK ni vault refs), así que no se pueden mover a `.env`. | Para LAN aceptable; si se expone `:54321` a internet = takeover de la DB (secret público). | Abierto — rotar las 3 llaves + JWT_SECRET antes de exponer fuera de LAN; alternativa: render con `envsubst` (la imagen de Kong no lo trae). |

---

## Cómo trabajamos (SDD nativo)

Para features nuevas usamos **Spec-Driven Development nativo** (sin herramientas externas):
1. `brainstorming` (skill) para explorar el intent.
2. `/spec` → escribe la spec en `docs/specs/<feature>.md` (el *qué* y el *por qué*).
3. `/plan` → plan técnico sobre esa spec.
4. `/tasks` → checklist accionable.
5. Implementar (Plan Mode de Claude Code para los cambios grandes).

Ver `docs/specs/README.md` y los comandos en `.claude/commands/`.
