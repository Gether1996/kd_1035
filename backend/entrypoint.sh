#!/bin/sh
set -e

# fresh dev clone: start from the database snapshot in git (no-op in production – not in the image)
python manage.py import_snapshot --if-empty
python manage.py migrate --noinput
# auto-updated guides (commanders, equipment, events) from backend/guides/meta
python manage.py sync_meta_guides
python manage.py ensure_superuser

exec "$@"
