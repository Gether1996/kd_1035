#!/bin/sh
set -e

# fresh dev clone: start from the database snapshot in git (no-op in production – not in the image)
python manage.py import_snapshot --if-empty
python manage.py migrate --noinput
python manage.py ensure_superuser

exec "$@"
