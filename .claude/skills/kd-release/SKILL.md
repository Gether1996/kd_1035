---
name: kd-release
description: Raise the KD 1035 website version (footer "v1.0.x") and release it – decide PATCH vs MINOR, bump the version files, backlog line, "Release vX.Y.Z" commit, tag and push together. Use when finishing a task that changes what players see or how the site works; also to check whether a change needs a new version at all.
---

# Release a new site version

The rules are in CLAUDE.md → **Verzia webu** (read it if unsure). In short:

- **PATCH** (1.0.2 → 1.0.3): a small change players notice – bug fix, display tweak, small usability improvement.
- **MINOR** (1.0.5 → 1.1.0, PATCH back to 0): new page, section or feature, a reworked part, a change in how the site works for players.
- **MAJOR**: never on your own – only when Gether says so.
- **No version** for: small text fixes (a name, nick, typo, wording), content (guides, events, monthly meta update, DB snapshot), docs, tests, tools, agents/skills.
- One task = one bump, in its last commit. When in doubt, PATCH. No leading zeros: 1.0.9 → 1.0.10.

## Steps

1. Current version: `git describe --tags --abbrev=0` and `frontend/src/app/core/version.ts`.
2. Set the new number in all three places:
   - `SITE_VERSION` in `frontend/src/app/core/version.ts`
   - `"version"` in `frontend/package.json`
   - the two `"version"` fields at the top of `frontend/package-lock.json` (otherwise `npm install` in the dev container rewrites them and leaves the file dirty)
3. `docs/backlog.md` → **Hotové**: add on top `- **D. M. RRRR – vX.Y.Z:** <one sentence in Slovak, what players get>` (or put the version into the task's existing line).
4. Check that all four numbers agree – `grep -n "SITE_VERSION =\|\"version\"" frontend/src/app/core/version.ts frontend/package.json; sed -n 3,9p frontend/package-lock.json | grep version` – and verify the task (skill `kd-verify`; the footer test checks the format).
5. Commit and push the commit **and its tag in the same push**:
   ```bash
   git add frontend/src/app/core/version.ts frontend/package.json frontend/package-lock.json docs/backlog.md <the task's files>
   git commit -m "Release vX.Y.Z: <what changed>"   # English, ends with the Co-Authored-By line
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
6. Tell Gether (in Slovak) which version it is now.
