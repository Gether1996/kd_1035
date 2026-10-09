---
name: kd-event-data
description: Change the kingdom's event data on the KD 1035 website – rename, split or re-time an event (KingdomEvent), add events to the rotation templates, give events icons, or update what a new server starts with (initial_events.json). Use whenever Gether says an event is called differently, runs on another cycle or date, or a new event should exist. Not for calendar/notification code changes.
---

# Change kingdom event data

Read `docs/eventy.md` first (templates, irregular events, icons). Event facts only from Gether or a dated source (codexhelper.com / rokcentral.com calendar) – write the source and date in a code comment.

## Where event data lives

| What | Where | Reaches |
|---|---|---|
| Existing events on every database (rename, split, new cycle) | data migration `backend/kingdom/migrations/00NN_<what>.py` | production + every dev PC |
| Draft rotation / irregular events | `TEMPLATES`, `IRREGULAR_TEMPLATES` in `backend/kingdom/event_templates.py` (`manage.py seed_event_templates`, never overwrites an existing name) | databases where someone runs the seed |
| What a brand-new server starts with | `backend/kingdom/initial_events.json` = copy of the dev DB's events | only a new production DB (`entrypoint.sh`) |
| Icons | `ICONS` + `GUESSES` in `backend/kingdom/event_icons.py`, files in `backend/kingdom/static/kingdom/events/` | everywhere (code) |

Production keeps its own events (the snapshot never goes to the server), so a change to existing events **must** be a migration.

## Checklist

1. **Migration** (when existing events change) – copy the pattern of `0009_holy_knights_treasure.py` (rename) or `0010_holy_knights_treasure_sets.py` (split one event into several):
   - `RunPython(fn, migrations.RunPython.noop)`, models via `apps.get_model`, depend on the latest migration in `backend/kingdom/migrations/`.
   - Touch only rows still in the expected old state (match `name_sk` and e.g. `repeat_days`), so an event Gether edited in the admin stays as it is – and running it twice changes nothing.
   - Delete the event's `EventNotification` rows with `status='pending'` – their title carries the old name/date; the worker plans them again.
   - Splitting: the first part keeps the original row (players' reminders stay attached), the others are copies (`pk = None`).
   - Never edit a migration that is already deployed.
2. **Templates** – update the tuples in `event_templates.py` the same way (names SK/CZ, first start 00:00 UTC, cycle days, duration days, guide slug); new drafts are `is_active=False`.
3. **Icons** – a new event needs a slug in `ICONS` (codexhelper file name, or `None` for one cut from Gether's screenshot) and a `GUESSES` entry (lower-case part of the SK name; first match wins, so specific before generic). Download codexhelper icons with `docker compose -f docker-compose.dev.yml exec -T backend python manage.py fetch_event_icons`.
4. **Dev database** – apply it: `… exec -T backend python manage.py migrate` (or `seed_event_templates`, or the admin), then regenerate the new-server list and review the diff:
   ```bash
   docker compose -f docker-compose.dev.yml exec -T backend python manage.py export_initial_events
   git diff backend/kingdom/initial_events.json
   ```
5. **Tests** – `backend/kingdom/tests.py`: a test per migration that calls its function via `import_module('kingdom.migrations.00NN_…').fn(apps, None)` (see `test_holy_knights_treasure_takes_turns_with_three_equipment_sets`); `EventTemplateTests` refer to template names – update them on a rename. Run `tools/test.sh backend kingdom`.
6. **Docs** – the template/icon sentences in `docs/eventy.md` (short, Slovak, with the date and Gether's word).
7. **Commit** with Docker running (the pre-commit hook exports the snapshot). Event data is content: **no version bump**.
