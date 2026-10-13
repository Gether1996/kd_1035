---
name: kd-qa
description: QA pass of the KD 1035 website before a merge to main (= deploy) or after a UI change – runs the automated e2e/layout suite (tools/e2e) first, then exploratory testing in a real Chrome through the Chrome DevTools MCP server with parallel kd-qa-tester agents per device or area, and returns one ranked report. Args – an area, page, PR or device ("mobil", "/kalendar", "PR 12", "celý web", "live"). Use when someone asks to test, QA, smoke-test or check the site on mobile.
---

# QA pass

Why it exists and what each layer catches: `docs/qa.md`. This is the procedure. Talk to the user in Slovak.

## 0. Scope

From the args and the diff (`git diff origin/main --stat`), pick:
- **Pages and scenarios** – the scenario IDs in `docs/qa.md` → Testovací plán that the change touches. No args and no diff = smoke of everything (all `G*`, `N*`) plus the areas changed in the last week (`git log --since=7.days --stat origin/main`).
- **Devices** – always phone 360 and laptop 1280; add 320 + landscape for layout work, tablet for grids and the calendar, the throttled phone for anything loading data.
- **Signed in?** – pages under `/ucet`, `/pripomienky`, `/marche`, `/kvk`, `/vyhodnocovanie`, or the calendar's event management → yes (player or superuser).
- **Site** – the dev stack (`docker compose -f docker-compose.dev.yml up -d`, :4200) unless the user says `prod` (the production stack on :9005, `docker compose up -d --build`) or `live` (kd1035.eu: read-only, smoke only, never signed in – confirm with the user first).

## 1. Automated suite first (cheap, deterministic)

```bash
tools/e2e/run.sh --grep "@smoke|@layout|@journey"        # all devices, ~5 min; add --player for signed-in pages
tools/e2e/run.sh --project phone --grep @layout          # while iterating
```
Without Docker: `cd tools/e2e && npm ci && BASE_URL=http://localhost:4200 PW_CHANNEL=chrome npx playwright test` (docs/qa.md).
It ends with `node summary.mjs` output – failures, then grouped warnings. Each failure is a finding; read the trace only when the message is not enough (`npx playwright show-trace tools/e2e/out/results/<test>/trace.zip`). Do not start exploratory testing on a page that fails here – report it first.

## 2. Exploratory testing in Chrome (kd-qa-tester)

Needs the `chrome-devtools` MCP server (`.mcp.json`; `/mcp` shows it – if it is missing or pending approval, tell the user how to enable it: docs/qa.md → Manuálne QA). Signed-in runs need a test player:
```bash
docker compose -f docker-compose.dev.yml exec -T backend python manage.py test_session [--superuser] [--marches] [--new]   # prints SESSION
```
Spawn `kd-qa-tester` agents **in one message** so they run in parallel – one per device group (e.g. phones / tablet + laptop) or per area when the scope is wide. Each prompt names: site URL, device emulation strings, scenario IDs, pages, SK and CZ, the SESSION if signed in, and the screenshot prefix (`tools/qa/out/<agent>-…`). Keep it to 2–4 agents; they share one Chrome.

When every agent is done, **always** delete the test player (`test_session --delete`), also after a failure.

## 3. Report

Merge the automated failures and the agents' findings, drop duplicates, keep their evidence. Rank: Blokujúce → Vážne → Drobné → Nápad.

```
QA <date> – <scope> – <site @ git short sha>
Automaticky: <N> testov, <failed> zlyhaní, <warnings> varovaní
Výsledok: OK na merge | opraviť pred mergom | neodporúčam merge

1. [Vážne] <page> <device> – <what>  (screenshot tools/qa/out/…; repro…; kde v kóde…)
…
Nepokryté: …
```
Look at the screenshots of the top findings yourself before reporting them – an agent can misjudge a layout.

## 4. After the report

- Fixing is a separate step: offer to fix the Blokujúce/Vážne ones (`kd-fix-bug` for each; a layout bug also gets a check in `tools/e2e` – a page in `tests/pages.ts`, a row in `ALIGNED` in `tests/layout.ts`, or a journey – so it stays fixed).
- Findings nobody fixes now → `docs/backlog.md` → Odložené, one line each, with the date.
- Live site after a deploy: GitHub → Actions → **Live smoke** → Run workflow (read-only), or `tools/e2e/run.sh --project phone --grep "@smoke"` with `BASE_URL=https://kd1035.eu PROD=1` – only when the user asks.
