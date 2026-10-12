---
name: kd-plan-feature
description: Design and plan a new KD 1035 feature in conversation before any code – clarify it with Gether, place it in the right app and pages, settle data, permissions, privacy, i18n, SSR and versioning, and hand back a short build plan with acceptance criteria. Use when Gether asks for something new that is bigger than a one-file change. Writes no code.
---

# Plan a feature

The agent rounds (`kd-improve`: kd-ideator → kd-critic → kd-builder) run only when Gether asks for one (CLAUDE.md → Automatizácia agentmi); this is the same discipline for one feature in a normal conversation. Talk to Gether in Slovak. If the superpowers plugin is installed, `superpowers:brainstorming` drives the clarifying conversation and `superpowers:writing-plans` the plan; this skill supplies the questions that matter in this repo.

## 1. Understand before designing

- Read CLAUDE.md, the area's detail file (docs/eventy.md, docs/navody.md, docs/ucty.md) and `docs/backlog.md` – is it already under Hotové, Odložené or Zamietnuté?
- Find the closest existing feature; the plan mirrors it.
- Ask Gether one question at a time, multiple choice where possible. Stop asking once an answer would not change the plan.

## 2. Questions that decide the design

- **Who and why:** visitor, player, unapproved player, R4, superadmin – which journey does it serve?
- **Feasible:** Rise of Kingdoms has no public API – nothing live (power, members, ranks). Only data entered in the admin or by players.
- **Where it lives:** `kingdom` (events, Discord), `guides` (content, meta), `accounts` (anything about a player). New page or a section; lazy-loaded if heavy (initial bundle budget).
- **Data:** new model or field, admin, who edits it, how it reaches the server (data migration, not the snapshot), additive migration (skill `kd-migration`).
- **Personal data:** what is stored, who sees it, retention, deletion with the account → privacy page in both languages.
- **Permissions and abuse:** superuser only? approved players only? terms accepted? throttles on writes, sanitized HTML, upload limits.
- **Discord:** webhook or bot DM only; worker timing; sensible behaviour while the secret is not configured.
- **Frontend:** routes, `i18n.ts`, server routes and sitemap for a new page; SSR-safe; hides cleanly when the API fails; works from 320 px; colours from `styles.scss`; reduced motion.
- **What only Gether can provide:** texts, photos, Discord settings, decisions – the feature must degrade gracefully until they exist.
- **Rollout on the live site:** what happens to data players already have, to URLs shared on Discord, to a tab still running the old build? Does the deploy run a migration (destructive → skill `kd-migration` rules)? Does it need a new `.env` value or a server step before it works? Ship in slices that are each safe to deploy on their own.
- **Version:** MINOR (new page, section, feature) or PATCH (skill `kd-release`).

## 3. The plan

In the conversation; a file only if Gether asks for one. Short (aim for under ~150 lines) – reference code by path, do not paste implementations.

- Summary (2–3 sentences, Slovak) and acceptance criteria as testable bullets
- Pattern to mirror (existing file paths)
- Backend: models and migration, admin, serializers/views/urls, worker, tests
- Frontend: API service in `core/`, pages and components, i18n keys SK + CZ, routes, tests
- Docs: which CLAUDE.md line or docs/*.md section records the new decision (skill `kd-doc-budget` before growing them)
- Risks, open questions, what Gether must provide
- Build order in small commits, each leaving the site working
- Effort S/M/L and the version bump

## 4. Challenge it

For anything M or larger, spawn `kd-critic` on the plan ("review this proposal") before showing it to Gether – it checks value, feasibility and the CLAUDE.md rules. Fold in its required changes.

## Next

Gether approves → build it yourself, or spawn `kd-builder` with the plan as the spec (it needs a clean working tree, commits locally and never pushes – then spawn `kd-critic` on its `git diff`). Finish with skill `kd-done`, which pushes.
