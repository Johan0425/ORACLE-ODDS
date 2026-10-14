# Imagen única para la API y el worker (mismo código, distinto proceso).
# Contexto de build = raíz del monorepo:  docker build -f apps/api/Dockerfile .
#   API:     docker run ... oracle-odds-api            (PROCESS_ROLE=api, por defecto)
#   Worker:  docker run -e PROCESS_ROLE=worker ...      (proceso persistente BullMQ)
FROM node:22-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/probability-engine/package.json packages/probability-engine/package.json
RUN npm ci --workspace apps/api --workspace packages/probability-engine --include-workspace-root
COPY packages/probability-engine packages/probability-engine
COPY apps/api apps/api
RUN npm run build -w packages/probability-engine \
 && npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build -w apps/api \
 && npm prune --omit=dev --workspace apps/api --workspace packages/probability-engine --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /repo
RUN apk add --no-cache openssl tini && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /repo/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/packages/probability-engine/package.json ./packages/probability-engine/package.json
COPY --from=build --chown=app:app /repo/packages/probability-engine/dist ./packages/probability-engine/dist
COPY --from=build --chown=app:app /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=app:app /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=app:app /repo/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:${PORT:-3001}/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "sh", "apps/api/docker-entrypoint.sh"]
