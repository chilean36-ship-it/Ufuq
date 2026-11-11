#!/usr/bin/env bash
# Level system regression test: loads a small copy of the live schema into a THROW-AWAY local Postgres, applies the level
# migration on top and runs test/sql/level_system.test.sql. It never talks to the real Supabase project.
#   npm run test:sql                 (needs PostgreSQL server binaries: initdb / pg_ctl, e.g. the "postgresql" package)
#   PG_BIN=/usr/lib/postgresql/16/bin npm run test:sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PG_BIN="${PG_BIN:-}"
if [ -z "$PG_BIN" ]; then
  if command -v initdb >/dev/null 2>&1; then PG_BIN="$(dirname "$(command -v initdb)")"
  else PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"; fi
fi
if [ -z "$PG_BIN" ] || [ ! -x "$PG_BIN/initdb" ]; then
  echo "test:sql skipped - PostgreSQL server binaries (initdb) not found. Install postgresql or set PG_BIN." >&2
  exit "${REQUIRE_PG:-0}"
fi

WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54391}"
RUN=(bash -c)
if [ "$(id -u)" = "0" ]; then            # Postgres refuses to run as root: use the postgres account
  chmod 755 "$WORK"; chown postgres "$WORK"
  RUN=(su postgres -s /bin/bash -c)
fi
cleanup() { "${RUN[@]}" "'$PG_BIN/pg_ctl' -D '$WORK/data' -m immediate stop >/dev/null 2>&1" || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "'$PG_BIN/initdb' -D '$WORK/data' -A trust -U postgres >/dev/null"
"${RUN[@]}" "'$PG_BIN/pg_ctl' -D '$WORK/data' -o \"-p $PORT -k '$WORK' -c listen_addresses=''\" -l '$WORK/log' -w start >/dev/null"

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/test/sql/level_system_baseline.sql" >/dev/null
MIGRATION="${MIGRATION_FILE:-$ROOT/supabase/migrations/20261201_level_groups_lifecycle.sql}"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null          # a migration must be safe to run twice
"${PSQL[@]}" -f "$ROOT/test/sql/level_system.test.sql" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  //'
