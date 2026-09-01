// Native AutomationBench export consistency and paired-report layer.
// NOT an evaluator, runtime adapter, proof of provenance, or official submission.
import { createHash } from 'node:crypto';

export const SCHEMA = 'orgx.automationbench-comparison/v1';
const DOMAINS = new Set(['sales', 'marketing', 'operations', 'support', 'finance', 'hr']);
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const COST_KINDS = new Set(['primary', 'fallback', 'verification', 'retry', 'orchestration']);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const finite = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function validateManifest(m) {
  assert(m?.schema === SCHEMA, 'Unsupported manifest schema');
  assert(COMMIT.test(m.upstream_commit ?? ''), 'Pin the upstream commit');
  assert(m.split === 'public', 'This importer supports public results only, not official private scores');
  assert(typeof m.benchmark_version === 'string' && m.benchmark_version.length > 0, 'Pin benchmark_version');
  assert(['api', 'zapier', 'limited_zapier'].includes(m.toolset), 'Invalid toolset');
  assert(Number.isInteger(m.max_steps) && m.max_steps > 0, 'Invalid max_steps');
  assert(Number.isInteger(m.repetitions) && m.repetitions > 0, 'Invalid repetitions');
  assert(['harness_ablation', 'system_comparison'].includes(m.comparison_kind), 'Declare comparison_kind');
  assert(Array.isArray(m.tasks) && m.tasks.length > 0, 'Preregister a nonempty task cohort');
  assert(new Set(m.tasks.map(t => t.name)).size === m.tasks.length, 'Duplicate task in cohort');
  for (const t of m.tasks) {
    assert(typeof t.name === 'string' && t.name.length > 0, 'Task name required');
    assert(DOMAINS.has(t.domain), 'Invalid/scaffold domain; simple must be reported separately');
    assert(HEX.test(t.contract_sha256 ?? ''), `Task contract not pinned: ${t.name}`);
    assert(typeof t.contract_schema === 'string' && t.contract_schema, 'Task contract schema required');
    assert(Number.isInteger(t.assertions_total) && t.assertions_total > 0, 'Assertion count required');
    const excluded = t.excluded_indices ?? [];
    assert(Array.isArray(excluded) && new Set(excluded).size === excluded.length &&
      excluded.every(i => Number.isInteger(i) && i >= 0 && i < t.assertions_total) &&
      excluded.length < t.assertions_total, 'Invalid preregistered exclusions');
  }
  assert(Array.isArray(m.arms) && m.arms.length >= 2, 'At least two arms required');
  assert(new Set(m.arms.map(a => a.id)).size === m.arms.length, 'Duplicate arm');
  for (const a of m.arms) {
    assert(typeof a.id === 'string' && a.id && typeof a.model === 'string' && a.model, 'Arm/model required');
    assert(typeof a.reasoning_effort === 'string' && a.reasoning_effort, 'Pin effort; use not_applicable explicitly');
    assert(COMMIT.test(a.runtime_commit ?? ''), 'Pin each runtime commit');
    assert(Array.isArray(a.fallback_models) && a.fallback_models.every(x => typeof x === 'string' && x), 'Declare fallback_models, including []');
  }
  assert(m.arms.some(a => a.id === m.baseline_arm), 'Unknown baseline arm');
  if (m.comparison_kind === 'harness_ablation') {
    assert(new Set(m.arms.map(a => a.model)).size === 1, 'Harness ablation requires the same base model');
    assert(new Set(m.arms.map(a => a.reasoning_effort)).size === 1, 'Harness ablation requires equal effort');
    assert(m.arms.every(a => a.fallback_models.length === 0), 'Fallback systems belong in a separate system comparison');
  }
  return m;
}

