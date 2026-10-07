#!/bin/sh
# Worker entrypoint (production). Starts as root only to make the bind-mounted backup
# folder writable, then drops to the same `app` user that owns the database.
set -e
mkdir -p "$BACKUP_DIR"
chown app:app "$BACKUP_DIR" 2>/dev/null || true
exec setpriv --reuid=app --regid=app --init-groups python manage.py run_worker
