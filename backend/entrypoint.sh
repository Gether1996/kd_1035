#!/bin/sh
set -e

# brand-new database (first start on a new server) – checked before anything creates the file
[ -s "$SQLITE_PATH" ] || FRESH=1

# fresh dev clone: start from the database snapshot in git (no-op in production – not in the image)
python manage.py import_snapshot --if-empty
python manage.py migrate --noinput
# auto-updated guides (commanders, equipment, events) from backend/guides/meta
python manage.py sync_meta_guides
python manage.py ensure_superuser
# the kingdom's events (kingdom/initial_events.json) once on a new server; afterwards they live in the admin
[ -z "$FRESH" ] || python manage.py seed_initial_events

exec "$@"
