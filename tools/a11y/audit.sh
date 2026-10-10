#!/usr/bin/env bash
# Accessibility audit (axe, WCAG 2.1 A/AA) of the running dev site (docker compose -f docker-compose.dev.yml up)
#   tools/a11y/audit.sh [--player | --superuser] [NAME=value …]
#   e.g. tools/a11y/audit.sh                                   every public page at 360 and 1280 + dialog, finder, menu
#        tools/a11y/audit.sh --player                          also /ucet and /pripomienky
#        tools/a11y/audit.sh PAGES=/kalendar SIZES=360x780
# NAME=value pairs are the variables described in audit.mjs (PAGES, SIZES, STATES, SESSION…).
# Exits 1 when any critical or serious violation exists. Full JSON results → tools/a11y/out/ (git-ignored).
# --player / --superuser: signed in as a temporary test player (manage.py test_session), deleted again at the end.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite /work and /app
ROOT="$(pwd -W 2>/dev/null || pwd)"

role=''
envs=()
for arg in "$@"; do
  case "$arg" in
    --player) role=player ;;
    --superuser) role=superuser ;;
    *=*) envs+=(-e "$arg") ;;
    *)
      echo "usage: tools/a11y/audit.sh [--player | --superuser] [NAME=value …]" >&2
      exit 2
      ;;
  esac
done

manage() { docker compose -f docker-compose.dev.yml exec -T backend python manage.py "$@"; }
if [ -n "$role" ]; then
  flag=''
  [ "$role" = superuser ] && flag=--superuser
  session="$(manage test_session $flag)"
  trap 'manage test_session --delete' EXIT
  envs+=(-e "SESSION=$session")
fi

docker run --rm --add-host=host.docker.internal:host-gateway -v "$ROOT:/work" -w /work/tools/a11y \
  ${envs[@]+"${envs[@]}"} mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c 'npm i --no-save --no-update-notifier --no-fund --no-audit playwright@1.63.0 @axe-core/playwright@4.13.0 >/dev/null && node audit.mjs'