function scoreRow(row, task) {
  if (!row) return { status: 'missing', pass: 0, partial: null };
  assert(row.task_contract_sha256 === task.contract_sha256 &&
    row.task_contract_schema === task.contract_schema, `Task contract mismatch: ${task.name}`);
  const results = row.assertion_results;
  if (!Array.isArray(results) || results.length === 0 || row.end_state == null) {
    assert(row.passed !== true, `Unverifiable success claim: ${task.name}`);
    return { status: 'unscored', pass: 0, partial: null };
  }
  assert(results.length === task.assertions_total, `Assertion count mismatch: ${task.name}`);
  const expectedExclusions = new Set(task.excluded_indices ?? []);
  results.forEach((r, i) => {
    assert(r && typeof r === 'object' && typeof r.passed === 'boolean', 'Assertions must contain Boolean passed');
    assert(r.excluded === undefined || typeof r.excluded === 'boolean', 'Invalid excluded flag');
    assert((r.excluded === true) === expectedExclusions.has(i), `Unregistered exclusion: ${task.name}/${i}`);
  });
  const scored = results.filter(r => !r.excluded);
  const successes = scored.filter(r => r.passed).length;
  const pass = Number(successes === scored.length);
  assert(row.passed === Boolean(pass), `Export passed disagrees with assertions: ${task.name}`);
  assert(row.assertions_total === scored.length && row.assertions_passed === successes,
    `Export assertion totals disagree: ${task.name}`);
  return { status: 'scored', pass, partial: successes / scored.length };
}

// Only an explicit all-in cost receipt enables cost comparisons. Native exports
// may omit fallback/verifier/outer-runtime costs. A hash binds bytes, not truth.
function costFor(receipt, arm, row, taskName) {
  if (!receipt || receipt.complete !== true || !Array.isArray(receipt.components) ||
      receipt.components.length === 0) return { total: null, fallbackCalls: null };
  assert(receipt.scope === 'all_model_calls_and_orchestration', 'Cost scope is incomplete');
  assert(HEX.test(receipt.usage_ledger_sha256 ?? ''), 'Bind an auditable usage ledger');
  let fallbackCalls = 0;
  for (const c of receipt.components) {
    assert(COST_KINDS.has(c.kind) && finite(c.usd), `Invalid cost component: ${taskName}`);
    if (c.kind !== 'orchestration') {
      assert(Number.isInteger(c.calls) && c.calls >= 0 && typeof c.model === 'string' && c.model, 'Invalid model-call ledger');
      if (c.kind === 'fallback') {
        assert(arm.fallback_models.includes(c.model), 'Undeclared fallback model');
        fallbackCalls += c.calls;
      } else if (c.kind === 'primary') {
        assert(c.model === arm.model, 'Primary cost model mismatch');
      }
    }
  }
  assert(receipt.components.some(c => c.kind === 'primary'), 'Primary cost component required');
  const total = receipt.components.reduce((s, c) => s + c.usd, 0);
  assert(!finite(row?.cost) || total + 1e-9 >= row.cost, 'All-in cost is below native export cost');
  return { total, fallbackCalls };
}

