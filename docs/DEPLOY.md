# Despliegue en la PC del boliche — Cocktrail / BarQR

Guía reproducible para dejar el sistema corriendo en una mini-PC o laptop del
local, **sin depender de internet**. La base de datos corre como un stack
Supabase local mínimo en Docker; la app (API + web) corre con Node/pnpm.

> Resuelve el riesgo **R1** del [ROADMAP](./ROADMAP.md): antes el `docker-compose.yml`
> levantaba Postgres pelado y el backend no encontraba la REST de Supabase.
> Ahora `docker compose up -d` expone la REST de Supabase en
> `http://127.0.0.1:54321`, que es exactamente lo que usa `@supabase/supabase-js`.

---

## 1. Requisitos

- **Docker Engine + Docker Compose v2** (`docker compose version` debe responder).
- **Node 20+** y **pnpm** (`corepack enable` alcanza para tener pnpm).
- ~2 GB de disco para las imágenes de Docker la primera vez.

No hace falta la Supabase CLI: el stack de `docker-compose.yml` ya trae
Postgres + PostgREST + Kong recortados.

---

## 2. Qué levanta el stack de base de datos

`docker-compose.yml` (en la raíz) define un Supabase **mínimo**:

| Servicio | Imagen | Para qué |
|---|---|---|
| `db`   | `supabase/postgres:17.6.1.136` | Postgres con los roles de Supabase (`anon`, `authenticated`, `service_role`, `authenticator`) y extensiones. **Fuente de verdad local.** |
| `rest` | `postgrest/postgrest:v14.12`   | PostgREST: convierte las tablas en la API REST que consume `supabase-js`. |
| `kong` | `kong/kong:3.9.1`              | Gateway: enruta `/rest/v1/*` → PostgREST y valida la `apikey`. **Escucha en el puerto 54321.** |
| `meta` + `studio` (perfil `debug`) | `postgres-meta` + `studio` | UI web opcional para inspeccionar la base. |

**No** incluye auth/gotrue, realtime, storage ni edge-functions: el backend no
los usa (la auth es cookie HMAC propia y el real-time es SSE propio).

Las migraciones de `supabase/migrations/*.sql` se aplican **en el primer
arranque** (montadas en el initdb del Postgres, después de los roles).

---

## 3. Levantar la base de datos

```bash
cd /ruta/al/repo

# Arranque (descarga imágenes la primera vez, ~1-2 min):
docker compose up -d

# Esperar a que estén sanos:
docker compose ps
# db, rest y kong deben figurar "healthy".
```

### Verificación rápida (la REST responde como service_role)

```bash
SVC="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.4HviqYnTKiRK-RJvWzgAAuaFiq8--foTrXQpl7HYMU4"

curl -s -H "apikey: $SVC" -H "Authorization: Bearer $SVC" \
  "http://127.0.0.1:54321/rest/v1/drinks?select=id&limit=1"
# Esperado: []  (array vacío = tabla existe y es accesible). Sin apikey da HTTP 401.
```

> El stack corre con valores por defecto embebidos: **no hace falta `.env`** para
> que la base levante. Para overridear puertos/llaves ver §7.

---

## 4. Configurar y arrancar la app

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

En `apps/api/.env`, lo importante para conectar a la base:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.4HviqYnTKiRK-RJvWzgAAuaFiq8--foTrXQpl7HYMU4
```

Esta `SERVICE_ROLE_KEY` **debe ser idéntica** a la de `supabase/.env.example`
y a las `key:` de `supabase/docker/kong.yml` (todas firmadas con el mismo JWT
secret local). Si no matchean, PostgREST devuelve `401 / PGRST301`.

> Para el sync a la nube (opcional) completá `SUPABASE_CLOUD_URL` y
> `SUPABASE_CLOUD_SERVICE_ROLE_KEY`. Si quedan vacías, todo funciona offline y
> el sync se saltea sin romper.

Arranque:

```bash
# Desarrollo / demo:
pnpm dev            # api (:3001) + web (:3000), web ya escucha en 0.0.0.0 (LAN)

