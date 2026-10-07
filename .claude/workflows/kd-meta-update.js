export const meta = {
  name: 'kd-meta-update',
  description: 'Monthly KD 1035 meta update: research commanders, equipment and events, update backend/guides/meta, fact-check every change, push',
  whenToUse: 'Once a month (scheduled task) or on demand. args: {date: "YYYY-MM-DD" (required – today)}',
  phases: [
    { title: 'Research', detail: 'one researcher per meta module (commanders, equipment, events)' },
    { title: 'Update', detail: 'kd-builder edits backend/guides/meta and bumps VERIFIED' },
    { title: 'Fact-check', detail: 'kd-critic verifies every change against its source, then pushes' },
  ],
}

const DATE = args && args.date
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) return { error: 'pass args {date: "YYYY-MM-DD"} with today' }
const MONTH = DATE.slice(0, 7)
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

const MODULES = [
  { key: 'commanders', file: 'backend/guides/meta/commanders.py', topic: 'commander pairings (open field per troop type, leadership, garrison, rally, PvE, F2P, gathering)' },
  { key: 'equipment', file: 'backend/guides/meta/equipment.py', topic: 'equipment sets, accessories, crafting/Iconic/special-talent mechanics, F2P gear' },
  { key: 'events', file: 'backend/guides/meta/events.py', topic: 'recurring events (MGE, More Than Gems, Ark of Osiris, Sunset Canyon, Olympia, KvK phases …) – rules, scoring, strategy, recommended commanders' },
]

const SOURCES_NOTE = `Usable: allclash.com (newest, partly paywalled), official Lilith patch notes (rok-club.lilith.com, forum-global.lilithgame.com), app.rokstats.online, riseofkingdomsguides.com (many pages carry a bulk "Jan 2, 2026" date on old content – check the content), heaven-guardian.com / ldshop.gg (shop/SEO blogs – lower reliability), YouTube descriptions. Known bad: lootbar.com blog (invents item names). Unreachable so far: rokboom.com, rok.guide (503), rokhub.xyz, fandom (402), reddit.`

const RESEARCH = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['no_change', 'changes'] },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          guide_slug: { type: 'string', description: 'existing slug, or "new:<proposed-slug>" for a new guide' },
          change: { type: 'string', description: 'exactly what to change in the guide data' },
          evidence: { type: 'string', description: 'what the source says, paraphrased' },
          sources: { type: 'array', items: { type: 'string', description: 'URL (date)' } },
          confidence: { type: 'string', enum: ['high', 'medium'] },
        },
        required: ['guide_slug', 'change', 'evidence', 'sources', 'confidence'],
      },
    },
    dead_links: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['verdict', 'changes'],
}

const BUILD = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready_for_review', 'blocked'] },
    base_sha: { type: 'string' },
    summary: { type: 'string', description: 'per guide what changed, in Slovak' },
    skipped: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary'],
}

const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'changes_requested', 'reject'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, where: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' } },
        required: ['severity', 'problem'],
      },
    },
    pushed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'issues', 'summary'],
}

async function run(type, prompt, extra) {
  try {
    return await agent(prompt, { ...extra, agentType: type })
  } catch (error) {
    log(`${type}: custom agent type unavailable (${error.message}) – using the role file`)
    return agent(`Your role is defined in .claude/agents/${type}.md – read it first and follow it strictly.\n\n${prompt}`, extra)
  }
}

// ---------------------------------------------------------------------------------------------
phase('Research')
const research = await parallel(MODULES.map(m => () =>
  agent(
    `You keep the Rise of Kingdoms guides of the KD 1035 website current. Today's month: ${MONTH}.
Read ${m.file} (its VERIFIED value is the month of the last check; its GUIDES are the current content). Load WebSearch and WebFetch via ToolSearch ("select:WebSearch,WebFetch").
Research what changed in the meta of ${m.topic} since VERIFIED: new or reworked commanders/items/events, buffs and nerfs, shifted recommendations, wrong or outdated statements in the current guides, dead source links. ${m.key === 'events' ? 'If the module has few or no guides, propose the most useful missing event guides as new:<slug> entries with full facts.' : ''}
${SOURCES_NOTE}
Report only changes backed by a dated, reliable source (two independent sources for anything surprising). Paraphrase facts – the site never copies prose. If nothing relevant changed, return verdict "no_change". Do not edit any file.`,
    { label: `research:${m.key}`, phase: 'Research', schema: RESEARCH },
  ).then(r => r && { ...r, module: m.key, file: m.file }),
))
const found = research.filter(Boolean)
const missing = MODULES.filter(m => !found.some(r => r.module === m.key)).map(m => m.key)
if (missing.length) log(`research failed for: ${missing.join(', ')} – their VERIFIED month stays unchanged`)
const verifiedModules = found.map(r => r.module)
log(found.map(r => `${r.module}: ${r.verdict} (${r.changes.length})`).join(' · '))
if (!verifiedModules.length) return { error: 'all research agents failed' }

