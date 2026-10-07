export const meta = {
  name: 'kd-improve',
  description: 'KD 1035 web: kd-ideator proposes features, kd-critic filters them, kd-builder implements each, kd-critic reviews and pushes',
  whenToUse: 'An autonomous improvement round of the KD 1035 website. args: {features?: number (default 4), focus?: string, date?: "YYYY-MM-DD"}',
  phases: [
    { title: 'Ideate', detail: 'kd-ideator proposes ranked features' },
    { title: 'Critique', detail: 'kd-critic approves, revises or rejects and sets the build order' },
    { title: 'Build', detail: 'per feature: kd-builder implements → kd-critic reviews (max 2 fix rounds) → push' },
    { title: 'Backlog', detail: 'docs/backlog.md records built, deferred and rejected ideas' },
  ],
}

const opts = args || {}
const MAX_FEATURES = opts.features || 4
const FOCUS = opts.focus || ''
const DATE = opts.date || ''
const MAX_FIX_ROUNDS = 2
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

const IDEAS = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          title_sk: { type: 'string' },
          audience: { type: 'string' },
          user_value: { type: 'string' },
          spec: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          depends_on: { type: 'array', items: { type: 'string' } },
          needs_from_user: { type: 'array', items: { type: 'string' } },
          risks: { type: 'string' },
        },
        required: ['id', 'title', 'title_sk', 'user_value', 'spec', 'acceptance_criteria', 'effort'],
      },
    },
  },
  required: ['ideas'],
}

const CRITIQUE = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['approve', 'revise', 'reject'] },
          reasons: { type: 'string' },
          required_changes: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'verdict', 'reasons'],
      },
    },
    build_order: { type: 'array', items: { type: 'string' } },
  },
  required: ['reviews', 'build_order'],
}

const BUILD = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready_for_review', 'blocked'] },
    base_sha: { type: 'string' },
    summary: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    checks: { type: 'string' },
    needs_from_user: { type: 'array', items: { type: 'string' } },
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
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          where: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'problem'],
      },
    },
    pushed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'issues', 'summary'],
}

// Custom agent types live in .claude/agents/. If this session cannot resolve them, fall back to a
// general agent that loads the same role file.
async function run(type, prompt, extra) {
  try {
    return await agent(prompt, { ...extra, agentType: type })
  } catch (error) {
    log(`${type}: custom agent type unavailable (${error.message}) – using the role file`)
    return agent(`Your role is defined in .claude/agents/${type}.md – read it first and follow it strictly.\n\n${prompt}`, extra)
  }
}

// ---------------------------------------------------------------------------------------------
phase('Ideate')
const proposal = await run(
  'kd-ideator',
  `Propose 8–12 ranked ideas that move the KD 1035 website towards a genuinely usable product for players and leadership.
${FOCUS ? `Focus of this round (prioritise it, but keep obviously better ideas): ${FOCUS}\n` : ''}
Inventory the current state first (code, running site, docs/backlog.md). Each idea must be buildable in one sitting; split larger features into slices.`,
  { label: 'ideator', phase: 'Ideate', schema: IDEAS },
)
if (!proposal || !proposal.ideas.length) return { error: 'ideator returned nothing' }
const ideas = proposal.ideas
log(`${ideas.length} ideas: ${ideas.map(i => i.id).join(', ')}`)

// ---------------------------------------------------------------------------------------------
phase('Critique')
const critique = await run(
  'kd-critic',
  `Review these feature proposals for the KD 1035 website. Check the code where a claim needs verifying (does it already exist? is it feasible?).
Give a verdict for every idea, then a build_order of at most ${MAX_FEATURES} approved/revised ids to build now, in dependency order, best value first.

${JSON.stringify(ideas, null, 2)}`,
  { label: 'critic:ideas', phase: 'Critique', schema: CRITIQUE },
)
if (!critique) return { error: 'critic returned nothing', ideas }

const byId = Object.fromEntries(ideas.map(i => [i.id, i]))
const reviewOf = id => critique.reviews.find(r => r.id === id) || {}
const order = critique.build_order.filter(id => byId[id] && reviewOf(id).verdict !== 'reject').slice(0, MAX_FEATURES)
log(`build order: ${order.join(' → ') || '(nothing approved)'}`)

