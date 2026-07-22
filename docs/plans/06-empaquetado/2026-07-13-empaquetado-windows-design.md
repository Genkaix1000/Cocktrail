# Diseño validado — Empaquetado Fase 6 (Windows, sin Docker)

**Fecha**: 2026-07-13
**Contexto**: primera prueba de empaquetado del ROADMAP Fase 6, en una compu Windows 10 que
va a funcionar como servidor único de un boliche. El acceso completo (Admin + Caja) se hace
desde una tablet por navegador vía LAN. Docker no se empaqueta (decisión ya tomada en el
ROADMAP); este documento define el reemplazo concreto.

## Alcance de esta ronda

- **Adentro**: Postgres embebido + PostgREST embebido (sin Kong, sin Docker) para Windows,
  auto-arranque al prender la compu, pantallas **Admin** y **Caja** funcionando de punta a
  punta incluyendo **cobro real con Posnet Mercado Pago** e **impresión térmica real**, acceso
  desde la tablet vía hostname `bosko.local` (mDNS) con ícono instalable (PWA).
- **Afuera**: Barra y Carta quedan **ocultas** (código intacto, sin entrypoint visible) hasta
  la próxima fase. Instalador gráfico (.exe/.msi) — se usa carpeta portable + `.bat` en su
  lugar. Shell de escritorio (Electron/Tauri) — no hace falta, todo se usa por navegador.
  `docker-compose.yml` no se toca, sigue siendo el flujo de desarrollo local.

## Arquitectura

- **Postgres embebido**: paquete `embedded-postgres` (binarios zonky.io, incluye Windows x64),
  levantado como proceso hijo del server con `data dir` propio dentro de la carpeta portable.
  Reemplaza el contenedor `db`.
- **PostgREST embebido**: binario oficial `postgrest.exe` (release de GitHub) bundleado junto
  a las DLLs de `libpq` (las trae `embedded-postgres`, hay que sumarlas al `PATH` del proceso
  hijo). Reemplaza el contenedor `rest`.
- **Kong se elimina** del modo empaquetado: `SUPABASE_URL` apunta directo a PostgREST
  (ej. `http://127.0.0.1:5433`). PostgREST no valida `apikey` — eso lo hacía Kong — así que
  **ningún `Supabase*Repository` cambia una línea**.
- **Orquestador de arranque** (script Node, ej. `apps/api/src/packaging/start.mjs`): levanta
  Postgres embebido → espera healthy → corre migraciones SQL si `pgdata` está vacío (primera
  vez, mismo set de `supabase/migrations/*.sql` que hoy corre `docker-entrypoint-initdb.d`) →
  levanta `postgrest.exe` → levanta `apps/api` (Express) → levanta `apps/web` con `next start`
  (build de producción, no `next dev`).
- **Node runtime portable**: build oficial `node-vX.Y.Z-win-x64.zip` bundleada en la carpeta;
  todo corre con ese `node.exe`, sin depender de un Node instalado en el sistema.
- **Auto-arranque en Windows**: Tarea Programada (`schtasks`) registrada por el `.bat` de
  instalación, disparada "al iniciar sesión" o "al arrancar el sistema" — corre el orquestador
  en background sin que nadie tenga que abrir nada a mano.

## Acceso desde la tablet

- **Hostname en vez de IP**: un único hostname `bosko.local` (mDNS, librería tipo
  `bonjour-service` corriendo dentro del mismo proceso del server) + los paths que ya existen
  (`bosko.local/admin`, `bosko.local/caja`). Los tablets Android/iOS resuelven `.local`
  nativamente, sin tocar el router. Respaldo: IP fija por reserva DHCP en el router.
- **Ícono tipo app (PWA)**: `manifest.json` + íconos con el branding Bosko en `apps/web`,
  `display: "standalone"`. "Agregar a pantalla de inicio" en la tablet deja un ícono que abre a
  pantalla completa sin barra de direcciones. Dos accesos instalables: Admin y Caja.
- **Barra/Carta ocultas**: sin link visible en ningún lado y sin acceso directo instalable —
  flag simple a nivel de layout/rutas, no un borrado de funcionalidad.

## Riesgos conocidos a validar en la spec/implementación

- Posnet Mercado Pago requiere que esa compu Windows tenga salida a internet real (Point habla
  con la API de MP) — no es un riesgo del empaquetado en sí, pero condiciona la prueba.
- Impresora térmica: confirmar que el driver/puerto (USB/red) que usa hoy el módulo `printer`
  es accesible igual desde un proceso Node corriendo por Tarea Programada (algunas tareas
  programadas corren en una sesión sin acceso a dispositivos de usuario si se configuran mal).
- Primer arranque (migraciones + inicialización de `pgdata`) puede tardar; UX de "esperá unos
  segundos" a definir.
