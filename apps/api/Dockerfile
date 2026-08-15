# Contexto de build = raíz del monorepo (Render: Root Directory ".", Dockerfile Path
# "apps/api/Dockerfile") — necesario porque apps/api depende del workspace
# @oracle-odds/probability-engine, no se puede buildear apps/api de forma aislada.
FROM node:22-alpine AS base
WORKDIR /repo

# Alpine no trae openssl por defecto; sin él, Prisma no detecta la versión de
# libssl y puede resolver el engine binary equivocado en runtime (no solo warning de build).
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/probability-engine/package.json packages/probability-engine/package.json
RUN npm ci

COPY packages/probability-engine packages/probability-engine
COPY apps/api apps/api

RUN npm run build -w packages/probability-engine
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build -w apps/api

ENV NODE_ENV=production
EXPOSE 3001

# migrate deploy corre en cada arranque: aplica migraciones pendientes contra la
# Postgres real (Neon) antes de levantar el servidor. Es idempotente si ya están aplicadas.
CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
