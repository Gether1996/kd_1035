---
name: kd-migration
description: Create, inspect and test a Django schema or data migration in the KD 1035 backend safely – descriptive name, read the generated operations and the SQL, catch renames Django turned into drop + add, keep it additive, apply it to the dev database and test it. Use whenever a model in backend/ changes or existing rows must be transformed. Event data (rename/split/re-time events, templates, initial_events.json) has its own skill, kd-event-data.
---

# Django migrations in KD 1035

Rules: CLAUDE.md → Dáta a zálohy, Synchronizácia databázy cez git, Technológie. Shorthand below: `dc` = `docker compose -f docker-compose.dev.yml` – write it out in full in every command (shell state does not persist between Bash calls, and a bare `dc` is the Unix calculator). The dev stack runs (`dc up -d`).

## Why this needs care

- **The site is live.** `backend/entrypoint.sh` runs `migrate --noinput` on every container start, so whatever migration is on `main` runs against real player data at the next deploy – there is no review step after the push. A dropped column is gone; backups are weekly.
- **Production holds data your dev database never sees:** every player, march, KvK sign-up and reminder (the snapshot leaves `accounts_*` out), and events edited in the production admin. A migration that works on dev can still fail or damage rows there.
- **Without a terminal, `makemigrations` must run with `--noinput`, and then Django never asks "was this renamed?" – it answers no and writes `RemoveField` + `AddField`, which drops the column's data. A new NOT NULL field without a default makes it exit with code 3.** (Django's `NonInteractiveMigrationQuestioner`; the version is pinned in `backend/requirements.txt`.)
- **Treat every migration already on `origin/main` as deployed:** never edit, rename, reorder or delete it. Fix forward with a new migration.

## 1. Generate

```bash
dc exec -T backend python manage.py makemigrations <app> --name <what_changed> --noinput
```

- The name says what changed: `player_terms_version`, `march_drop_screenshot` – never `auto_…`, `update`, `fix`.
- One migration per logical change.

## 2. Inspect – always, before applying

1. Read the generated file. For each operation:
   - `RemoveField` / `DeleteModel` – intended, or a rename Django did not detect? A rename → replace the pair with `migrations.RenameField` / `RenameModel` by hand.
   - `AddField` NOT NULL – has a `default`, or is filled by a `RunPython` step first and made non-null in a second migration?
   - `AlterField` – shorter `max_length`, `null=True` → `False`, narrowed `choices`: do all existing rows still fit?
2. Read the SQL:
   ```bash
   dc exec -T backend python manage.py sqlmigrate <app> <number>
   ```
   SQLite cannot alter most columns in place, so Django rebuilds the table (`new__<table>`, copy, drop, rename). That is normal – check that every column you keep is in the `INSERT … SELECT`.
3. Something wrong → fix the model, delete the generated file, generate again. Hand-edit only for renames and data steps.

## 3. Additive by default

- Add first, remove later. A new model, field or nullable column is safe.
- **Destructive operations** – `RemoveField`, `DeleteModel`, a narrowing `AlterField`, a data migration that deletes or overwrites rows – need Gether's explicit yes for that migration, and Gether takes a fresh backup on the server right before deploying it (`docker compose exec -u app worker python manage.py backup_db`, CLAUDE.md → Dáta a zálohy). Never on your own initiative.
- A removal ships in two deploys: first the code that no longer reads the field, then the migration that drops it.
- Personal data belongs in the `accounts` app (the snapshot leaves `accounts_*` out). A new personal-data field → also the privacy page (CLAUDE.md → Ochrana údajov), live in the same deploy.

## 4. Data migrations

- `migrations.RunPython(forward, migrations.RunPython.noop)`; models via `apps.get_model(...)`, never imported.
- Write it for rows you cannot see: filter (`.filter(...).update(...)`), never `.get()` a row that might not exist in production, never assume ids.
- Touch only rows still in the expected old state, so an admin edit survives and a second run changes nothing.
- Content that must reach the server (guides prepared by Claude, seed rows) goes into a data migration that upserts by slug – the snapshot never reaches production.

## 5. Apply and test

```bash
dc exec -T backend python manage.py migrate
dc exec -T backend python manage.py makemigrations --check --dry-run   # nothing left without a migration
tools/test.sh backend <app>
```

- A data migration gets a test that calls its function by the name the migration gives it (`import_module('<app>.migrations.00NN_<name>').<function>(apps, None)`, e.g. `.split` / `.rename` in `backend/kingdom/tests.py`, `.clean_saved_html` in `backend/guides/tests.py`) – with production-shaped rows created in the test (players, marches, admin-edited events), since the dev database has none of them.
- `TransactionTestCase` empties the database after itself, seed rows included → `serialized_rollback = True`.
- Roll back on the dev database only: `dc exec -T backend python manage.py migrate <app> <previous_number>`. The dev database goes into git with the next commit, so migrate forward again before committing. On the server nothing is ever migrated backwards – restoring a backup there is Gether's call.
- Never run `manage.py`, `docker compose` or SQL against the server; everything here is the local dev stack.

## 6. Commit

Docker running (the pre-commit hook exports the snapshot). Model, migration and tests in one commit. A schema change alone is no version bump – the feature it serves decides (skill `kd-release`).
