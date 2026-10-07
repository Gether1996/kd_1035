#!/bin/sh
# Database + uploaded files travel with git (local development only).
#   sh .githooks/dbsync.sh export [--force]  → backend/snapshot/db.sqlite3 + backend/media, staged for commit
#   sh .githooks/dbsync.sh import            → snapshot into the local dev database (old one is backed up)
# Enable the hooks once per clone: git config core.hooksPath .githooks
set -e
cd "$(git rev-parse --show-toplevel)"
export MSYS_NO_PATHCONV=1
COMPOSE="docker compose -f docker-compose.dev.yml"

if ! docker info >/dev/null 2>&1; then
  echo "dbsync: Docker nebeží – spusti Docker Desktop." >&2
  exit 1
fi

manage() {
  if [ -n "$($COMPOSE ps --status running -q worker 2>/dev/null)" ]; then
    $COMPOSE exec -T worker python manage.py "$@"
  else
    $COMPOSE run --rm --no-deps -T worker python manage.py "$@"
  fi
}

case "$1" in
  export)
    shift
    manage export_snapshot "$@"
    git add -A -- backend/snapshot/db.sqlite3 backend/media
    ;;
  import)
    manage import_snapshot
    ;;
  *)
    echo "usage: sh .githooks/dbsync.sh export [--force] | import" >&2
    exit 2
    ;;
esac
