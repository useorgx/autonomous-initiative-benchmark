import { replayClaims } from '../../runner/lib/calculation-replay.mjs';

// World D — Hard revenue reconciliation (cross-functional). Built to leave the
// cheap base model real headroom: a 6-trap arithmetic chain (duplicate row,
// two churned-but-listed accounts, an annual-contract ×12 trap, a superseded
// plan-upgrade row, a 50% promo credit, a $0 trial, and run-rate vs prorated
// for a mid-quarter start). One mistake fails the tight window, so single-pass
// reliability is < 1 — which is exactly where a GROUNDED verification pass can
// recover failures. Ground truth verified: ARR = $186,000.

const INVOICES = [
  { id: 'INV-01', customer: 'acme', plan: 'monthly', amount: 2000, status: 'active' },
  { id: 'INV-02', customer: 'acme', plan: 'monthly', amount: 2000, status: 'active', note: 'duplicate billing export row' },
  { id: 'INV-03', customer: 'beta', plan: 'monthly', amount: 1500, status: 'active' },
  { id: 'INV-04', customer: 'gamma', plan: 'annual', amount: 24000, status: 'active', note: 'annual contract value, paid upfront' },
  { id: 'INV-05', customer: 'delta', plan: 'monthly', amount: 3000, status: 'churned', note: 'cancelled Aug 12, still in export' },
  { id: 'INV-06', customer: 'epsilon', plan: 'monthly', amount: 1000, status: 'active' },
  { id: 'INV-07', customer: 'zeta', plan: 'annual', amount: 12000, status: 'active', note: 'annual contract value' },
  { id: 'INV-08', customer: 'eta', plan: 'monthly', amount: 2500, status: 'active', note: 'upgraded from 1500 to 2500 on Aug 1; this is the current rate' },
  { id: 'INV-09', customer: 'eta', plan: 'monthly', amount: 1500, status: 'active', note: 'pre-upgrade rate, superseded by INV-08' },
  { id: 'INV-10', customer: 'theta', plan: 'monthly', amount: 4000, status: 'active', note: '50% promotional credit applied through Q4 (net billed is half)' },
  { id: 'INV-11', customer: 'iota', plan: 'annual', amount: 18000, status: 'active', note: 'annual contract value' },
  { id: 'INV-12', customer: 'kappa', plan: 'monthly', amount: 800, status: 'active', note: 'started Sep 15 (mid-quarter)' },
  { id: 'INV-13', customer: 'lambda', plan: 'monthly', amount: 0, status: 'active', note: 'free trial' },
  { id: 'INV-14', customer: 'mu', plan: 'annual', amount: 6000, status: 'churned', note: 'cancelled, still in export' },
  { id: 'INV-15', customer: 'nu', plan: 'monthly', amount: 1200, status: 'active' },
];

const RULES = `RECOGNIZED ARR — DEFINITIONS
- ARR is a run-rate: active monthly recurring revenue x 12, plus the contract value of active annual contracts.
- Count each customer's CURRENT recurring amount once. Exclude duplicate export rows and superseded (pre-change) rows.
- Exclude churned/cancelled accounts even if still present in the export.
- Apply active promotional credits to the recognized amount (net, not gross).
- Annual contracts are counted at their annual contract value (do NOT multiply by 12).
- Run-rate counts a customer's full monthly amount regardless of mid-quarter start date (do not prorate).
- Free/$0 plans contribute $0.`;

const GROUND_TRUTH = { arr: 186000, window: 2000 };

// The universe of numbers a grounded derivation may legitimately cite: every raw
// invoice amount, the run-rate multiplier, the legitimate subtotals, and the
// answer. A number outside this set is a fabricated intermediate. Used by the
// deterministic evidence check (calculation_replay) so a correct ARR with a
// fabricated/empty derivation no longer passes.
const SUPPORTED_NUMBERS = [
  2000, 1500, 24000, 3000, 1000, 12000, 2500, 4000, 18000, 800, 0, 6000, 1200, // raw amounts
  12, // run-rate multiplier
  11000, 132000, 54000, // monthly-active subtotal, x12, annual subtotal
  186000, // the answer
];