# Producción liviana:
pnpm build && pnpm --filter cocktrail-api start   # API
pnpm --filter cocktrail-app start -H 0.0.0.0      # web por LAN
```

---

## 5. Acceso por LAN (el celular del cliente)

1. Averiguá la IP LAN de la PC (`ip addr` / `hostname -I`), ej. `192.168.0.50`.
2. Si esa IP no está en `apps/web/next.config.ts → allowedDevOrigins`, agregala.
3. Generá un QR apuntando a `http://192.168.0.50:3000/carta`.
4. El cliente escanea, pide, y el flujo barra/caja/admin corre en la laptop.

---

## 6. Reset / limpieza

```bash
# Parar sin borrar datos:
docker compose stop

# Parar y borrar contenedores (los datos del volumen se conservan):
docker compose down

# Borrar TODO, incluida la base (vuelve a aplicar migraciones al próximo up):
docker compose down -v

# UI de debug (Studio en http://localhost:54323):
docker compose --profile debug up -d
```

> `down -v` elimina el volumen `cocktrail_db_data`. Las migraciones se
> reaplican desde cero en el siguiente `docker compose up -d`.

---

## 7. Overrides y rotación de llaves (opcional)

Defaults embebidos en el compose (sirven tal cual para LAN del local):

| Variable | Default | Qué es |
|---|---|---|
| `POSTGRES_PASSWORD` | `postgres` | Password de Postgres |
| `JWT_SECRET` | `your-super-secret-jwt-token-with-at-least-32-characters-long` | Secret que firma las apikeys |
| `KONG_HTTP_PORT` | `54321` | Puerto host de la REST (lo que usa el backend) |
| `POSTGRES_EXTERNAL_PORT` | `54322` | Puerto host de Postgres directo (psql/debug) |
| `STUDIO_PORT` | `54323` | Puerto host de Studio (perfil `debug`) |

Para overridear: `cp supabase/.env.example supabase/.env`, editá, y corré con
`docker compose --env-file supabase/.env up -d`.

**Rotar el JWT secret** (recomendado si esto algún día sale de la LAN):

1. Elegí un secret nuevo (`openssl rand -hex 32`).
2. Regenerá las apikeys `anon` y `service_role` firmadas con ese secret
   (cualquier generador JWT HS256; payload `{"role":"...","iss":"supabase-demo","iat":...,"exp":...}`).
3. Actualizá las 3 llaves en: `supabase/docker/kong.yml`, `supabase/.env`
   (o el compose) y `apps/api/.env` (`SUPABASE_SERVICE_ROLE_KEY`).
4. `docker compose down -v && docker compose up -d` (recrea con el secret nuevo).

---

## 8. Las 3 llaves locales (demo)

| Llave | Valor |
|---|---|
| **JWT secret** | `your-super-secret-jwt-token-with-at-least-32-characters-long` |
| **anon** | `...zQomPPgIVgwVRMh3NJhhAl2cJ-GKQgNXpMTbIKxKyoo` (rol `anon`) |
| **service_role** | `...4HviqYnTKiRK-RJvWzgAAuaFiq8--foTrXQpl7HYMU4` (rol `service_role`, la que usa el backend) |

Valores completos en `supabase/.env.example`. Son llaves **de desarrollo local**:
sirven para la LAN del boliche. No exponer la `service_role` a un cliente público.

---

## 9. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `HTTP 401` con apikey | la `service_role` no matchea el `JWT_SECRET` | Asegurá que las 3 llaves usen el mismo secret (§7) |
| `PGRST301 / No suitable key` | idem anterior | idem |
| `kong` no arranca | puerto `54321` ocupado | `docker ps` para ver quién lo usa; o cambiá `KONG_HTTP_PORT` |
| tablas no existen | volumen viejo de un esquema anterior | `docker compose down -v && docker compose up -d` |
| nueva migración no se aplica | falta montarla en el compose | agregá una línea `14-...sql` en el `db.volumes` (ver comentario ahí) |

> **Nota (R2):** la columna `night_events.totals` que usa el sync **no** está en
> las migraciones locales (es cloud-only). El stack local funciona igual; el push
> de totales asume el esquema de la nube.
