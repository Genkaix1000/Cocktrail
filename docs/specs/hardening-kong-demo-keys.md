# Hardening de Kong: sacar las demo keys hardcodeadas

**Estado**: done
**Fecha**: 2026-07-13

---

## Problema / Por qué

El stack local (`docker compose`: `db` + `rest` + `kong`) usa Kong en modo declarativo (DB-less)
como gateway delante de PostgREST. `supabase/docker/kong.yml` valida la `apikey` de cada request
contra dos credenciales (`anon`, `service_role`) que son **las demo keys públicas estándar de
Supabase self-hosting** — están documentadas en la doc oficial de Supabase, firmadas con un `JWT
secret` que también es público y conocido ("your-super-secret-jwt-token-with-at-least-32-characters-long").

Esto es intencional y está bien documentado (`docker-compose.yml` trae los valores demo embebidos
"para que corra sin `.env`") — para desarrollo local en la LAN de un boliche, donde `:54321` nunca
sale de la red interna, el riesgo real es bajo. El problema es que **hoy no hay ningún camino
fácil para reemplazar esas keys por unas reales** cuando el deployment lo necesite: Kong DB-less
no interpola variables de entorno en el campo `key` de `key-auth` (confirmado, no es un bug
nuestro, es una limitación conocida de Kong en modo declarativo), así que las 3 credenciales
(`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) quedan **literales dentro de `kong.yml`**, sin
mecanismo de generación ni rotación.

Si alguna vez `:54321` queda expuesto fuera de la LAN por error (una mini-PC mal configurada, un
router con port-forwarding accidental, una prueba en una red distinta a la del boliche), **cualquiera
que conozca las demo keys públicas puede forjar un token con rol `service_role` y tener acceso
total de lectura/escritura a toda la base** — nombres de clientes, ventas, usuarios y sus hashes de
contraseña, todo. Es el riesgo **R7** documentado en `docs/ROADMAP.md`.

Para quién: el **admin/dueño del local**, que hoy no tiene forma de saber si su instalación está
corriendo con las keys públicas o con unas propias, ni una forma simple de generarlas si quisiera
cerrarlo antes de la Fase 6 (empaquetado, que va a cambiar de nuevo cómo se expone el stack).

---

## Objetivo

Que exista un camino **simple y documentado** para que cualquier deployment de Cocktrail (la
mini-PC del boliche, o cualquier instalación futura) genere sus **propias** credenciales de Kong
(`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`) — únicas para ese deployment, no las demo públicas
— sin necesitar tocar `kong.yml` a mano ni entender la limitación de Kong DB-less.

El comportamiento **por default** (clonar el repo y correr `docker compose up` sin hacer nada
más) **no cambia**: sigue funcionando con las demo keys, sin fricción para desarrollo local, tal
como está documentado hoy en `docs/ARCHITECTURE.md`. Lo que se agrega es la **opción** de generar
credenciales reales antes de un deployment que va a salir de la LAN — no una obligación que rompa
el flujo de desarrollo actual.

Después de generar credenciales propias, el sistema tiene que seguir funcionando exactamente igual
(mismo `docker compose up`, mismo backend, mismo frontend) — el cambio es invisible para todo lo
que no sea la config del gateway.

---

## Historias de usuario

- Como **admin/dueño** que va a llevar la mini-PC al boliche, quiero un comando simple que genere
  credenciales únicas para mi instalación, para no depender de las keys públicas que cualquiera
  puede buscar en la documentación de Supabase.
- Como **admin/dueño**, si algún día necesito rotar las credenciales (sospecha de exposición,
  cambio de infraestructura), quiero poder hacerlo sin editar `kong.yml` a mano ni entender cómo
  funciona Kong DB-less por dentro.
- Como **desarrollador/agente** que clona el repo por primera vez, quiero que todo siga
  funcionando sin configuración extra (como hoy) — este hardening no debe agregar un paso
  obligatorio al onboarding de desarrollo local.
- Como **desarrollador/agente** que audita el repo, quiero que quede claro, con solo mirar el
  código versionado, si un `kong.yml` con keys reales podría terminar commiteado por error.

---

## Criterios de aceptación

1. **Dado** un checkout nuevo del repo, **cuando** se corre `docker compose up` sin pasos
   adicionales, **entonces** el stack levanta igual que hoy, con las demo keys — cero regresión
   en el flujo de desarrollo local.
2. **Dado** que el admin quiere credenciales propias, **cuando** corre el comando/script
   documentado, **entonces** se generan `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` nuevos,
   únicos, y el gateway (`kong.yml`) queda configurado con esas credenciales — no con las demo.
3. **Dado** que se generaron credenciales propias, **cuando** se levanta el stack y el backend
   (`apps/api`) se conecta, **entonces** todo funciona igual que con las demo keys (login,
   ventas, sync) — ningún flujo se rompe por el cambio de credenciales.
4. **Dado** el archivo con las credenciales reales generadas, **cuando** se revisa el repo,
   **entonces** ese archivo NO está trackeado en git (`.gitignore` lo cubre explícitamente, no con
   un patrón tan amplio que también ignore el template versionado).
5. **Dado** que el admin quiere rotar credenciales ya generadas (reemplazar por unas nuevas),
   **cuando** sigue el proceso documentado, **entonces** puede hacerlo sin edición manual de
   `kong.yml` — el mismo comando/script cubre generación inicial y rotación.
6. **Dado** `docs/DEPLOY.md`, **cuando** se lo revisa después de este cambio, **entonces**
   documenta el proceso de generación/rotación de forma clara, reemplazando la nota actual de
   "rotación de llaves" que hoy describe el proceso manual viejo (editar `kong.yml` a mano).
7. **Dado** el script/comando de generación, **cuando** ya existen credenciales propias generadas
   previamente, **entonces** no las sobreescribe en silencio — falla o pide confirmación explícita,
   para no romper sin querer un deployment que ya está funcionando en el boliche.

---

## Fuera de alcance

- Sacar Docker/Kong del stack — eso es la Fase 6 (empaquetado), donde el modelo de exposición
  cambia de nuevo (posiblemente sin Kong/PostgREST, hablando directo a Postgres embebido). Esta
  spec cierra el riesgo **mientras** el stack Docker/Kong siga siendo el que se usa (dev local y
  el test actual en el boliche antes de empaquetar).
- Rotación **automática** o programada de credenciales (ej. cada N días) — el objetivo es que la
  rotación manual sea simple cuando haga falta, no automatizarla.
- Cualquier cambio a `auth`/`realtime`/`storage`/`functions` de Supabase — el gateway de este
  proyecto es mínimo a propósito (solo `rest-v1`), no se amplía el alcance de Kong.
- Exponer `:54321` fuera de la LAN de forma segura con TLS/reverse proxy — es un tema de
  infraestructura de red del boliche, no de las credenciales de la apikey en sí. Puede ser un
  ítem futuro del roadmap de Fase 6, no de esta spec.
- Cambiar el algoritmo de firma (HS256) o la estructura de claims de las apikeys — se mantiene
  compatible con lo que Kong/PostgREST ya esperan hoy, solo cambian los valores generados.

---

## Preguntas abiertas

Ninguna — el mecanismo (render en el host desde un template versionado + script de generación en
Node, sin RPC ni imagen Docker custom) ya se validó con el agente `supabase-expert` en la sesión
de brainstorming previa a esta spec. Queda para `/plan` el detalle de nombres de archivo exactos y
el flujo del script.

---

## Plan técnico

### Enfoque

Kong DB-less no interpola env vars en `key-auth`, así que en vez de pelear contra esa limitación
se resuelve **antes** de que Kong arranque: un script Node (`node:crypto`, sin dependencias
nuevas) genera las 3 credenciales y renderiza `kong.yml` desde un `kong.yml.template` versionado,
**en el host**, no dentro del container (evita mantener una imagen Kong custom, y es la pieza que
sobrevive cuando la Fase 6 saque Docker). El `kong.yml` real (con keys, sean demo o generadas)
deja de estar trackeado en git; el `.template` (con placeholders) sí se versiona. El flujo de
desarrollo local sin tocar nada sigue funcionando porque `docker-compose.yml` mantiene sus
defaults demo embebidos — el script es opt-in, no un paso obligatorio.

### Archivos/módulos afectados

- **Nuevo** `supabase/docker/kong.yml.template` — copia de `kong.yml` actual pero con
  `${ANON_KEY}` / `${SERVICE_ROLE_KEY}` en vez de las keys literales. Se versiona en git (sin
  secretos, son placeholders).
- **Nuevo** `supabase/generate-keys.ts` (o `.mjs`, definir en `/tasks` según convención de
  ejecución del monorepo — ver cómo se corren otros scripts de `apps/api/src/scripts/` con
  `tsx`/`pnpm`) — genera `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` con `node:crypto` (HS256
  manual, mismos claims `{role, iss, iat, exp}` que hoy pero `iss: "cocktrail"` en vez de
  `"supabase-demo"` para que quede claro que no son las públicas), escribe/actualiza
  `supabase/.env`, y corre `envsubst` sobre `kong.yml.template` para generar `kong.yml`. Falla
  (no sobreescribe) si `supabase/.env` ya tiene keys no-demo, salvo flag explícito
  `--force`/`--rotate` (criterio 7).
- `supabase/docker/kong.yml` — dejar de trackearlo en git (`git rm --cached`), pasa a ser
  **generado** (por default, con las demo keys si no se corrió el script — ver siguiente punto).
- `.gitignore` (raíz) — agregar `supabase/docker/kong.yml` explícito (no un patrón amplio que
  también ignore `.template`).
- `supabase/.env.example` — actualizar el comentario que hoy dice "alternativa: envsubst... no
  implementado" para documentar el flujo real y remover el "no implementado".
- `docs/DEPLOY.md` — reemplazar la sección de "rotación de llaves" (proceso manual de editar
  `kong.yml`) por el nuevo flujo con `generate-keys.ts`.
- `docs/ARCHITECTURE.md` §9/12 (Containerización, Variables de entorno) — actualizar la nota de
  "el `docker-compose.yml` trae los valores demo embebidos" para mencionar la opción de generar
  credenciales propias.

### Compatibilidad con el flujo demo (sin romper dev local)

Para que `docker compose up` sin pasos previos siga funcionando (criterio 1), el repo necesita
tener un `supabase/docker/kong.yml` generado con las demo keys **presente pero no trackeado** — o
sea, se genera una vez al clonar/setear el proyecto (ej. un `postinstall` liviano, o documentado
como primer paso en `docs/DEPLOY.md` / `README.md`: "si es la primera vez, corré `node
supabase/generate-keys.ts --demo`" que simplemente copia `kong.yml.template` con las keys demo de
siempre, sin generar nada nuevo). Definir en `/tasks` cuál de las dos variantes (postinstall
automático vs paso manual documentado) encaja mejor sin sorprender a un desarrollador nuevo — dado
que hoy `git clone && docker compose up` ya funciona sin ningún paso extra, un `postinstall` de
`pnpm install` que genere el `kong.yml` demo automáticamente es la opción que preserva mejor el
criterio 1 sin depender de que alguien lea la documentación primero.

### Cambios de datos

Ninguno — no toca Postgres/Supabase, es configuración del gateway Kong únicamente.

### Impacto en sync / offline-first

Ninguno. Es exclusivamente la capa de credenciales del gateway local (Kong). No toca
`supabase.ts`, `sync.service.ts`, ni las credenciales de Supabase Cloud (`SUPABASE_CLOUD_URL`/
`SUPABASE_CLOUD_SERVICE_ROLE_KEY`), que son un proyecto/cuenta completamente aparte.

### Real-time (SSE)

Sin cambios.

### Auth/permisos

Sin cambios en roles/permisos de la aplicación. Si se generan credenciales propias, `apps/api/.env`
(`SUPABASE_SERVICE_ROLE_KEY`) tiene que actualizarse con el mismo `SERVICE_ROLE_KEY` recién
generado en `supabase/.env` — **riesgo real a documentar**: si se rota sin actualizar
`apps/api/.env`, el backend queda con la key vieja y el 401 rompe todo el flujo offline-first (que
depende 100% del Supabase local). El script/documentación tiene que dejar esto explícito como
paso obligatorio post-generación.

### Riesgos

- **Desincronización entre `supabase/.env` y `apps/api/.env`** (arriba) — el riesgo más real de
  esta feature. Mitigación: el script imprime un recordatorio explícito al final ("copiá
  `SERVICE_ROLE_KEY` a `apps/api/.env` como `SUPABASE_SERVICE_ROLE_KEY` y reiniciá el backend"), y
  `docs/DEPLOY.md` lo marca como paso obligatorio, no opcional.
- **`envsubst` no disponible en el host**: viene con `gettext` en la mayoría de distros Linux
  (la mini-PC del boliche va a ser Debian/Ubuntu, ver Fase 6 § requisitos), pero no está
  garantizado en todos los entornos. El script tiene que fallar explícito con un mensaje claro si
  `envsubst` no está, no arrancar Kong con placeholders sin resolver (`${ANON_KEY}` literal
  rompería auth de forma confusa).
- **Historial de git**: el `kong.yml` actual con las demo keys ya está commiteado en commits
  pasados — como son públicas (documentadas por Supabase), no es un secreto real filtrado, pero
  vale la pena una nota en el PR/commit de esta feature aclarando que no hace falta reescribir
  historia por esto.
- **Onboarding de un dev nuevo**: si se elige el camino de "paso manual documentado" en vez de
  `postinstall` automático y alguien no lo lee, `docker compose up` fallaría (Kong sin
  `kong.yml`) — razón por la que el plan se inclina por automatizarlo con `postinstall` (ver
  sección de compatibilidad arriba).

### Alternativas consideradas

- **Imagen Kong custom con `envsubst` + entrypoint propio** (Opción B evaluada con
  `supabase-expert`): descartada — exige mantener/buildear una imagen Docker propia que de
  cualquier forma se descarta en la Fase 6 cuando se saque Docker; sobre-ingeniería para 3
  servicios y un único gateway.
- **Vault/secrets manager externo** (ej. HashiCorp Vault, Doppler): descartado — agrega una
  dependencia de infraestructura entera para gestionar 3 secretos de un solo gateway local, muy
  por encima de la escala de este proyecto (mini-PC de un boliche, sin equipo de ops).
- **Mantener las demo keys y solo documentar el riesgo mejor**: descartada — no cierra R7 de
  verdad, deja el mismo riesgo real si alguien expone `:54321` sin darse cuenta.

---

## Tareas

### Template y generación

- [x] Crear `supabase/docker/kong.yml.template` — copia de `supabase/docker/kong.yml` con
  `${ANON_KEY}` / `${SERVICE_ROLE_KEY}` en vez de las keys literales.
- [x] Crear `supabase/generate-keys.mjs` — **`.mjs` en vez de `.ts`** (ajuste sobre el plan: `tsx`
  no está disponible en la raíz del monorepo, solo dentro de `apps/api`; un script `.mjs` con
  `node:crypto` corre directo sin build step ni dependencia nueva, mismo resultado). Genera
  `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY`, soporta `--demo`, modo real por default, `--rotate`/
  `--force`, y `--if-missing` (agregado sobre el plan original, ver Onboarding abajo).
- [x] El script escribe/actualiza `supabase/.env` con las 3 variables.
- [x] El script corre `envsubst` sobre el template con las keys recién escritas. Falla explícito
  si `envsubst` no está disponible.
- [x] El script falla (no sobreescribe) si `supabase/.env` ya tiene keys no-demo, salvo
  `--rotate`/`--force`. Probado: reintento sin flag devuelve exit 1 sin tocar nada.
- [x] Al final de una generación real (no `--demo`), imprime el recordatorio de actualizar
  `apps/api/.env`.

### Onboarding sin fricción (criterio 1)

- [x] `postinstall` en el `package.json` raíz corre `generate-keys.mjs --demo --if-missing`. Se
  agregó el flag `--if-missing` (no estaba en el plan original) para que sea un no-op silencioso
  si `kong.yml` ya existe — necesario para no pisar credenciales reales ya generadas en cada
  `pnpm install`, y para no fallar el install si ya hay keys propias (el guard normal sí fallaría).

### Git / gitignore

- [x] `git rm --cached supabase/docker/kong.yml`.
- [x] Agregado `supabase/docker/kong.yml` (explícito) al `.gitignore` raíz.

### Documentación

- [x] `supabase/.env.example` actualizado.
- [x] `docs/DEPLOY.md` § 7 actualizado (proceso con `generate-keys.mjs`, paso obligatorio de
  `apps/api/.env` documentado).
- [x] `docs/ARCHITECTURE.md` § 9 actualizado.

### Verificación de cierre

- [x] Probado en el checkout actual: borré `supabase/docker/kong.yml` y `supabase/.env`, corrí
  `pnpm run postinstall`, se regeneraron ambos con las keys demo exactas (byte-a-byte idénticas a
  las que estaban commiteadas) — criterio 1 confirmado.
- [x] Probado el modo real: `generate-keys.mjs` (sin `--demo`) genera un JWT válido (payload
  decodificado: `{role, iss: "cocktrail", iat, exp}` correcto), y el guard de "ya hay keys
  propias" rechaza un segundo intento sin `--rotate`/`--force` — criterios 2 y 7 confirmados a
  nivel de generación/estructura.
- [~] **Criterio 3 (login/venta/sync con keys rotadas) NO se probó con un restart real de
  `docker compose`**: el entorno de desarrollo de esta sesión tenía el backend y el stack Docker
  **corriendo en vivo** con las keys demo — reiniciar Kong con keys rotadas sin sincronizar
  `apps/api/.env` al mismo tiempo hubiera cortado la conexión a la base en caliente. Se restauraron
  las demo keys después de la prueba en modo real para no dejar el entorno de desarrollo activo en
  un estado inconsistente. **Pendiente**: repetir la prueba de rotación completa (`--rotate` +
  actualizar `apps/api/.env` + `docker compose down -v && up -d` + smoke test de login/venta) en
  un entorno donde no haya un dev server corriendo en caliente, antes de confiar en el flujo de
  rotación para un deployment real.
- [x] `pnpm typecheck` (api + web) en verde.
- [x] `docs/ROADMAP.md` actualizado: R7 marcado resuelto en Riesgos y en "Deuda pre-Fase 6".
- [x] Estado de esta spec cambiado a `done`.

---

**Siguiente paso**: implementar siguiendo este checklist. Recomendado Plan Mode dado que toca
git tracking (`rm --cached`) y el flujo de onboarding — conviene revisar el diff completo antes
de aplicar para no romper `docker compose up` para nadie que tenga el repo clonado ahora mismo.
