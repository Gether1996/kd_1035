# Automatizácia agentmi

Web vylepšujú traja agenti v kolách a raz za mesiac sa sama aktualizuje meta v návodoch. Konfigurácia a stav sú v [`.claude/kd-agents.json`](../.claude/kd-agents.json), zoznam hotového a čakajúceho v [`backlog.md`](backlog.md).
UX analýza webu (prečo ho hráči používajú, čo chýba, čo zámerne nie): [`ux-analyza.md`](ux-analyza.md).

## Cieľ

Spúšťať kolá `kd-improve`, kým kritik nepovie, že je web viac-menej hotový (`site_finished: true`, prázdne `must_haves_left`). Potom napísať `docs/odporucania.md` so všetkým, čo potrebuje Getherovu pozornosť.

## Agenti (`.claude/agents/`)

- **kd-ideator** – vymýšľa funkcie a vylepšenia podľa reálnych potrieb hráčov a vedenia. Iba číta, nič nemení.
- **kd-critic** – prísne posudzuje nápady aj hotový kód, sám spúšťa testy a build. Pushuje až po schválení.
- **kd-builder** – implementuje jednu schválenú funkciu (backend, frontend, SK/CZ, testy, screenshoty), commituje lokálne a opravuje pripomienky kritika.

## Workflowy (`.claude/workflows/`)

- **kd-improve** – jedno kolo: nápady → kritika → postupne najviac 4 funkcie (builder → review → najviac 2 opravy → push) → `docs/backlog.md`. Neúspešný pokus sa odloží na vetvu `attempt/<id>`, `main` zostane čistý.
- **kd-meta-update** – mesačná aktualizácia návodov (commanderi, výbava, eventy): research → úprava `backend/guides/meta` → kritik overí každé tvrdenie oproti zdroju → push.

## Ako pokračovať (na hociktorom PC)

1. Priprav repo:
   ```bash
   git pull
   git config core.hooksPath .githooks
   docker compose -f docker-compose.dev.yml up -d
   ```
   Na PC, kde ešte nie je aktuálna databáza, raz `sh .githooks/dbsync.sh import`.
2. Povedz Claudovi: **„pokračuj v kolách agentov podľa docs/agenti.md“**. Claude:
   - spustí `kd-improve` s args z [`.claude/kd-agents/next-round.json`](../.claude/kd-agents/next-round.json) (doplní dnešný `date`) – bez nového vymýšľania, prvá na rade je rozrobená vetva `wip/discord-login`,
   - ďalšie kolá už s novými nápadmi: args `{ "features": 4, "date": "RRRR-MM-DD" }`,
   - po každom kole zapíše výsledok do `rounds` v `.claude/kd-agents.json` a do `next-round.json` uloží zvyšné nápady.
3. Keď kritik povie, že je hotovo → `docs/odporucania.md`.

## Pravidlá

- Kolo pracuje v hlavnom adresári repa. Kým beží, nič iné tam needituj (vlastnú prácu rob v `git worktree`).
- Pred kolom: čistý `git status`, beží Docker, `git pull`.
- Agenti bežia vždy **len na jednom PC naraz**.
- Docker Desktop: odporúčaná RAM aspoň 6 GB (Settings → Resources). Pri `I/O error` / `cannot allocate memory` pozri CLAUDE.md → Príkazy.
- S hookmi nesie každý commit aj DB snapshot – agenti nenechávajú v dev databáze testovacie dáta.

## Mesačná aktualizácia mety

- Naplánovaná úloha Claude desktop appky **`kd1035-meta-update`** – každý 7. v mesiaci o 18:00, prvýkrát 7. 11. 2026. Beží len keď je appka otvorená (inak pri ďalšom spustení) a musí bežať Docker.
- Úloha existuje iba na PC, kde bola vytvorená. Jej prompt je v [`.claude/kd-agents/scheduled-meta-update.md`](../.claude/kd-agents/scheduled-meta-update.md). Ak by sa mala presunúť na iné PC, na pôvodnom ju vypni a na novom povedz: „naplánuj úlohu podľa `.claude/kd-agents/scheduled-meta-update.md`, každý 7. v mesiaci o 18:00“.
- Ručne kedykoľvek: „spusti kd-meta-update“ (args `{ "date": "RRRR-MM-DD" }`).
- Dátum poslednej aktualizácie je vždy v pätičke webu.
