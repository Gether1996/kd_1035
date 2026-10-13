#!/usr/bin/env bash
# End-to-end, smoke and layout tests (Playwright) against the running site → summary + tools/e2e/out/report/index.html
#   tools/e2e/run.sh [--prod] [--player] [playwright args…]
#   e.g. tools/e2e/run.sh                                   everything against the dev stack (:4200), all devices
#        tools/e2e/run.sh --grep @smoke --project phone     quick: every page on a phone
#        tools/e2e/run.sh --player                          also the signed-in pages (temporary test player)
#        tools/e2e/run.sh --prod                            against the production stack (:9005, docker-compose.yml) –
#                                                           adds status codes, cache headers, sitemap, link previews
# Runs in the Playwright image (Chromium + WebKit), so it needs only Docker. Without Docker, see docs/qa.md
# (npx playwright test with PW_CHANNEL=chrome). How to read the result: docs/qa.md → Automatické testy.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite /work and /app
ROOT="$(pwd -W 2>/dev/null || pwd)"

base='http://host.docker.internal:4200'
compose='docker-compose.dev.yml'
as=()  # the dev backend runs as root; production files must stay owned by app (CLAUDE.md → Dáta a zálohy)
envs=()
args=()
player=''
for arg in "$@"; do
  case "$arg" in
    --prod) base='http://host.docker.internal:9005' compose='docker-compose.yml' as=(-u app) envs+=(-e PROD=1) ;;
    --player) player=1 ;;
    *) args+=("$arg") ;;
  esac
done

if [ -n "$player" ]; then
  manage() { docker compose -f "$compose" exec -T ${as[@]+"${as[@]}"} backend python manage.py "$@"; }
  session="$(manage test_session --marches | tr -d '\r')"
  trap 'manage test_session --delete' EXIT
  envs+=(-e "SESSION=$session")
fi

docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway -v "$ROOT:/work" -w /work/tools/e2e \
  -e CI= -e "BASE_URL=$base" ${envs[@]+"${envs[@]}"} mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c 'npm ci --no-audit --no-fund --no-update-notifier >/dev/null &&
    npx playwright test "$@"; code=$?; echo; node summary.mjs out/run.json --warnings; exit $code' \
  sh ${args[@]+"${args[@]}"}
