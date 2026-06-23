// World (P1) — Reconciliation WORKBOOK in use.
//
// Unlike revenue-reconciliation (submit a number), here the deliverable is a
// WORK PRODUCT a controller must be able to APPLY: a per-customer workbook with
// the recognized annual amount, an include/exclude decision, and a reason. A
// deterministic downstream consumer ("controller posts the quarter close") then
// applies the workbook and the close is accepted only if it is CORRECT,
// INTERNALLY CONSISTENT, and AUDITABLE (every line traces to the real recognized
// amount). This catches "right total, wrong lines" — a workbook that nets to the
// correct ARR through compensating errors is NOT a usable reconciliation.
//
// Exposes a gold workbook + the no-artifact baseline so Normalized Artifact
// Utility can be computed: NAU = (cand - none) / (gold - none).

const INVOICES = [
  { id: 'INV-01', customer: 'acme', plan: 'monthly', amount: 2000, status: 'active' },
  { id: 'INV-02', customer: 'acme', plan: 'monthly', amount: 2000, status: 'active', note: 'duplicate export row' },
  { id: 'INV-03', customer: 'beta', plan: 'monthly', amount: 1500, status: 'active' },
  { id: 'INV-04', customer: 'gamma', plan: 'annual', amount: 24000, status: 'active' },
  { id: 'INV-05', customer: 'delta', plan: 'monthly', amount: 3000, status: 'churned' },
  { id: 'INV-06', customer: 'epsilon', plan: 'monthly', amount: 1000, status: 'active' },
  { id: 'INV-07', customer: 'zeta', plan: 'annual', amount: 12000, status: 'active' },
  { id: 'INV-08', customer: 'eta', plan: 'monthly', amount: 2500, status: 'active', note: 'current rate' },
  { id: 'INV-09', customer: 'eta', plan: 'monthly', amount: 1500, status: 'active', note: 'superseded' },
  { id: 'INV-10', customer: 'theta', plan: 'monthly', amount: 4000, status: 'active', note: '50% promo credit (net half)' },
  { id: 'INV-11', customer: 'iota', plan: 'annual', amount: 18000, status: 'active' },
  { id: 'INV-12', customer: 'kappa', plan: 'monthly', amount: 800, status: 'active', note: 'mid-quarter start' },
  { id: 'INV-13', customer: 'lambda', plan: 'monthly', amount: 0, status: 'active', note: 'free trial' },
  { id: 'INV-14', customer: 'mu', plan: 'annual', amount: 6000, status: 'churned' },
  { id: 'INV-15', customer: 'nu', plan: 'monthly', amount: 1200, status: 'active' },
];

// True recognized ANNUAL amount per included customer (run-rate; traps resolved).
const TRUE_RECOGNIZED = {
  acme: 24000, beta: 18000, gamma: 24000, epsilon: 12000, zeta: 12000,
  eta: 30000, theta: 24000, iota: 18000, kappa: 9600, nu: 14400,
};
const TRUTH = 186000;
const WINDOW = 2000;
const AMOUNT_TOL = 200;

// Deterministic downstream consumer: the controller applies the workbook to post
// the close. Accepted iff correct AND consistent AND auditable. Score in [0,1].
export function consumeWorkbook(wb) {
  const lines = Array.isArray(wb?.lines) ? wb.lines : [];
  const included = lines.filter((l) => l.included === true);
  const posted = included.reduce((s, l) => s + Number(l.annual_recognized ?? 0), 0);

  const correct = Math.abs(posted - TRUTH) <= WINDOW ? 1 : 0;
  const consistent = wb?.total_arr != null && Math.abs(Number(wb.total_arr) - posted) <= 1 ? 1 : 0;

  // Auditable: the included set is exactly the true set, no dup, every amount right.
  const inclCustomers = included.map((l) => String(l.customer));
  const inclSet = new Set(inclCustomers);
  const noDup = inclCustomers.length === inclSet.size ? 1 : 0;
  const trueSet = new Set(Object.keys(TRUE_RECOGNIZED));
  const sameSet = inclSet.size === trueSet.size && [...inclSet].every((c) => trueSet.has(c)) ? 1 : 0;
  const amountsRight = included.every((l) => trueSet.has(String(l.customer)) && Math.abs(Number(l.annual_recognized) - TRUE_RECOGNIZED[String(l.customer)]) <= AMOUNT_TOL) ? 1 : 0;
  const auditable = noDup && sameSet && amountsRight ? 1 : 0;

  const accepted = correct && consistent && auditable ? 1 : 0;
  // graded: full acceptance = 1; correct-but-unauditable (right number, unusable
  // workbook) = 0.3; otherwise 0.
  const score = accepted ? 1 : correct ? 0.3 : 0;
  return { posted, correct, consistent, auditable, accepted, score, residual: Math.abs(posted - TRUTH) };
}