export function buildAutomationBenchReport(manifest, inputs) {
  const m = validateManifest(manifest);
  assert(Array.isArray(inputs), 'Inputs must be an array');
  const tasks = new Map(m.tasks.map(t => [t.name, t]));
  const arms = new Map(m.arms.map(a => [a.id, a]));
  const slots = new Map();
  for (const input of inputs) {
    const arm = arms.get(input.arm);
    assert(arm, 'Unknown input arm');
    assert(Number.isInteger(input.repetition) && input.repetition >= 1 && input.repetition <= m.repetitions, 'Unexpected repetition');
    const key = JSON.stringify([input.arm, input.repetition]);
    assert(!slots.has(key), 'Duplicate arm/repetition export');
    const { meta, tasks: rows } = input.data ?? {};
    assert(meta && Array.isArray(rows), 'Not a native AutomationBench export');
    for (const field of ['toolset', 'benchmark_version', 'max_steps']) {
      assert(meta[field] === m[field], `Metadata mismatch: ${field}`);
    }
    assert(meta.model === arm.model && (meta.reasoning_effort ?? 'not_applicable') === arm.reasoning_effort, 'Model/effort mismatch');
    assert(meta.total_tasks === rows.length, 'Native export task count mismatch');
    assert(Array.isArray(meta.domains) && meta.domains.length > 0 && meta.domains.every(d => DOMAINS.has(d)), 'Invalid export domains');
    assert(new Set(rows.map(r => r.name)).size === rows.length, 'Duplicate task row');
    assert(rows.every(r => tasks.has(r.name)), 'Unregistered task in export');
    const rowMap = new Map(rows.map(r => [r.name, r]));
    assert(rows.every(r => meta.domains.includes(tasks.get(r.name).domain)), 'Task/export domain mismatch');
    const costs = input.costs ?? {};
    assert(Object.keys(costs).every(name => tasks.has(name)), 'Unregistered cost receipt');
    slots.set(key, { rows: rowMap, costs });
  }
  const episodes = [];
  for (const arm of m.arms) for (let repetition = 1; repetition <= m.repetitions; repetition++) {
    const input = slots.get(JSON.stringify([arm.id, repetition]));
    for (const task of m.tasks) {
      const row = input?.rows.get(task.name);
      episodes.push({ arm: arm.id, repetition, task: task.name, domain: task.domain,
        ...scoreRow(row, task), ...costFor(input?.costs[task.name], arm, row, task.name) });
    }
  }
  const reportArms = m.arms.map(arm => {
    const es = episodes.filter(e => e.arm === arm.id);
    const success = es.reduce((n, e) => n + e.pass, 0);
    const scoredCount = es.filter(e => e.status === 'scored').length;
    const costComparable = es.every(e => e.total !== null);
    const totalCost = costComparable ? es.reduce((s, e) => s + e.total, 0) : null;
    const groups = m.tasks.map(t => es.filter(e => e.task === t.name));
    return { id: arm.id, model: arm.model, runtimeCommit: arm.runtime_commit,
      declaredFallbackModels: arm.fallback_models, plannedEpisodes: es.length,
      scoredEpisodes: scoredCount, missingEpisodes: es.filter(e => e.status === 'missing').length,
      unscoredEpisodes: es.filter(e => e.status === 'unscored').length, strictSuccesses: success,
      strictPassRate: success / es.length, rateIsLowerBound: scoredCount !== es.length,
      partialCreditDiagnostic: scoredCount ? mean(es.filter(e => e.status === 'scored').map(e => e.partial)) : null,
      atLeastOneSuccessPerTask: mean(groups.map(g => Number(g.some(e => e.pass === 1)))),
      allRepetitionsSuccessfulPerTask: mean(groups.map(g => Number(g.every(e => e.pass === 1)))),
      costComparable, accountedFallbackCalls: es.every(e => e.fallbackCalls !== null) ? es.reduce((s, e) => s + e.fallbackCalls, 0) : null,
      allInCostUsd: totalCost, costPerStrictSuccessUsd: costComparable && success > 0 ? totalCost / success : null,
      knownCostLowerBoundUsd: es.reduce((s, e) => s + (e.total ?? 0), 0),
      domainResults: Object.fromEntries([...new Set(m.tasks.map(t => t.domain))].map(domain => {
        const ds = es.filter(e => e.domain === domain);
        return [domain, { planned: ds.length, strictSuccesses: ds.reduce((s, e) => s + e.pass, 0),
          strictPassRate: mean(ds.map(e => e.pass)), scored: ds.filter(e => e.status === 'scored').length }];
      })) };
  });
  const baseline = episodes.filter(e => e.arm === m.baseline_arm);
  const comparisons = m.arms.filter(a => a.id !== m.baseline_arm).map(arm => {
    const es = episodes.filter(e => e.arm === arm.id);
    const diffs = es.map((e, i) => e.pass - baseline[i].pass);
    const complete = es.every((e, i) => e.status === 'scored' && baseline[i].status === 'scored');
    return { baseline: m.baseline_arm, arm: arm.id, completePairs: complete,
      pairedWins: diffs.filter(d => d === 1).length, pairedLosses: diffs.filter(d => d === -1).length,
      pairedTies: diffs.filter(d => d === 0).length,
      observedDeltaWithLossesAsZero: mean(diffs),
      // A difference of two lower bounds is NOT a bound on the treatment effect.
      strictSuccessDelta: complete ? mean(diffs) : null,
      confidenceInterval: null, inferenceStatus: 'descriptive_only; preregister task-cluster inference separately' };
  });
  return { schema: SCHEMA, benchmark: 'AutomationBench', upstreamCommit: m.upstream_commit,
    benchmarkVersion: m.benchmark_version, split: m.split, toolset: m.toolset,
    comparisonKind: m.comparison_kind, officialLeaderboardComparable: false, headlineEligible: false,
    evidenceLevel: 'native_export_consistency_only',
    caveat: 'Not a live OrgX run or independent regrade. Export hashes bind bytes, not provenance. Missing/unscored episodes remain in the denominator. Public results cannot be compared to private leaderboard scores.',
    arms: reportArms, comparisons };
}
