---
name: kd-fix-bug
description: Fix a bug on the KD 1035 website reproduce-first – capture it in a failing Django test or Vitest spec, state the root cause in one sentence, make the smallest fix, verify, release as PATCH. Use when Gether reports something broken (wrong time, missing section, error, a page that looks off) or a test or log shows a defect. Not for new features.
---

# Fix a KD 1035 bug

Rules: CLAUDE.md, plus the detail file of the area (docs/eventy.md, docs/navody.md, docs/ucty.md). Talk to Gether in Slovak. If the superpowers plugin is installed, `superpowers:systematic-debugging` drives the diagnosis and `superpowers:test-driven-development` the regression test; this skill adds what is specific to this repo.

## Principles

- **Reproduce before fixing.** A bug you cannot reproduce is not fixed, only hidden.
- **Regression test first** – it fails for the reported reason, then passes after the fix.
- **Root cause, not symptom.** If the fix is "add a null check", find out why the value was null.
- **Smallest diff.** No drive-by refactors; mention smells in the report instead.
- **Two attempts, then pivot.** The same approach failing twice means the diagnosis is wrong.
- **Observe, don't infer.** Claims about behaviour come from a run (test, curl, screenshot), not from reading code.
- **The site is live – reproduce locally only.** Never log into, write to, query or run commands on production, and never copy player data out of it. What you need from production (a URL, a screenshot, the time it happened) comes from Gether.
- **A hotfix is still a normal change:** test, `kd-done`, push. Gether deploys; nothing is patched on the server by hand.

## 1. Reproduce

1. Pin down the report: page and language (SK `/…` or CZ `/cz/…`), anonymous or signed in (player, unapproved player, R4, superadmin), screen width and browser, expected vs actual. Missing detail → ask Gether once, precisely.
2. Reproduce in the cheapest place that shows the same symptom:

   | Where the bug lives | Reproduce with |
   |---|---|
   | API, model, worker, Discord message text | a Django test next to the existing ones (`backend/<app>/tests.py` or `test_<area>.py`), `tools/test.sh backend <app>.<module>` |
   | Component logic, i18n, routing, SSR guard | a Vitest spec beside the file, `tools/test.sh frontend --include <path>` |
   | Layout, overflow, Safari only | `tools/screenshots/shoot.sh` (`BROWSER=webkit` for iPhone), skill `kd-verify` |
   | Only in the prerendered build | `tools/test.sh build`, then read the generated HTML |
   | Time-dependent (cycles, reminders, 00:00 UTC starts) | freeze time like the calendar tests (`mock.patch('django.utils.timezone.now', …)`) |
   | Needs the running stack (cookies, worker, real requests) | spawn `kd-smoke-test` with the exact steps |

3. Confirm it fails with **the same** symptom as the report. A different failure is a different bug.

Cannot reproduce → stop and tell Gether what you tried and what you need (exact URL, time, screenshot). Do not ship a speculative fix.

## 2. Root cause

Follow the data path: model → serializer/view → the service in `frontend/src/app/core/` (`*-api.ts`, `api.ts`, `auth.ts`) → component → template. Write it down before touching code:

> Root cause: <one sentence – the reason, not the symptom>

Usual suspects here: UTC vs Europe/Bratislava day boundaries, `sk.ts` and `cs.ts` out of step, browser-only code running during prerender, an API failure that should hide a section, a migration that skipped rows edited in the admin, a pending `EventNotification` still carrying an old name or date.

## 3. Fix and verify

1. Smallest change at the root cause; the regression test now passes.
2. `tools/test.sh all` – everything green, not only the new test. Model changed → skill `kd-migration`.
3. Visual bug → screenshots before and after at the widths that showed it, SK and CZ (skill `kd-verify`).
4. Walk skill `kd-done`.

## 4. Commit and release

- English messages. A separate test commit first is welcome when the test documents the bug on its own (`Add regression test for …`, then `Fix …`).
- Players notice it → PATCH with skill `kd-release`. Text typo, content, tests, tools → no version (CLAUDE.md → Verzia webu).

## Report to Gether (Slovak)

- what was broken (one line) and the root cause (one sentence)
- the regression test (file + name) and the files changed
- the version released, or why none
- smells noticed but deliberately left alone
