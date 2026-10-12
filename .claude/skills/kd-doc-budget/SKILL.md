---
name: kd-doc-budget
description: Keep KD 1035's markdown files cheap to load – a size budget per kind of file (CLAUDE.md is loaded into every conversation and every agent), how to measure lines and tokens, and how to shrink a file without losing knowledge (split, rotate, point at the code). Use before adding to CLAUDE.md or a docs/*.md file, when a doc feels long, or when Gether asks to save tokens.
---

# Markdown size budget

CLAUDE.md already says why: "šetríme tokeny, tento súbor sa načítava do každej konverzácie aj každého agenta". This skill turns that into numbers and a procedure.

**One file = one read.** A doc an agent has to consult should arrive in a single Read with room left for the actual task. Docs are read far more often than they are written, so every oversized one taxes every future session.

## Budgets

| Tier | Files | Paid for | Budget |
|---|---|---|---|
| A | `CLAUDE.md` | every conversation and every agent | ≤ 250 lines / 6k tokens |
| B | `.claude/skills/*/SKILL.md`, `.claude/agents/*.md`, `.claude/kd-agents/*.md` | each time that skill or agent runs | ≤ 200 lines / 4k tokens |
| C | `docs/*.md`, `README.md` | when a task reads them | ≤ 400 lines / 10k tokens |
| D | append-only logs (e.g. **Hotové** in `docs/backlog.md`) | rarely, never whole | rotate, see below |

- Over budget = over **either** number. Lines mislead here – CLAUDE.md packs whole paragraphs into single lines – so tokens decide.
- **Watch at 80 %:** the next real addition splits the file instead of growing it. That is where the fix is cheap.
- **Hard stop at ~15k tokens** for anything read live: beyond that a file stops arriving in one Read, and an agent that pages or greps it misses things.
- **Known overruns (12. 10. 2026):** `CLAUDE.md` ~33 KB ≈ 8k+ tokens (over tier A), `docs/ucty.md` ~38 KB (at the tier C limit). Do not split them as a side effect of another task – propose the split to Gether as its own task. Until then, any addition there replaces or moves text rather than growing the file.

## Measure

```bash
wc -l -c CLAUDE.md README.md docs/*.md .claude/skills/*/SKILL.md .claude/agents/*.md
```

Tokens ≈ bytes ÷ 4. It is rough – and optimistic for Slovak and Czech – so treat anything within ~10 % of a limit as at the limit.

## Before you add to a doc

1. A rule for every task → CLAUDE.md, one line, dated with Gether's word like the existing lines. Detail of one area → that area's docs/*.md (CLAUDE.md already points there).
2. Measure the target. Would the addition cross its budget, or is it already past 80 %? Split first, then add.
3. Replace rather than append: a newer decision rewrites the old line instead of sitting next to it.

## When a file is over – in this order

1. **Split along a section** into a sibling file and leave a one-line pointer (`Detail: docs/<x>.md`). Keep the heading text so existing references still resolve.
2. **Rotate logs:** when the next entry would push the log past its budget, move the oldest entries to `docs/archive/<name>-<from>_<to>.md` and link the shard at the bottom of the live file.
3. **Point instead of paste:** code blocks and long how-it-works paragraphs become a path (`backend/accounts/guard.py`). The code is the truth; prose about it rots.
4. **Shipped plans become lean records:** keep goal, decisions and reasons; drop step-by-step build instructions (they are in git history).

**Never delete knowledge that is still true and still referenced.** Moving and pointing are lossless; cutting is not. Removing a rule from CLAUDE.md is Gether's decision, never a size fix.

## Marker for files near the limit (optional)

Under the title, so whoever opens the file to add to it sees the constraint:

```markdown
<!-- doc-size: tier C – budget 400 lines / 10k tokens – now 310 lines / 8.1k tokens (81 %) on 2026-10-12 – split rather than grow -->
```

Update the numbers and the date whenever you touch the file.
