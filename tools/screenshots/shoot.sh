#!/usr/bin/env bash
# Screenshots of the running dev site (docker compose -f docker-compose.dev.yml up) → tools/screenshots/out/
#   tools/screenshots/shoot.sh [--player | --superuser] [NAME=value …]
#   e.g. tools/screenshots/shoot.sh PAGES=/,/cz/kalendar SIZES=360x780,1280x800
#        tools/screenshots/shoot.sh --player PAGES=/ucet,/pripomienky
#        tools/screenshots/shoot.sh --player SHOT=0 PAGES=/,/cz SIZES=900x800,1024x800,1280x800 MEASURE=.nav,.account
# NAME=value pairs are the variables described in shoot.mjs (PAGES, SIZES, FULL, SELECTOR, MEASURE, SHOT, SESSION…).
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
      echo "usage: tools/screenshots/shoot.sh [--player | --superuser] [NAME=value …]" >&2
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

docker run --rm --add-host=host.docker.internal:host-gateway -v "$ROOT:/work" -w /work/tools/screenshots \
  ${envs[@]+"${envs[@]}"} mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c 'npm i --no-save --no-update-notifier playwright@1.63.0 >/dev/null && node shoot.mjs'