// Gold (expert) workbook and the no-artifact baseline (a controller with only the
// raw messy export naively sums active rows → wrong → unaccepted → score 0).
export const GOLD_WORKBOOK = {
  total_arr: TRUTH,
  lines: Object.entries(TRUE_RECOGNIZED).map(([customer, annual_recognized]) => ({ customer, annual_recognized, included: true, reason: 'active recognized' })),
};
export const NO_ARTIFACT_SCORE = 0; // naive all-active-rows sum (252000) is wrong → unaccepted

export const world = {
  id: 'reconciliation-workbook-in-use',
  domain: 'cross_functional',
  prompt: [
    'Produce a quarter-close reconciliation WORKBOOK that the finance controller will apply to post Q3 ARR.',
    'Pull the messy billing export and the ARR rules. Output, via submit, a workbook: a line per recognized customer with { customer, annual_recognized, included, reason }, plus total_arr.',
    'The controller will APPLY your workbook: it is accepted only if the total is correct, internally consistent, and every line traces to the real recognized amount (no compensating errors). A right total with wrong lines is not a usable reconciliation.',
  ].join('\n'),
  initState() { return { queriedInvoices: false, queriedRules: false }; },
  tools: [
    { name: 'query_invoices', description: 'Return all Q3 invoice rows.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedInvoices = true; return { invoices: INVOICES }; } },
    {
      name: 'get_arr_rules', description: 'Return the recognized-ARR rules.', parameters: { type: 'object', properties: {}, additionalProperties: false },
      handler: (_a, s) => { s.queriedRules = true; return { rules: 'Run-rate: active monthly x12 + active annual at contract value. Dedup; drop superseded + churned; apply promo credits net; annual not x12; no proration; $0 trials = 0.' }; },
    },
    {
      name: 'submit', description: 'Submit the reconciliation workbook.',
      parameters: {
        type: 'object',
        properties: {
          total_arr: { type: 'number' },
          lines: { type: 'array', items: { type: 'object', properties: { customer: { type: 'string' }, annual_recognized: { type: 'number' }, included: { type: 'boolean' }, reason: { type: 'string' } }, required: ['customer', 'annual_recognized', 'included'] } },
          _confidence: { type: 'number' },
        },
        required: ['total_arr', 'lines'],
        additionalProperties: true,
      },
      terminal: true, handler: (args) => args,
    },
    { name: 'escalate', description: 'Escalate if the close cannot be produced.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (args) => args },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({ draft, instruction: 'Re-derive each line from the invoices; ensure the included set and every annual amount are correct, not just the total.' });
  },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') {
      return { pass: false, dimensions: { outcome: 0, artifact_valid: 0, evidence: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    }
    const ds = consumeWorkbook(terminal.submission ?? {});
    const method = state.queriedInvoices && state.queriedRules ? 1 : 0;
    return {
      // Mission success is defined by DOWNSTREAM USE, not by the scalar total.
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.correct, artifact_valid: ds.consistent, evidence: ds.auditable, downstream: ds.accepted, method },
      detail: { ...ds, normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
