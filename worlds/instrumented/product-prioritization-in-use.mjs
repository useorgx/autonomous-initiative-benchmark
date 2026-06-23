// Artifact-in-Use — PRODUCT domain. Deliverable: a prioritized backlog with a
// RICE-style score per item and a ranking. Downstream consumer: a deterministic
// checker recomputes each score from the stated sub-scores and verifies the
// ranking FOLLOWS FROM the numbers. A persuasive ranking that contradicts its
// own scoring (gut-feel dressed as analysis) is rejected — looks-right != usable.

const ITEMS = [
  { id: 'F1', reach: 8, impact: 9, effort: 3 }, // 24
  { id: 'F2', reach: 5, impact: 4, effort: 2 }, // 10
  { id: 'F3', reach: 9, impact: 6, effort: 9 }, // 6
  { id: 'F4', reach: 6, impact: 5, effort: 2 }, // 15
];
const score = (it) => Math.round((it.reach * it.impact) / it.effort);
const GOLD_ORDER = [...ITEMS].sort((a, b) => score(b) - score(a)).map((i) => i.id); // F1,F4,F2,F3

export function consumePrioritization(wb) {
  const items = Array.isArray(wb?.items) ? wb.items : [];
  const truthById = Object.fromEntries(ITEMS.map((i) => [i.id, score(i)]));
  // every item present with the correct recomputed score
  const scoresOk = ITEMS.every((t) => {
    const li = items.find((l) => l.id === t.id);
    return li && Number(li.score) === truthById[t.id];
  }) && items.length === ITEMS.length ? 1 : 0;
  // ranking must equal the descending order implied by the (true) scores
  const ranking = Array.isArray(wb?.ranking) ? wb.ranking.map(String) : [];
  const rankingOk = JSON.stringify(ranking) === JSON.stringify(GOLD_ORDER) ? 1 : 0;
  const accepted = scoresOk && rankingOk ? 1 : 0;
  return { accepted, score: accepted ? 1 : scoresOk ? 0.3 : 0, scoresOk, rankingOk, goldOrder: GOLD_ORDER };
}

export const GOLD_PRIORITIZATION = {
  items: ITEMS.map((i) => ({ id: i.id, reach: i.reach, impact: i.impact, effort: i.effort, score: score(i) })),
  ranking: GOLD_ORDER,
};
export const NO_ARTIFACT_SCORE = 0;

export const world = {
  id: 'product-prioritization-in-use',
  domain: 'product',
  prompt: [
    'Prioritize the backlog using RICE = round(reach * impact / effort). Pull the items, compute each score, and rank them.',
    'Submit { items:[{id,reach,impact,effort,score}], ranking:[ids high-to-low] }. Engineering will act on the ranking and reject it unless every score is correct AND the ranking follows from the scores (no gut-feel reordering).',
  ].join('\n'),
  initState() { return { readItems: false }; },
  tools: [
    { name: 'get_backlog', description: 'Return the backlog items with reach/impact/effort.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readItems = true; return { items: ITEMS, formula: 'RICE = round(reach*impact/effort)' }; } },
    { name: 'submit', description: 'Submit the prioritized backlog.', parameters: { type: 'object', properties: { items: { type: 'array' }, ranking: { type: 'array' }, _confidence: { type: 'number' } }, required: ['items', 'ranking'], additionalProperties: true }, terminal: true, handler: (a) => a },
    { name: 'escalate', description: 'Escalate if the backlog cannot be prioritized.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (a) => a },
  ],
  verificationPrompt(draft) { return JSON.stringify({ draft, instruction: 'recompute each RICE score and re-sort; the ranking must match the scores exactly.' }); },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') return { pass: false, dimensions: { outcome: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    const ds = consumePrioritization(terminal.submission ?? {});
    return {
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.scoresOk, coordination: ds.rankingOk, downstream: ds.accepted, method: state.readItems ? 1 : 0 },
      detail: { ...ds, normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
