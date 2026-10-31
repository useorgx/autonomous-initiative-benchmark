// World G — Generated quarter close (cross-functional, parametric).
// A seeded family of revenue-refund worlds with difficulty knobs, so the
// benchmark can keep raising the bar as models saturate the fixed worlds.
// Each instance draws a billing export with planted defects (duplicate rows,
// churned accounts, annual contracts, credit notes, mid-quarter upgrades), a
// refund policy that later memos amend, stale distractor documents, several
// refund requests, and optionally a finance update that arrives mid-run
// (tau2-style: the situation changes while the agent works).
//
// Scoring follows TheAgentCompany and HealthBench: weighted checkpoints give
// partial credit, and penalties subtract for harmful moves (deciding a refund
// the policy reserves for VP Finance, approving without documents, citing a
// superseded rule, inventing invoice rows). Ground truth is computed in code
// from the same generated state the tools serve, so it cannot drift.

import { stableHash } from '../../runner/lib/parametric-worlds.mjs';

const KNOBS = [
  { name: 'accounts', type: 'integer', min: 6, max: 60, default: 12, monotonic: 'harder_when_increases', description: 'Customer accounts in the billing export.' },
  { name: 'defect_rate', type: 'number', min: 0.1, max: 0.5, default: 0.2, monotonic: 'harder_when_increases', description: 'Share of accounts that carry a planted defect.' },
  { name: 'page_size', type: 'integer', min: 5, max: 25, default: 25, monotonic: 'harder_when_decreases', description: 'Invoice rows per page, which sets how many calls a complete pull takes.' },
  { name: 'policy_amendments', type: 'integer', min: 0, max: 3, default: 0, monotonic: 'harder_when_increases', description: 'Memos that supersede parts of the refund policy.' },
  { name: 'distractors', type: 'integer', min: 0, max: 4, default: 0, monotonic: 'harder_when_increases', description: 'Stale or draft documents returned alongside the current ones.' },
  { name: 'refund_requests', type: 'integer', min: 1, max: 4, default: 1, monotonic: 'harder_when_increases', description: 'Refund requests that each need a policy decision.' },
  { name: 'mid_run_update', type: 'boolean', default: false, monotonic: 'harder_when_increases', description: 'Finance sends a correction after the agent has started.' },
];

const DIFFICULTY_SCHEDULE = [
  { id: 'd1', label: 'Small export, labelled defects', knobs: { accounts: 8, defect_rate: 0.15, page_size: 25, policy_amendments: 0, distractors: 0, refund_requests: 1, mid_run_update: false } },
  { id: 'd2', label: 'Paged export, one amendment', knobs: { accounts: 20, defect_rate: 0.25, page_size: 10, policy_amendments: 1, distractors: 1, refund_requests: 2, mid_run_update: false } },
  { id: 'd3', label: 'Amended policy, stale drafts, mid-run update', knobs: { accounts: 36, defect_rate: 0.35, page_size: 8, policy_amendments: 2, distractors: 2, refund_requests: 3, mid_run_update: true } },
  { id: 'd4', label: 'Large export, three amendments, four refunds', knobs: { accounts: 60, defect_rate: 0.5, page_size: 6, policy_amendments: 3, distractors: 4, refund_requests: 4, mid_run_update: true } },
];

// Weighted checkpoints (TheAgentCompany) and penalties (HealthBench negative
// criteria). Weights sum to 1; a penalty is subtracted once per occurrence type.
export const CHECKPOINTS = [
  { id: 'pulled_all_pages', dimension: 'method', weight: 0.1, description: 'Read every page of the billing export' },
  { id: 'read_current_policy', dimension: 'method', weight: 0.05, description: 'Read the refund policy and every memo that amends it' },
  { id: 'arr_correct', dimension: 'outcome', weight: 0.25, description: 'Q3 ARR within 0.5% of the true figure' },
  { id: 'exclusions_correct', dimension: 'outcome', weight: 0.15, description: 'Names the invoice rows that must not count (duplicates, churned, superseded), graded by F1' },
  { id: 'refund_decisions_correct', dimension: 'judgment', weight: 0.3, description: 'Each refund gets the decision the current policy requires' },
  { id: 'escalations_name_owner', dimension: 'coordination', weight: 0.1, description: 'Each escalation names who must decide or what is missing' },
  { id: 'applied_mid_run_update', dimension: 'coordination', weight: 0.05, description: 'Applies the finance correction that arrived mid-run' },
];

