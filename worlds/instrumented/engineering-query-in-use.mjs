// Artifact-in-Use — ENGINEERING domain. Deliverable: a structured query spec
// that answers a metric question. Downstream consumer: a deterministic query
// EXECUTOR runs the spec against the seeded dataset and checks the result —
// output verified by its EFFECT (SWE-bench-style), not by reading the query.
// A plausible spec with a wrong/missing filter returns the wrong number.

const ROWS = [
  { name: 'a', segment: 'enterprise', status: 'active', quarter: 'Q3', revenue: 50000 },
  { name: 'b', segment: 'enterprise', status: 'active', quarter: 'Q3', revenue: 30000 },
  { name: 'c', segment: 'enterprise', status: 'churned', quarter: 'Q3', revenue: 40000 }, // trap: churned
  { name: 'd', segment: 'smb', status: 'active', quarter: 'Q3', revenue: 10000 }, // trap: smb
  { name: 'e', segment: 'enterprise', status: 'active', quarter: 'Q2', revenue: 25000 }, // trap: Q2
  { name: 'f', segment: 'enterprise', status: 'active', quarter: 'Q3', revenue: 20000 },
];
const TRUTH = 100000; // active enterprise Q3: a+b+f

// Deterministic executor for the query spec.
export function runQuery(spec, rows = ROWS) {
  if (!spec || !Array.isArray(spec.filters) || !spec.metric) return { error: 'malformed spec', value: null };
  const matched = rows.filter((r) => spec.filters.every((f) => f && f.op === 'eq' && r[f.field] === f.value));
  const m = spec.metric;
  if (m.agg === 'count') return { value: matched.length, matched: matched.length };
  if (m.agg === 'sum') return { value: matched.reduce((s, r) => s + Number(r[m.field] ?? 0), 0), matched: matched.length };
  return { error: 'unknown agg', value: null };
}

export function consumeQuery(spec) {
  const r = runQuery(spec);
  const correct = r.value != null && r.value === TRUTH ? 1 : 0;
  return { accepted: correct, score: correct, value: r.value, expected: TRUTH, matched: r.matched };
}

export const GOLD_QUERY = {
  filters: [
    { field: 'segment', op: 'eq', value: 'enterprise' },
    { field: 'status', op: 'eq', value: 'active' },
    { field: 'quarter', op: 'eq', value: 'Q3' },
  ],
  metric: { agg: 'sum', field: 'revenue' },
};
export const NO_ARTIFACT_SCORE = 0;

export const world = {
  id: 'engineering-query-in-use',
  domain: 'engineering',
  prompt: [
    'Write a query SPEC that computes total revenue from ACTIVE ENTERPRISE accounts in Q3. The dataset has segment/status/quarter/revenue and contains churned, SMB, and prior-quarter rows.',
    'Submit { filters: [{field, op:"eq", value}], metric: {agg:"sum", field:"revenue"} }. The data team will EXECUTE your spec and accept it only if it returns the correct figure.',
  ].join('\n'),
  initState() { return { readSchema: false }; },
  tools: [
    { name: 'describe_table', description: 'Return the schema + a sample of rows.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readSchema = true; return { fields: ['name', 'segment', 'status', 'quarter', 'revenue'], sample: ROWS.slice(0, 3) }; } },
    { name: 'dry_run', description: 'Execute a candidate spec and return its value (for checking).', parameters: { type: 'object', properties: { spec: { type: 'object' } }, required: ['spec'], additionalProperties: false }, handler: (a) => runQuery(a.spec) },
    { name: 'submit', description: 'Submit the final query spec.', parameters: { type: 'object', properties: { filters: { type: 'array' }, metric: { type: 'object' }, _confidence: { type: 'number' } }, required: ['filters', 'metric'], additionalProperties: true }, terminal: true, handler: (a) => a },
    { name: 'escalate', description: 'Escalate if the query cannot be written.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (a) => a },
  ],
  verificationPrompt(draft) { return JSON.stringify({ draft, instruction: 'dry_run the spec and confirm the value before submitting; ensure churned/SMB/Q2 rows are excluded.' }); },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') return { pass: false, dimensions: { outcome: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    const ds = consumeQuery(terminal.submission ?? {});
    return {
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.accepted, downstream: ds.accepted, method: state.readSchema ? 1 : 0 },
      detail: { ...ds, normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
