---
name: kd-write-tests
description: Backfill tests for existing KD 1035 code before changing or refactoring it – inventory its behaviours (happy path, validation, permissions, throttling, time edges, API failure, SSR, both languages) and pin them one at a time in Django tests or Vitest specs. Use when code you are about to touch has thin coverage, or Gether asks for tests of an area. New features get their tests while they are built, not here.
---

# Backfill tests

Match the existing suites: Django `TestCase` classes in `backend/<app>/tests.py` and `test_<area>.py`, Vitest specs beside the file (`*.spec.ts`). Read two neighbouring tests first and copy their style – helpers at the top of the module, names that read as a sentence (`test_range_days_are_local_and_inclusive`), `HttpTestingController` for API data in specs. If the superpowers plugin is installed, `superpowers:test-driven-development` supplies the one-behaviour-at-a-time discipline.

## 1. Inventory the behaviours first

Backend (views, models, worker):
1. happy path – status, the JSON fields the frontend reads, cache headers where set
2. validation – each rejected input → 400 naming the field
3. permissions – anonymous, player, unapproved player, terms not accepted, R4 (`kvk_reviewer`), superuser; superuser-only actions refuse everyone else
4. throttles on writes and uploads
5. not found or hidden – unpublished guide, another player's private data
6. time edges – 00:00 UTC starts, Bratislava day boundaries, the DST switch; freeze `timezone.now`
7. personal data – what the snapshot export or another player must never see

Frontend (components, services):
1. renders from API data
2. **API failure → the section hides**, nothing breaks
3. SK and CZ (`/cz/…`) texts and links
4. SSR: no `window` / `localStorage` outside the browser
5. empty and loading states; signed in vs anonymous

State-like logic (event cycles, reminder offsets, approval and terms gates) → one case per row of its truth table.

Unclear what the intended behaviour is → ask Gether. A test that pins a bug as "expected" is worse than none.

## 2. One behaviour at a time

1. Write one test and run only it: `tools/test.sh backend accounts.tests.<Class>.<test>` or `tools/test.sh frontend --include <path>`.
2. Passes on existing code? Break the behaviour on purpose for a moment and watch it fail – a test that cannot fail proves nothing. Restore.
3. Fails? That is a bug: stop, tell Gether, fix it with skill `kd-fix-bug` – not silently inside this task.

## 3. Rules

- Test data only inside tests, never in the dev database (the pre-commit hook exports it into git).
- No real network: patch Discord calls (webhook, bot DM, OAuth) with `unittest.mock`.
- `TransactionTestCase` needs `serialized_rollback = True` (CLAUDE.md → Technológie).
- Assert outcomes – the response, stored rows, the message that would be sent – not which internal function was called.

## 4. Finish

`tools/test.sh all`, commit (`Add tests for …`). Tests alone never bump the version.
