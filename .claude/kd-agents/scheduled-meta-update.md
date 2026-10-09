---
name: kd1035-meta-update
description: Monthly research + update of the KD 1035 Rise of Kingdoms meta guides (commanders, equipment, events) with fact-check and push.
---

Run the monthly meta update of the KD 1035 website (Rise of Kingdoms kingdom 1035, CZ/SK). Communicate with the user in Slovak.

Repository: C:\Users\gethe\Desktop\kd_1035 (GitHub: Gether1996/kd_1035, branch main). Work in that directory. Its CLAUDE.md holds the project rules – follow them.

What the update does: the auto-updated guides (commander pairings, equipment, events) live as data in backend/guides/meta/commanders.py, equipment.py and events.py. `manage.py sync_meta_guides` writes them into the database. The update researches what changed in the RoK meta since each module's VERIFIED month, edits those modules (original SK + CZ text, dated sources), fact-checks every change against its source and pushes to main.

Steps:
1. Preconditions: Docker Desktop must be running (`docker info`). If it is not, stop and tell the user to start it and run this task again. Then `git pull` on main and check that `git status` is clean. If it is not clean, stop and report what is uncommitted – never discard it. Start the dev stack: `docker compose -f docker-compose.dev.yml up -d`.
2. Run the saved workflow `kd-meta-update` (Workflow tool, scriptPath C:\Users\gethe\Desktop\kd_1035\.claude\workflows\kd-meta-update.js) with args {"date": "<today as YYYY-MM-DD>"}. This request is the explicit opt-in to run that workflow. Wait for it to finish.
3. If the Workflow tool is not available in this session, do the same steps yourself:
   - Research each module with WebSearch/WebFetch, using reliable dated sources: allclash.com, official Lilith patch notes, app.rokstats.online, riseofkingdomsguides.com (beware bulk "Jan 2, 2026" dates). Do not use the lootbar.com blog.
   - Edit the modules: original text in both languages, sources with dates, and set VERIFIED to the current month in every module you checked and LAST_UPDATE (backend/guides/meta/__init__.py, shown in the site footer) to today.
   - Run `tools/test.sh backend` and `sh .githooks/dbsync.sh sync`.
   - Re-verify every changed claim against its source.
   - Commit ("Update RoK meta guides YYYY-MM", ending with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>") and `git push origin main`.
4. Finish with a short Slovak summary:
   - which guides changed and why (with the key sources)
   - what was skipped or could not be verified
   - whether it was pushed; if it was not, the name of the local branch `attempt/meta-YYYY-MM` that keeps the work

Never invent game facts. When a claim cannot be backed by a current source, leave the guide as it is.