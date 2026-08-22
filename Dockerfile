# Imagen única con los dos procesos: la API (Express, puerto interno) y la web
# (Next standalone, puerto público). El navegador solo habla con Next, que
# reenvía /api a localhost — la misma topología que en desarrollo.
#
# Un solo servicio a propósito: cookies de sesión, SSE y el EventEmitter in-process
# no bancan dos contenedores sin rediseño.
#
# Deploy canónico en Render: runtime Node vía render.yaml (no esta imagen).
# El Dockerfile queda para otro host o para reproducir prod en local.
#
# Node 24: la API importa @cocktrail/shared, que expone TypeScript directo
# (packages/shared/package.json → exports: ./src/domain.ts). Node lo carga con
# type stripping nativo, disponible desde 22.18/24.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /repo

# ---------- build ----------
FROM base AS build

# NEXT_PUBLIC_* se inlinean en el build de Next; Koyeb inyecta env del service
# como build-args si están declarados como ARG.
ARG NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# --ignore-scripts: el postinstall de la raíz genera claves demo de Supabase,
# que no van en una imagen de producción.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter cocktrail-api build
# Next standalone: trae su propio node_modules mínimo.
RUN pnpm --filter cocktrail-app build

# node_modules de producción de la API, sin symlinks de workspace
# (inyecta @cocktrail/shared adentro).
RUN pnpm --filter cocktrail-api deploy --prod --legacy /prod/api

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

# API: dist + node_modules de producción.
COPY --from=build /prod/api/node_modules ./apps/api/node_modules
COPY --from=build /prod/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist

# @cocktrail/shared expone TypeScript directo y Node se niega a hacer type
# stripping de archivos que viven DENTRO de node_modules. Por eso el paquete va
# a su lugar del monorepo y en node_modules queda un symlink: Node resuelve el
# path real (fuera de node_modules) y lo carga sin chistar, igual que en el repo.
COPY --from=build /repo/packages/shared ./packages/shared
RUN rm -rf ./apps/api/node_modules/@cocktrail/shared \
    && mkdir -p ./apps/api/node_modules/@cocktrail \
    && ln -s /app/packages/shared ./apps/api/node_modules/@cocktrail/shared

# Las migraciones se resuelven relativas a dist/ (server.ts:106
# "../../../supabase/migrations"), así que la ruta tiene que quedar igual que
# en el repo: /app/apps/api/dist → /app/supabase/migrations.
COPY --from=build /repo/supabase/migrations ./supabase/migrations

# Web: el standalone ya viene con la estructura del monorepo adentro.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

COPY --from=build /repo/scripts/start-cloud.mjs ./scripts/start-cloud.mjs

# El host inyecta PORT; Next escucha ahí y la API queda solo hacia adentro.
ENV API_PORT=3001
ENV API_PROXY_TARGET=http://127.0.0.1:3001
EXPOSE 10000

USER node
CMD ["node", "scripts/start-cloud.mjs"]