export const world = {
  id: 'revenue-reconciliation-hard',
  domain: 'cross_functional',
  prompt: [
    'Compute recognized Q3 ARR (run-rate) from the billing export. The export is messy: it contains duplicates, churned accounts still listed, a superseded plan-change row, a promotional credit, a free trial, and a mid-quarter start. Read the ARR definitions and apply them exactly.',
    'Use the tools to pull the invoices and the ARR definitions, and use the compute tool to do the arithmetic. Then call submit with q3_arr (integer dollars) and a one-line derivation.',
  ].join('\n'),
  initState() { return { submission: null, queriedInvoices: false, usedCompute: false }; },
  tools: [
    { name: 'query_invoices', description: 'Return all Q3 invoice rows from the billing export.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedInvoices = true; return { invoices: INVOICES }; } },
    { name: 'get_arr_definitions', description: 'Return the recognized-ARR definitions and rules.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ rules: RULES }) },
    {
      name: 'compute', description: 'Evaluate an arithmetic expression. Returns the number.',
      parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false },
      handler: (args, s) => { s.usedCompute = true; const expr = String(args.expression || ''); if (!/^[\d+\-*/(). ]+$/.test(expr)) return { error: 'only arithmetic allowed' }; try { return { result: Function(`"use strict";return (${expr});`)() }; } catch { return { error: 'could not evaluate' }; } },
    },
    {
      name: 'submit', description: 'Submit the final ARR.',
      parameters: { type: 'object', properties: { q3_arr: { type: 'integer' }, derivation: { type: 'string' } }, required: ['q3_arr', 'derivation'], additionalProperties: false },
      terminal: true, handler: (args) => args,
    },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({
      received_draft: draft,
      instruction: 'Re-derive q3_arr from scratch by re-querying the invoices and recomputing with the compute tool. Check each trap explicitly: deduplicate acme; exclude the superseded eta row (keep only the current 2500 rate); exclude churned delta and mu; apply theta\'s 50% credit (count 2000 not 4000); count annual contracts at contract value (not x12); count kappa\'s full monthly amount (run-rate, no proration); count lambda as 0. Then submit — unchanged only if the recomputation matches.',
    });
  },
  validate({ terminal, state }) {
    const sub = terminal.submission ?? {};
    const arr = terminal.kind === 'escalate' ? null : Number(sub.q3_arr);
    const outcome = arr != null && Math.abs(arr - GROUND_TRUTH.arr) <= GROUND_TRUTH.window ? 1 : 0;
    const method = state.queriedInvoices && state.usedCompute ? 1 : 0;

    // EVIDENCE (output-of-work, deterministic): grade the derivation that was
    // always required but never read. A grounded derivation must (a) cite numbers
    // that trace to observed data and (b) actually SHOW THE WORK — at least a few
    // distinct component values, not just restate the answer. Closes the
    // "right scalar + fabricated/empty rationale = pass" loophole with no LLM judge.
    const replay = replayClaims(String(sub.derivation ?? ''), SUPPORTED_NUMBERS, { tolerance: 1 });
    const groundedComponents = new Set(replay.supportedValues.filter((v) => Math.abs(v - GROUND_TRUTH.arr) > GROUND_TRUTH.window)).size;
    const evidenceOk = replay.supportRate >= 0.6 && groundedComponents >= 3;
    const evidence = Number(replay.supportRate.toFixed(4));

    // trust/judgment/coordination are not independently trapped by this world — null,
    // never aliased to outcome.
    return {
      pass: outcome === 1 && evidenceOk,
      dimensions: { outcome, method, evidence, coordination: null, judgment: null, trust: null },
      detail: { arr, expectedArr: GROUND_TRUTH.arr, evidenceOk, groundedComponents, fabricatedValues: replay.fabricatedValues },
    };
  },
};
