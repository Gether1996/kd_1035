#!/usr/bin/env bash
# Runs the tests in throwaway containers without a bind mount (Docker Desktop on Windows fails on the dev bind
# mount with a nested volume: I/O error, "cannot allocate memory", "No tests found").
#   tools/test.sh backend [label…]   Django tests, e.g. tools/test.sh backend accounts kingdom.test_calendar
#   tools/test.sh frontend [args…]   Angular (Vitest), e.g. tools/test.sh frontend --include src/app/pages/calendar
#   tools/test.sh build              production build with prerendering (SSR-unsafe code, bundle budget)
#   tools/test.sh [all]              all three
#   tools/test.sh --ref <commit|branch> …   the code of that commit instead of the working tree (git archive),
#                                           e.g. a collaborator's branch before merging it
# Prints only the summary, or the failures; the full output stays in the log file named at the end.
# Needs the dev images (docker compose -f docker-compose.dev.yml up --build once) – the dev stack need not run.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
export MSYS_NO_PATHCONV=1  # Git Bash on Windows would rewrite /app into C:/Program Files/Git/app

REF=''
if [ "${1:-}" = --ref ]; then
  REF="${2:?usage: tools/test.sh --ref <commit> [backend|frontend|all]}"
  git rev-parse --verify --quiet "$REF^{commit}" >/dev/null || { echo "unknown commit: $REF" >&2; exit 2; }
  shift 2
fi
LOGS="${TMPDIR:-/tmp}/kd1035-tests"
mkdir -p "$LOGS"
strip() { sed -e 's/\x1b\[[0-9;]*m//g' -e 's/\r$//' -e '/^npm notice/d'; }

# the files of one app as a tar stream: from the working tree, or from git with --ref
source_of() {
  local dir=$1
  shift
  if [ -n "$REF" ]; then git archive --format=tar "$REF:$dir"; else tar -c "$@" -C "$dir" .; fi
}

backend() {
  local log="$LOGS/backend.log"
  echo "== backend${REF:+ ($REF)}"
  source_of backend --exclude=__pycache__ --exclude=data --exclude=media |
    docker run -i --rm -u root -e DJANGO_DEBUG=1 -w /app --entrypoint sh kd1035-dev-backend \
      -c 'tar -x && python manage.py test "$@"' sh "$@" 2>&1 | strip >"$log"
  local code=${PIPESTATUS[1]}
  if [ $code -eq 0 ]; then
    grep -E '^(Ran [0-9]+ tests|OK)' "$log"
  elif grep -qE '^={70}$' "$log"; then
    # unittest's report: every FAIL/ERROR block, then "Ran N tests" and FAILED (failures=…)
    sed -nE '/^={70}$/,$p' "$log" | grep -v '^Destroying test database'
  else
    tail -n 40 "$log"  # import error, missing image…
  fi
  echo "   log: $log"
  return $code
}

frontend() {
  local log="$LOGS/frontend.log"
  echo "== frontend${REF:+ ($REF)}"
  # node_modules come from the dev volume: after a dependency change start the dev frontend once (npm install)
  source_of frontend --exclude=node_modules --exclude=.angular --exclude=dist |
    docker run -i --rm -e NO_COLOR=1 -v kd1035-dev_frontend_node_modules:/app/node_modules -w /app node:24-alpine \
      sh -c 'tar -x && npx ng test --watch=false "$@"' sh "$@" 2>&1 | strip >"$log"
  local code=${PIPESTATUS[1]}
  if grep -qE '^ +Tests ' "$log"; then
    # Vitest: the failed tests with their assertion, then the totals
    awk '/Failed Tests [0-9]|Unhandled Error/ {p = 1} /^ +Test Files / {p = 0} p' "$log"
    grep -E '^ +(Test Files|Tests) ' "$log"
  elif grep -q '\[ERROR\]' "$log"; then
    sed -n '/\[ERROR\]/,$p' "$log" | head -n 60  # the build failed before any test ran
  else
    tail -n 40 "$log"
  fi
  echo "   log: $log"
  return $code
}

build() {
  local log="$LOGS/build.log"
  echo "== build${REF:+ ($REF)}"
  source_of frontend --exclude=node_modules --exclude=.angular --exclude=dist |
    docker run -i --rm -e NO_COLOR=1 -v kd1035-dev_frontend_node_modules:/app/node_modules -w /app node:24-alpine \
      sh -c 'tar -x && npx ng build' 2>&1 | strip >"$log"
  local code=${PIPESTATUS[1]}
  if grep -q '\[ERROR\]' "$log"; then
    sed -n '/\[ERROR\]/,$p' "$log" | head -n 60
  else
    grep -E '\[WARNING\]|Initial total|Prerendered' "$log" || tail -n 40 "$log"
  fi
  echo "   log: $log"
  return $code
}

target="${1:-all}"
[ $# -gt 0 ] && shift
case "$target" in
  backend) backend "$@" ;;
  frontend) frontend "$@" ;;
  build) build ;;
  all)
    backend; b=$?
    frontend; f=$?
    build; n=$?
    [ $b -eq 0 ] && [ $f -eq 0 ] && [ $n -eq 0 ] && echo "== all passed" || { echo "== FAILED"; exit 1; }
    ;;
  *)
    echo "usage: tools/test.sh [--ref <commit>] [backend [label…] | frontend [ng test args…] | build | all]" >&2
    exit 2
    ;;
esac
