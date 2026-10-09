---
name: kd-review-branch
description: Review and merge a collaborator's branch of the KD 1035 repo (e.g. TTakedaSVK's fix/… or feat/… branches on origin) – find new branches, read the diff without the DB snapshot, run the branch's tests from git, fast-forward merge into main, sync the dev database and push. Use when Gether asks to check, review or merge someone's branch or PR, or asks what is new on GitHub.
---

# Review and merge a collaborator's branch

Judge the code by CLAUDE.md (i18n SK/CZ, no hard-coded texts, SSR safety, design and performance rules, privacy page for personal data, docs/*.md for the area). Talk to Gether in Slovak.

## 1. What is new

```bash
git fetch --prune origin
git branch -r --no-merged main                     # branches with commits main does not have
git log --format='%h %an %ad %s' --date=short main..origin/<branch>
```
`wip/…` and `attempt/…` are our own unfinished work (docs/agenti.md), not a collaborator's.

## 2. Read the change

```bash
git diff --stat main...origin/<branch>
git diff main...origin/<branch> -- . ':!backend/snapshot' ':!backend/media'
```
- The snapshot is binary: only note **whether** it changed (`git diff --stat main...origin/<branch> -- backend/snapshot backend/media`). If main changed it too since the branch started, the merge will conflict – CLAUDE.md → Synchronizácia databázy describes how to pick one.
- A new migration must be additive; a changed already-deployed migration is a blocker.

## 3. Tests of the branch (no checkout needed)

```bash
tools/test.sh --ref origin/<branch> all
```
For visual changes check it out detached (`git switch --detach origin/<branch>`; commit or stash your own work first), take screenshots with the skill `kd-verify`, then `git switch main`.

## 4. Decide

Blockers or failing tests → report them to Gether (what, where, suggested fix) and stop. Otherwise merge.

## 5. Merge, sync, push

```bash
git switch main && git pull --ff-only
git merge --ff-only origin/<branch>
sh .githooks/dbsync.sh sync      # migrations + meta guides into the dev DB (the post-merge hook already imported a new snapshot)
tools/test.sh all                # main as it is now
git push origin main
```
- `--ff-only` refuses when the branch is based on an older main. Then rebase a local copy: `git switch -c review/<branch> origin/<branch> && git rebase main`, test it again, `git switch main && git merge --ff-only review/<branch>`, delete `review/<branch>`, and tell Gether the commits got new hashes (the collaborator should start the next branch from the new main).
- If the change is something players notice and the branch did not raise the version, release it with the skill `kd-release` (a separate commit after the merge).
- Delete the remote branch only when Gether says so.
