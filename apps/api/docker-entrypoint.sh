#!/bin/sh
set -e
cd /repo/apps/api
case "${PROCESS_ROLE:-api}" in
  worker)
    # El worker no aplica migraciones: lo hace la API (un solo proceso las ejecuta).
    exec node dist/worker.js
    ;;
  job)
    exec node dist/scripts/run-job.js "$@"
    ;;
  *)
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" node ../../node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma
    fi
    exec node dist/main.js
    ;;
esac