// ---------------------------------------------------------------------------------------------
phase('Update')
const brief = JSON.stringify(found, null, 2)
let build = await run(
  'kd-builder',
  `Monthly meta update of the KD 1035 guides (${MONTH}). Apply the researched changes below to the meta modules in backend/guides/meta/ – the database is never edited directly; \`sync_meta_guides\` writes the modules into it.
Rules:
- Write every changed or new text yourself in Slovak AND Czech (correct diacritics, short, no ballast), keep the existing data structure and block types (see backend/guides/meta/render.py), add/replace sources with their dates.
- Apply only changes with solid evidence; list anything you skip in "skipped" with the reason.
- Set VERIFIED = '${MONTH}' in ${verifiedModules.map(k => `backend/guides/meta/${k}.py`).join(', ')} (checked this month, even without changes). Do not bump modules whose research failed.
- Set LAST_UPDATE = '${DATE}' in backend/guides/meta/__init__.py (the site footer shows it as "Informácie aktualizované").
- New guides: unique slug, right CATEGORY module, first paragraph ≤ 160 chars (it is the excerpt), a ('note',) block, sources.
- Verify: \`docker compose -f docker-compose.dev.yml run --rm backend python manage.py test\`, then \`sh .githooks/dbsync.sh sync\` (or \`docker compose -f docker-compose.dev.yml exec backend python manage.py sync_meta_guides\`) and open a changed guide on http://localhost:4200 to check it renders.
- Commit locally ("Update RoK meta guides ${MONTH}", message ending with "${TRAILER}"); do not push.

Research results:
${brief}`,
  { label: 'update', phase: 'Update', schema: BUILD },
)
if (!build || build.status !== 'ready_for_review' || !build.base_sha) return { error: 'update blocked', build }
const base = build.base_sha

// ---------------------------------------------------------------------------------------------
phase('Fact-check')
let review = null
for (let round = 1; round <= 2; round++) {
  review = await run(
    'kd-critic',
    `Fact-check the monthly meta update of the KD 1035 guides: commits ${base}..HEAD (backend/guides/meta/*).
For EVERY changed or added claim (commander pair, item, stat value, event rule, number) open the cited source with WebFetch (load it via ToolSearch "select:WebFetch,WebSearch") and confirm the source really says it and is current. Unsupported or invented claims are blockers. Also check: texts are original (not copied prose), SK and CZ both correct, VERIFIED bumped only for researched modules, LAST_UPDATE = ${DATE}, tests pass (\`docker compose -f docker-compose.dev.yml run --rm backend python manage.py test\`).
Research brief the update was based on:
${brief}

Builder's report:
${JSON.stringify(build, null, 2)}

If and only if your verdict is "approve": push with \`git push origin main\` (if rejected because the remote moved: \`git pull --rebase origin main\`, re-run the backend tests, push again) and set pushed=true.${round === 2 ? '\nThis is the final round – anything short of approve drops the update.' : ''}`,
    { label: `fact-check#${round}`, phase: 'Fact-check', schema: REVIEW },
  )
  if (!review || review.verdict !== 'changes_requested' || round === 2) break
  build = await run(
    'kd-builder',
    `The fact-check of your meta update (base ${base}) requested changes. Fix every blocker and major issue – remove claims you cannot back with a source – re-run the checks and commit the fixes locally (do not push). Keep base_sha=${base}.

Review:
${JSON.stringify(review, null, 2)}`,
    { label: 'update:fix', phase: 'Fact-check', schema: BUILD },
  )
  if (!build || build.status !== 'ready_for_review') break
}

const shipped = Boolean(review && review.verdict === 'approve' && review.pushed)
if (!shipped) {
  await agent(
    `In the git repository in the current directory: run \`git stash push -u -m "kd-meta-update leftovers ${MONTH}"\` only if \`git status --porcelain\` is not empty, then \`git branch -f attempt/meta-${MONTH} HEAD\`, then \`git reset --hard ${base}\`. Do nothing else. Reply with the final \`git log --oneline -1\`.`,
    { label: 'archive', phase: 'Fact-check', effort: 'low' },
  )
}

return {
  month: MONTH,
  shipped,
  research: found.map(r => ({ module: r.module, verdict: r.verdict, changes: r.changes.length })),
  research_failed: missing,
  summary: (build && build.summary) || '',
  skipped: (build && build.skipped) || [],
  review: review ? { verdict: review.verdict, summary: review.summary, open_issues: review.issues.filter(i => i.severity !== 'minor') } : null,
  kept_on_branch: shipped ? null : `attempt/meta-${MONTH}`,
}
