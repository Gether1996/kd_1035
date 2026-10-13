---
name: kd-done
description: Definition of done for any KD 1035 change before it is committed and pushed to main (public repo, live site) – tests and build, no secrets in the diff, impact on live players and data, migrations, screenshots and accessibility for UI, SK + CZ texts, privacy page, .env.example, docs, no test data left in the dev database, version and tag. Use as the last step of every task that changes code, right before the commit.
---

# Definition of done

Every finished change goes straight to `main` (CLAUDE.md → Git), so this is the only gate – and a push is both **public** (the GitHub repo is public) and **live at the next deploy** (`backend/entrypoint.sh` migrates and syncs the meta guides on every start). Walk it top to bottom. A line that does not apply is skipped, never weakened; a line that fails is fixed before the commit.

## Always

- [ ] `tools/test.sh all` green – fresh output for this change, not an earlier run
- [ ] The acceptance criteria are met, checked by running it (test, curl, screenshot, `kd-smoke-test`) – not by reading the code
- [ ] `git status` shows only files this task meant to change
- [ ] `git diff --cached` holds no secret: no value from `.env` / `.env.production`, no token, password, webhook URL, Discord client secret, no player data, no server address that is not already public
- [ ] No test data in the dev database; the test player is gone (`docker compose -f docker-compose.dev.yml exec -T backend python manage.py test_session --delete` if a script was killed)

## Live site

- [ ] Nothing players already have breaks: their data, their reminders, URLs shared on Discord, an open tab still running the old build (CLAUDE.md → Dizajn a UX, "Nová verzia po nasadení")
- [ ] Any migration was reviewed for production data (skill `kd-migration`); a destructive one has Gether's explicit yes and a backup before the deploy
- [ ] Anything that needs a new `.env` value or a server step is listed for Gether, and the code degrades gracefully until it is done

## When it applies

- [ ] **Model changed** → migration generated and inspected (skill `kd-migration`); `makemigrations --check --dry-run` clean
- [ ] **Visible change** → screenshots at 360, 768, 1280, 1920 and 2560 (CLAUDE.md → 100 % responzívne), SK and CZ, signed in and out where it matters (skill `kd-verify`)
- [ ] **UI change** → `tools/a11y/audit.sh --player` with 0 critical/serious (CLAUDE.md → Prístupnosť)
- [ ] **Page, routing, layout or dialog change** → `tools/e2e/run.sh` green (skill `kd-verify` 1b); a bigger UI change also gets `/kd-qa` on a phone and a laptop (docs/qa.md)
- [ ] **Any text on the site** → in `sk.ts` and `cs.ts` (the glossary's `terms.ts` is the one exception), correct diacritics
- [ ] **New page** → `app.routes.ts`, `i18n.ts`, `app.routes.server.ts`, sitemap `STATIC_PAGES`, `Seo`
- [ ] **Personal data, cookie, third party or retention changed** → privacy page in both languages and its date
- [ ] **New env variable** → `.env.example` with a description, never a real value
- [ ] **New decision** (configuration, design, architecture, workflow) → one line in CLAUDE.md or the area's docs/*.md, inside its budget (skill `kd-doc-budget`)
- [ ] **New operator step** (server, DNS, Discord setup) → README.md
- [ ] **Non-trivial change** → spawn `kd-critic` on `git diff <base>..HEAD` and fix every blocker and major

## Ship

- [ ] Version decided with skill `kd-release` – players notice it → PATCH or MINOR; text tweaks, content, docs, tests, tools → none
- [ ] Docker running, so the pre-commit hook can export the snapshot; small English commits ending with the Co-Authored-By line
- [ ] Pushed – the tag in the same push when there is a release. Deploying is Gether's step; never run anything on the server
- [ ] Gether told in Slovak: what changed, the version, whether the deploy runs a migration, and anything that needs Gether's action before or after deploying
