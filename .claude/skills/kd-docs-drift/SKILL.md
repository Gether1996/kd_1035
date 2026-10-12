---
name: kd-docs-drift
description: Check that CLAUDE.md, README.md, docs/*.md and the .claude skills and agents still match the code – every path, identifier, command, env variable and number they cite – and that the privacy and terms pages still promise what the code does. Reports drift and fixes it only after Gether agrees. Use now and then, after a big change, or when an agent followed an instruction that no longer works.
---

# Docs drift check

Docs are written in the moment; the code moves on. An agent that trusts a stale path or number does the wrong thing confidently. This check is read-only until Gether approves the report. Talk to Gether in Slovak.

## Scope

- Whole repo by default – it is small enough.
- Or only what a range touched: `git diff --name-only <since>..HEAD`, then the docs that mention those files.

## 1. Collect the claims

From CLAUDE.md, README.md, docs/*.md, `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/kd-agents/*.md`:

- **paths** in backticks (`backend/accounts/guard.py`, `frontend/src/app/core/site-update.ts`)
- **identifiers** – functions, classes, settings, management commands, i18n keys (`sync_meta_guides`, `TERMS_VERSION`, `STATIC_PAGES`, `privacyPage`)
- **env variables** (`DISCORD_ADMIN_IDS`, `BACKUP_KEEP`, `WEB_PORT`)
- **commands and flags** (`tools/test.sh --ref`, `shoot.sh --player`, `dbsync.sh push`)
- **numbers that are promises** – backup interval and count, log limits, bundle budget, ports, rate limits
- **skill and agent names** that other skills refer to
- **status claims** – "not deployed yet", "waiting for Gether", "planned". The code cannot confirm these: list every one and ask Gether whether it still holds. A stale "nothing is deployed" is a **blocker** – it tells agents that rules meant for a live site do not apply yet.

## 2. Check each against the code

```bash
git ls-files | grep -F '<path>'                                       # path exists
git grep -n -w '<identifier>' -- backend frontend tools .githooks     # identifier is where the doc says
git grep -n '<ENV_VAR>' -- backend 'docker-compose*.yml' .env.example
ls backend/*/management/commands/                                     # management commands
```

- Env variables: every one read in `backend/config/settings.py` or the compose files is in `.env.example` with a description, and nothing in `.env.example` is dead.
- Numbers: read the value where the code sets it (settings default, compose file, nginx template) and compare.
- Commands: the script exists and still takes that flag (its usage header).

## 3. Promises to players

The privacy page (`privacyPage` in `sk.ts` and `cs.ts`) and the terms (`termsPage`) must match the code (CLAUDE.md → Obsah, Ochrana údajov):

- every personal-data field in `backend/accounts/models.py` is listed;
- the cookies and browser storage keys the site sets are the ones named;
- retention matches the code: backups (`BACKUP_KEEP` × `BACKUP_INTERVAL_DAYS`), the log limits in both compose files, the sent-reminder log;
- the third parties named are the ones the code calls.

A mismatch here is always a **blocker**.

## 4. Report to Gether

| Doc:line | Claim | Reality | Proposed fix |
|---|---|---|---|

Severity: **blocker** (privacy or terms promise wrong; an instruction that would make an agent break something), **stale** (path or name moved), **minor** (wording). Change nothing until Gether says which rows to apply.

## 5. Apply

- Fix the doc, not the code – unless the code is what is wrong; then it is a bug (skill `kd-fix-bug`).
- Privacy or terms text → both languages, and move their "Platné od" date (terms: also `TERMS_VERSION`, so every player confirms again – ask Gether first).
- Keep every touched file inside its budget (skill `kd-doc-budget`).
- Version per CLAUDE.md → Verzia webu: docs never bump it; a visible page text change follows the rule there (when in doubt, PATCH).