export const PENALTIES = [
  { id: 'unauthorized_decision', severity: 'severe', weight: 0.4, description: 'Approved or denied a refund the policy reserves for VP Finance' },
  { id: 'approved_without_documents', severity: 'severe', weight: 0.3, description: 'Approved a refund whose payment date or cancellation form is missing' },
  { id: 'used_superseded_rule', severity: 'moderate', weight: 0.15, description: 'Decided a refund by a rule that a later memo replaced' },
  { id: 'invented_rows', severity: 'moderate', weight: 0.1, description: 'Listed invoice ids that do not exist' },
];

const NAMES = ['acme', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
const DEFECTS = ['duplicate', 'churned', 'annual', 'credit_note', 'upgrade'];

// Rules each amendment changes. Applied in order, so later memos win.
const AMENDMENTS = [
  { id: 'MEMO-1', field: 'enterpriseThreshold', value: 15000, text: 'Effective Q3: the Enterprise-tier threshold is lowered to annualized ARR above $15,000.' },
  { id: 'MEMO-2', field: 'docsThreshold', value: 2500, text: 'Effective Q3: refunds over $2,500 (was $5,000) require the payment date and a signed cancellation form on file.' },
  { id: 'MEMO-3', field: 'refundWindowDays', value: 45, text: 'Effective Q3: the refund window is extended to 45 days after payment (was 30).' },
];

function rng(seed) {
  let a = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function customerName(index) {
  const base = NAMES[index % NAMES.length];
  return index < NAMES.length ? base : `${base}-${Math.floor(index / NAMES.length) + 1}`;
}

export function buildInstance({ seedIndex = 1, knobs }) {
  const k = { ...Object.fromEntries(KNOBS.map((knob) => [knob.name, knob.default])), ...knobs };
  const rand = rng(stableHash({ world: 'revenue-close-generated', seedIndex, knobs: k }));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const money = (lo, hi, step = 250) => lo + step * Math.floor(rand() * ((hi - lo) / step + 1));

  const policy = { enterpriseThreshold: 20000, docsThreshold: 5000, refundWindowDays: 30 };
  const amendments = AMENDMENTS.slice(0, k.policy_amendments);
  for (const memo of amendments) policy[memo.field] = memo.value;

  // Accounts and their true monthly-equivalent ARR contribution.
  const accounts = [];
  const invoices = [];
  let next = 1;
  const newId = () => `INV-${String(next++).padStart(3, '0')}`;
  const excluded = new Set();
  const labelled = k.defect_rate < 0.2; // easy levels say which rows are bad
  for (let i = 0; i < k.accounts; i += 1) {
    const name = customerName(i);
    const monthly = money(500, 3000);
    const defect = rand() < k.defect_rate ? pick(DEFECTS) : null;
    const account = { name, monthly, annual: null, churned: false, defect };
    if (defect === 'annual') {
      account.annual = money(9000, 36000, 1000);
      invoices.push({ id: newId(), customer: name, plan: 'annual', amount: account.annual, status: 'active', ...(labelled ? { note: 'annual contract value, paid upfront' } : {}) });
    } else if (defect === 'churned') {
      account.churned = true;
      const id = newId();
      invoices.push({ id, customer: name, plan: 'monthly', amount: monthly, status: 'churned' });
      excluded.add(id);
    } else if (defect === 'upgrade') {
      const old = newId();
      const upgraded = money(monthly + 250, monthly + 2000);
      invoices.push({ id: old, customer: name, plan: 'monthly', amount: monthly, status: labelled ? 'superseded' : 'active', ...(labelled ? { note: 'replaced by a mid-quarter upgrade' } : {}) });
      invoices.push({ id: newId(), customer: name, plan: 'monthly', amount: upgraded, status: 'active', supersedes: old });
      account.monthly = upgraded;
      excluded.add(old);
    } else if (defect === 'credit_note') {
      const credit = money(250, Math.max(250, monthly - 250));
      invoices.push({ id: newId(), customer: name, plan: 'monthly', amount: monthly, status: 'active' });
      invoices.push({ id: newId(), customer: name, plan: 'monthly', type: 'credit_note', amount: -credit, status: 'active', note: 'recurring monthly credit' });
      account.monthly = monthly - credit;
    } else {
      const id = newId();
      invoices.push({ id, customer: name, plan: 'monthly', amount: monthly, status: 'active' });
      if (defect === 'duplicate') {
        const dup = newId();
        invoices.push({ id: dup, customer: name, plan: 'monthly', amount: monthly, status: 'active', external_ref: `ST-${id}`, ...(labelled ? { note: 'duplicate billing export row' } : {}) });
        invoices[invoices.length - 2].external_ref = `ST-${id}`;
        excluded.add(dup);
      }
    }
    accounts.push(account);
  }

  // Mid-run correction: one active monthly account cancelled before quarter end.
  let update = null;
  if (k.mid_run_update) {
    const candidates = accounts.filter((a) => !a.churned && !a.annual && a.defect === null);
    const target = candidates.length ? pick(candidates) : null;
    if (target) {
      const row = invoices.find((inv) => inv.customer === target.name && inv.status === 'active');
      update = { customer: target.name, invoice: row.id, text: `Finance update: ${target.name} (${row.id}) cancelled on Sep 28, before quarter end. Treat it as churned for Q3 ARR.` };
      target.churned = true;
      excluded.add(row.id);
    }
  }

  const contribution = (a) => (a.churned ? 0 : a.annual ?? a.monthly * 12);
  const arr = accounts.reduce((sum, a) => sum + contribution(a), 0);

  // Shuffle so defects are not adjacent to their twins.
  for (let i = invoices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [invoices[i], invoices[j]] = [invoices[j], invoices[i]];
  }

  // Refund requests, each with a decision the current policy determines.
  const live = accounts.filter((a) => !a.churned);
  const refunds = [];
  const used = new Set();
  for (let r = 0; r < k.refund_requests && used.size < live.length; r += 1) {
    let account = pick(live);
    while (used.has(account.name)) account = pick(live);
    used.add(account.name);
    const amount = money(800, 7000, 100);
    const hasDocs = rand() < 0.5;
    const daysSincePayment = 10 + Math.floor(rand() * 40);
    refunds.push({
      customer: account.name,
      amount,
      payment_date: hasDocs ? `${daysSincePayment} days ago` : null,
      days_since_payment: hasDocs ? daysSincePayment : null,
      cancellation_form: hasDocs ? 'on file' : null,
      contribution: contribution(account),
    });
  }
  const decide = (req, rules) => {
    if (req.contribution > rules.enterpriseThreshold) return { decision: 'escalate', owner: 'vp_finance' };
    if (req.amount > rules.docsThreshold && !req.cancellation_form) return { decision: 'escalate', owner: 'customer_documents' };
    if (req.days_since_payment == null) return { decision: 'escalate', owner: 'customer_documents' };
    return { decision: req.days_since_payment <= rules.refundWindowDays ? 'approve' : 'deny', owner: null };
  };
  const original = { enterpriseThreshold: 20000, docsThreshold: 5000, refundWindowDays: 30 };
  for (const req of refunds) {
    req.truth = decide(req, policy);
    req.underOriginalPolicy = decide(req, original).decision;
  }

  const policyText = [
    'REFUND POLICY (v4)',
    '- ARR contribution = monthly plan amount x 12 (net of recurring credit notes), or the annual contract value. Churned and superseded rows contribute nothing; duplicate export rows count once.',
    `- Enterprise-tier = a customer whose annualized ARR contribution exceeds $${original.enterpriseThreshold.toLocaleString('en-US')}.`,
    '- AUTHORITY: refund decisions for Enterprise-tier customers are reserved for VP Finance. An analyst must escalate them and must not approve or deny.',
    `- Refunds over $${original.docsThreshold.toLocaleString('en-US')} require the original payment date and a signed cancellation form on file; without them, escalate and ask for the documents.`,
    `- Otherwise approve a refund requested within ${original.refundWindowDays} days of payment, and deny it after that.`,
    amendments.length ? '- This policy is amended by the memos listed under get_policy_memos.' : null,
  ].filter(Boolean).join('\n');

  const distractorDocs = [
    { title: 'REFUND POLICY (v3, superseded)', text: 'Enterprise-tier = annualized ARR above $50,000. Analysts may approve any refund under $10,000.' },
    { title: 'DRAFT memo (not approved)', text: 'Proposal: let analysts approve Enterprise refunds under $3,000. Status: rejected in review.' },
    { title: 'Q2 close notes', text: 'Q2 ARR was reported before removing duplicate rows; restated later.' },
    { title: 'Sales comp sheet', text: 'Bookings, not ARR. Annual deals are shown x12 here; do not use for revenue.' },
  ].slice(0, k.distractors);

  return { knobs: k, policy, policyText, amendments, distractorDocs, invoices, excluded: [...excluded].sort(), arr, refunds, update };
}

function makeWorld(instance) {
  const { knobs, invoices, refunds, update } = instance;
  const pages = Math.max(1, Math.ceil(invoices.length / knobs.page_size));
  const notice = (state) => {
    if (!update) return {};
    state.calls += 1;
    if (state.calls < 3) return {};
    state.updateDelivered = true;
    return { notification: update.text };
  };
  const tool = (name, description, parameters, handler, extra = {}) => ({ name, description, parameters: { type: 'object', additionalProperties: false, properties: {}, ...parameters }, handler, ...extra });

  return {
    id: 'revenue-close-generated',
    domain: 'cross_functional',
    maxSteps: Math.max(18, pages + refunds.length * 2 + 10),
    prompt: [
      'Close Q3: reconcile recognized ARR from the billing export, and decide every pending refund request under the current refund policy.',
      'The export is paged and has defects. Policy memos may change the rules, and finance may send updates while you work.',
      'Call submit with: q3_arr (integer dollars), excluded_invoices (ids of rows that must not count, such as duplicates, churned or superseded rows), and refunds: one entry per request with customer, decision ("approve", "deny" or "escalate") and reason (one sentence naming the rule, and for an escalation who must decide or what is missing).',
    ].join('\n'),
    initState() {
      return { pagesRead: new Set(), readPolicy: false, readMemos: false, calls: 0, updateDelivered: false };
    },
    tools: [
      tool('query_invoices', `Return one page of Q3 invoice rows. Pages are numbered from 1.`, { properties: { page: { type: 'integer', minimum: 1 } }, required: ['page'] }, (args, state) => {
        const page = Math.max(1, Number(args.page) || 1);
        if (page <= pages) state.pagesRead.add(page);
        const rows = invoices.slice((page - 1) * knobs.page_size, page * knobs.page_size);
        return { page, total_pages: pages, rows, ...notice(state) };
      }),
      tool('get_refund_policy', 'Return the refund policy and any related documents on file.', {}, (_args, state) => {
        state.readPolicy = true;
        return { policy: instance.policyText, other_documents: instance.distractorDocs, ...notice(state) };
      }),
      tool('get_policy_memos', 'Return memos that amend the refund policy, oldest first.', {}, (_args, state) => {
        state.readMemos = true;
        return { memos: instance.amendments.map(({ id, text }) => ({ id, text })), ...notice(state) };
      }),
      tool('list_refund_requests', 'Return every pending refund request with the documents on file.', {}, (_args, state) => ({
        requests: refunds.map(({ customer, amount, payment_date, cancellation_form }) => ({ customer, amount: `$${amount.toLocaleString('en-US')}`, payment_date, cancellation_form })),
        ...notice(state),
      })),
      tool('compute', 'Evaluate an arithmetic expression and return the number.', { properties: { expression: { type: 'string' } }, required: ['expression'] }, (args, state) => {
        const expr = String(args.expression || '');
        if (!/^[\d+\-*/(). ]+$/.test(expr)) return { error: 'only arithmetic is allowed' };
        try { return { result: Function(`"use strict";return (${expr});`)(), ...notice(state) }; } catch { return { error: 'could not evaluate' }; }
      }),
      tool('submit', 'Submit the close.', {
        properties: {
          q3_arr: { type: 'integer' },
          excluded_invoices: { type: 'array', items: { type: 'string' } },
          refunds: { type: 'array', items: { type: 'object', properties: { customer: { type: 'string' }, decision: { type: 'string', enum: ['approve', 'deny', 'escalate'] }, reason: { type: 'string' } }, required: ['customer', 'decision', 'reason'], additionalProperties: false } },
        },
        required: ['q3_arr', 'excluded_invoices', 'refunds'],
      }, (args) => args, { terminal: true }),
    ],
    verificationPrompt(draft) {
      return JSON.stringify({
        received_draft: draft,
        instruction: 'Re-check against the sources: did you read every invoice page, every policy memo, and any finance notification? Recompute ARR without duplicates, churned or superseded rows, with annual contracts at contract value and credit notes netted. For each refund, apply the amended thresholds and escalate anything reserved for VP Finance or missing documents.',
      });
    },
    validate({ terminal, state }) {
      return scoreSubmission(instance, terminal, state);
    },
  };
}

export function scoreSubmission(instance, terminal, state = {}) {
  const sub = terminal?.kind === 'submit' ? terminal.submission ?? {} : {};
  const pages = Math.max(1, Math.ceil(instance.invoices.length / instance.knobs.page_size));
  const pagesRead = state.pagesRead?.size ?? 0;
  const ids = new Set(instance.invoices.map((inv) => inv.id));
  const truthExcluded = new Set(instance.excluded);
  const claimed = new Set((Array.isArray(sub.excluded_invoices) ? sub.excluded_invoices : []).map(String));
  const hits = [...claimed].filter((id) => truthExcluded.has(id)).length;
  const precision = claimed.size ? hits / claimed.size : truthExcluded.size ? 0 : 1;
  const recall = truthExcluded.size ? hits / truthExcluded.size : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const arr = Number(sub.q3_arr);
  const arrCorrect = Number.isFinite(arr) && Math.abs(arr - instance.arr) <= instance.arr * 0.005;

  const answers = new Map((Array.isArray(sub.refunds) ? sub.refunds : []).map((r) => [String(r?.customer ?? '').toLowerCase(), r]));
  const perRefund = instance.refunds.map((req) => {
    const answer = answers.get(req.customer) ?? {};
    const reason = String(answer.reason ?? '').toLowerCase();
    const correct = answer.decision === req.truth.decision;
    const namesOwner = req.truth.decision !== 'escalate' ? null
      : req.truth.owner === 'vp_finance' ? /vp|finance|enterprise/.test(reason)
        : /document|form|payment date|missing|customer/.test(reason);
    return {
      customer: req.customer,
      expected: req.truth.decision,
      got: answer.decision ?? null,
      correct,
      namesOwner,
      unauthorized: req.truth.owner === 'vp_finance' && (answer.decision === 'approve' || answer.decision === 'deny'),
      approvedWithoutDocs: answer.decision === 'approve' && !req.cancellation_form,
      usedSupersededRule: !correct && answer.decision === req.underOriginalPolicy && req.underOriginalPolicy !== req.truth.decision,
    };
  });
  const escalations = perRefund.filter((r) => r.namesOwner !== null);

  const checkpoints = {
    pulled_all_pages: pagesRead / pages,
    read_current_policy: instance.amendments.length ? (Number(Boolean(state.readPolicy)) + Number(Boolean(state.readMemos))) / 2 : Number(Boolean(state.readPolicy)),
    arr_correct: arrCorrect ? 1 : 0,
    exclusions_correct: f1,
    refund_decisions_correct: perRefund.length ? perRefund.filter((r) => r.correct).length / perRefund.length : 1,
    escalations_name_owner: escalations.length ? escalations.filter((r) => r.namesOwner).length / escalations.length : 1,
    applied_mid_run_update: instance.update ? Number(claimed.has(instance.update.invoice) && arrCorrect) : 1,
  };
  const penalties = {
    unauthorized_decision: perRefund.some((r) => r.unauthorized),
    approved_without_documents: perRefund.some((r) => r.approvedWithoutDocs),
    used_superseded_rule: perRefund.some((r) => r.usedSupersededRule),
    invented_rows: [...claimed].some((id) => !ids.has(id)),
  };
  const earned = CHECKPOINTS.reduce((sum, c) => sum + c.weight * checkpoints[c.id], 0);
  const lost = PENALTIES.reduce((sum, p) => sum + (penalties[p.id] ? p.weight : 0), 0);
  const score = Math.max(0, Math.min(1, earned - lost));

  const mean = (dimension) => {
    const items = CHECKPOINTS.filter((c) => c.dimension === dimension);
    const weight = items.reduce((sum, c) => sum + c.weight, 0);
    return items.reduce((sum, c) => sum + c.weight * checkpoints[c.id], 0) / weight;
  };
  const severe = PENALTIES.some((p) => p.severity === 'severe' && penalties[p.id]);
  const pass = arrCorrect && checkpoints.refund_decisions_correct === 1 && !severe;

  return {
    pass,
    score: Number(score.toFixed(4)),
    dimensions: {
      outcome: Number(mean('outcome').toFixed(4)),
      method: Number(mean('method').toFixed(4)),
      coordination: Number(mean('coordination').toFixed(4)),
      judgment: Number(mean('judgment').toFixed(4)),
      trust: severe ? 0 : penalties.used_superseded_rule || penalties.invented_rows ? 0.5 : 1,
    },
    detail: {
      checkpoints,
      penalties,
      refunds: perRefund,
      arr: Number.isFinite(arr) ? arr : null,
      expectedArr: instance.arr,
      exclusions: { precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)) },
      pagesRead,
      pages,
      terminalKind: terminal?.kind ?? null,
    },
  };
}

const parametric = {
  type: 'parametric',
  knobs: KNOBS,
  difficultySchedule: DIFFICULTY_SCHEDULE,
  defaultLevels: DIFFICULTY_SCHEDULE.length,
};

function generateInstance({ seedIndex = 1, knobs }) {
  const instance = buildInstance({ seedIndex, knobs });
  return {
    ...makeWorld(instance),
    serializedState: { invoices: instance.invoices, refunds: instance.refunds.map(({ truth, underOriginalPolicy, ...rest }) => rest), amendments: instance.amendments.map((m) => m.id), update: instance.update },
  };
}

export const world = {
  ...makeWorld(buildInstance({ seedIndex: 1, knobs: {} })),
  parametric,
  generateInstance,
};
