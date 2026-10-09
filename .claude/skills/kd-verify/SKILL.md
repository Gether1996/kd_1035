---
name: kd-verify
description: Verify a change on the KD 1035 website before committing – run the backend/frontend tests and the production build, and take responsive screenshots (360–2560 px, signed-in pages, header width check). Use after any code change in backend/ or frontend/, and always for visual changes (layout, styles, header, new page or section).
---

# Verify a KD 1035 change

Rules that decide what "correct" means are in CLAUDE.md (Dizajn a UX, 100 % responzívne, Prístupnosť). This is only the procedure.

## 1. Tests and build

```bash
tools/test.sh all                     # backend + frontend tests + ng build (prerender), ~1 min
tools/test.sh backend kingdom.tests   # one app / class / test while iterating
tools/test.sh frontend --include src/app/pages/calendar
```
- Prints only the totals, or the failures; the full log path is printed at the end – read it only when the summary is not enough.
- No bind mount, so it works while Docker Desktop fails on the dev mount. Needs the dev images (`docker compose -f docker-compose.dev.yml up --build` once). After a change in `frontend/package.json` start the dev frontend once so `npm install` fills the `node_modules` volume.
- Changed a model? Also `docker compose -f docker-compose.dev.yml exec -T backend python manage.py makemigrations --check --dry-run`.

## 2. Screenshots (visual changes)

The dev stack must run (`docker compose -f docker-compose.dev.yml up -d`, site on :4200). Images go to `tools/screenshots/out/` (git-ignored); all variables are described at the top of `tools/screenshots/shoot.mjs`.

```bash
tools/screenshots/shoot.sh PAGES=/kalendar,/cz/kalendar           # 360, 768, 1280, 1920, 2560
tools/screenshots/shoot.sh PAGES=/ SIZES=360x780,1920x1080 FULL=0  # only the first screen
tools/screenshots/shoot.sh PAGES=/ SELECTOR=.footer                # one element
tools/screenshots/shoot.sh --player PAGES=/ucet,/pripomienky       # signed in as a test player
tools/screenshots/shoot.sh --superuser PAGES=/kalendar             # superuser: event management in the calendar
```
- `--player` / `--superuser` create the temporary user `discord_999000111` (`manage.py test_session`) and delete it when the script ends. If the script was killed: `docker compose -f docker-compose.dev.yml exec -T backend python manage.py test_session --delete`. Never make test players by hand – the snapshot skips `discord_*` users, but other test data would go into git.
- Save tokens: read only the PNGs you need (always 360 and 1920, plus the size the change targets); prefer `FULL=0` or `SELECTOR=` over full pages at 2560.
- Check SK **and** CZ pages – Czech labels are often longer.

## 3. Header width check (header, nav items, account area, i18n labels in the bar)

```bash
tools/screenshots/shoot.sh SHOT=0 PAGES=/,/cz SIZES=900x800,960x800,1024x800,1100x800,1280x800 MEASURE=.brand,.nav,.account
tools/screenshots/shoot.sh --player SHOT=0 PAGES=/,/cz SIZES=900x800,960x800,1024x800,1100x800,1280x800 MEASURE=.brand,.nav,.account
```
Pass when: no `OVERFLOW` line, `.nav` right < `.account` x, and `.nav` x is the same signed in and out (the `.account` slot is fixed: 88 px from 900, 180 px from 1100). Below 900 px the burger menu takes over.

## What to look at

- Output lines `OVERFLOW` (page scrolls sideways), `PAGE ERROR`, `CONSOLE` – each one is a bug.
- Text fits at 360 px without clipping, nothing overlaps the night scenery or the footer, headings stay short.
- Hover/focus states visible, contrast fine, nothing new glows or animates forever (CLAUDE.md → Výkon animácií).
- API-driven sections disappear cleanly when the API fails; a signed-in page and an anonymous page both look right.