// ---------------------------------------------------------------------------------------------
// Sequential on purpose: one working tree, one dev stack, every feature builds on the pushed previous one.
phase('Build')
const outcomes = []
for (const id of order) {
  const spec = JSON.stringify({ ...byId[id], critic_required_changes: reviewOf(id).required_changes || [] }, null, 2)

  let build = await run(
    'kd-builder',
    `Implement this approved feature of the KD 1035 website end-to-end, verify it and commit it locally (do not push).

${spec}`,
    { label: `build:${id}`, phase: 'Build', schema: BUILD },
  )
  const base = build && build.base_sha
  let review = null

  if (build && build.status === 'ready_for_review' && base) {
    for (let round = 1; round <= MAX_FIX_ROUNDS + 1; round++) {
      const last = round === MAX_FIX_ROUNDS + 1
      review = await run(
        'kd-critic',
        `Review the implementation of this feature: commits ${base}..HEAD plus anything uncommitted.
Spec:
${spec}

Builder's report:
${JSON.stringify(build, null, 2)}

If and only if your verdict is "approve": push it with \`git push origin main\` (if the push is rejected because the remote moved: \`git pull --rebase origin main\`, re-run the backend tests, push again) and set pushed=true.
${last ? 'This is the final review round – there will be no further fixes, so anything short of approve means the attempt is dropped.' : ''}`,
        { label: `review:${id}#${round}`, phase: 'Build', schema: REVIEW },
      )
      if (!review || review.verdict !== 'changes_requested' || last) break

      build = await run(
        'kd-builder',
        `The critic requested changes to your implementation of this feature (base commit ${base}). Fix every blocker and major issue, re-run the checks and commit the fixes locally (do not push). Keep base_sha=${base} in your answer.

Spec:
${spec}

Review:
${JSON.stringify(review, null, 2)}`,
        { label: `fix:${id}#${round}`, phase: 'Build', schema: BUILD },
      )
      if (!build || build.status !== 'ready_for_review') break
    }
  }

  const shipped = Boolean(review && review.verdict === 'approve' && review.pushed)
  if (!shipped && base) {
    // keep the attempt on a local branch and return main to the last pushed state
    await agent(
      `In the git repository in the current directory: run \`git stash push -u -m "kd-improve leftovers: ${id}"\` only if \`git status --porcelain\` is not empty, then \`git branch -f attempt/${id} HEAD\`, then \`git reset --hard ${base}\`. Do nothing else. Reply with the final \`git log --oneline -1\`.`,
      { label: `archive:${id}`, phase: 'Build', effort: 'low' },
    )
  }
  outcomes.push({
    id,
    title_sk: byId[id].title_sk,
    outcome: shipped ? 'shipped' : build && build.status === 'blocked' ? 'blocked' : 'dropped',
    summary: (review && review.summary) || (build && build.summary) || 'agent failed',
    open_issues: review ? review.issues.filter(i => i.severity !== 'minor' || shipped) : [],
    needs_from_user: (build && build.needs_from_user) || [],
    kept_on_branch: !shipped && base ? `attempt/${id}` : null,
  })
  log(`${id}: ${outcomes[outcomes.length - 1].outcome}`)
}

// ---------------------------------------------------------------------------------------------
phase('Backlog')
const notBuilt = ideas
  .filter(i => !order.includes(i.id))
  .map(i => ({ id: i.id, title_sk: i.title_sk, effort: i.effort, user_value: i.user_value, needs_from_user: i.needs_from_user || [], review: reviewOf(i.id) }))
await agent(
  `Update docs/backlog.md of the KD 1035 repository (create it if missing). Write it in Slovak, short and scannable, no fluff. Keep existing entries; move items between sections when their status changed.
Sections: "Hotové" (shipped, with the date ${DATE || 'of today'}), "Čaká na Gethera" (everything any item needs from the user – credentials, texts, decisions), "Odložené" (approved or revised but not built yet, and dropped/blocked attempts with the reason and the local branch name), "Zamietnuté" (rejected with the one-line reason).
Then commit only that file with an English message ending with the line "${TRAILER}" and push to origin main (on rejection: git pull --rebase origin main, push again).

Results of this round:
${JSON.stringify({ built: outcomes, not_built: notBuilt }, null, 2)}`,
  { label: 'backlog', phase: 'Backlog', effort: 'low' },
)

return {
  shipped: outcomes.filter(o => o.outcome === 'shipped').map(o => `${o.title_sk}: ${o.summary}`),
  not_shipped: outcomes.filter(o => o.outcome !== 'shipped'),
  needs_from_user: [...new Set(outcomes.flatMap(o => o.needs_from_user))],
  rejected: critique.reviews.filter(r => r.verdict === 'reject').map(r => `${r.id}: ${r.reasons}`),
}
