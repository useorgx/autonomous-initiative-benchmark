import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCHEMA, buildAutomationBenchReport as report, sha256 } from './automationbench-report.mjs';
import { compareFromFile } from '../compare-automationbench.mjs';

const COMMIT = 'c'.repeat(40);
const CONTRACT = 'b'.repeat(64);

function task(name = 'sales.fixture', domain = 'sales') {
  return {
    name,
    domain,
    contract_schema: 'automationbench.task-contract.v1',
    contract_sha256: CONTRACT,
    assertions_total: 2,
    exclusion_policy: {
      explicit_excluded_indices: [],
      initially_passing_indices: [],
      force_scored_indices: [],
    },
  };
}

function arm(id) {
  const config = id === 'raw'
    ? { proxy_arm: 'raw', policy_id: 'raw_passthrough', runner_model: 'orgx-ab/raw', claim_level: 'transport_control' }
    : { proxy_arm: 'evidence-gate', policy_id: 'evidence_gate', runner_model: 'orgx-ab/evidence-gate', claim_level: 'experimental_control_policy' };
  return {
    id,
    ...config,
    policy_hash: 'e'.repeat(64),
    base_model: 'fixture-base-model',
    reasoning_effort: 'high',
    runtime_commit: COMMIT,
    fallback_models: [],
  };
}

function rowFor(t, runnerModel) {
  return {
    name: t.name,
    task_contract_schema: t.contract_schema,
    task_contract_sha256: t.contract_sha256,
    passed: true,
    score: 1,
    assertions_total: 2,
    assertions_passed: 2,
    assertion_results: [
      { type: 'first', passed: true, excluded: false },
      { type: 'second', passed: true, excluded: false },
    ],
    end_state: { updated: true },
    input_tokens: 100,
    output_tokens: 20,
    cost: 1,
    _runnerModel: runnerModel,
  };
}

function fixture({ repetitions = 1, tasks = [task()] } = {}) {
  const arms = [arm('raw'), arm('evidence')];
  const manifest = {
    schema: SCHEMA,
    upstream_commit: 'a'.repeat(40),
    benchmark_version: '1.0.6',
    split: 'public',
    cohort_role: 'development_microcanary',
    selection_seed: 'fixture-cohort',
    cohort_sha256: 'f'.repeat(64),
    toolset: 'api',
    max_steps: 50,
    repetitions,
    comparison_kind: 'harness_ablation',
    baseline_arm: 'raw',
    analysis: {
      unit: 'task',
      method: 'stratified_task_cluster_bootstrap',
      bootstrap_samples: 1000,
      seed: 'fixture-bootstrap',
    },
    tasks,
    arms,
  };
  const inputs = [];
  for (const a of arms) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const rows = tasks.map((t) => rowFor(t, a.runner_model));
      inputs.push({
        arm: a.id,
        repetition,
        data: {
          meta: {
            model: a.runner_model,
            reasoning_effort: a.reasoning_effort,
            toolset: manifest.toolset,
            benchmark_version: manifest.benchmark_version,
            max_steps: manifest.max_steps,
            total_tasks: rows.length,
            domains: [...new Set(tasks.map((t) => t.domain))],
          },
          tasks: rows,
        },
      });
    }
  }
  return { manifest, inputs };
}

function findInput(f, armId = 'raw', repetition = 1) {
  return f.inputs.find((input) => input.arm === armId && input.repetition === repetition);
}
function row(f, armId = 'raw', repetition = 1, taskName = f.manifest.tasks[0].name) {
  return findInput(f, armId, repetition).data.tasks.find((item) => item.name === taskName);
}
function fail(target) {
  target.passed = false;
  target.score = 0.5;
  target.assertions_passed = 1;
  target.assertion_results[1].passed = false;
}
function receipt({ reviewCalls = 0, fallback = null, complete = true, usageReconciled = true } = {}) {
  const components = [{ kind: 'primary', model: 'fixture-base-model', calls: 1, usd: 1 }];
  if (reviewCalls) components.push({ kind: 'verification', model: 'fixture-base-model', calls: reviewCalls, usd: 0.5 });
  if (fallback) components.push({ kind: 'fallback', model: fallback, calls: 1, usd: 2 });
  return {
    complete,
    scope: 'all_model_calls_and_orchestration',
    usage_ledger_sha256: 'd'.repeat(64),
    usage_reconciled: usageReconciled,
    components,
  };
}

function attachCosts(f, armId, taskName, value, repetition = 1) {
  findInput(f, armId, repetition).costs = { [taskName]: value };
}

test('strict pass remains non-headline and native cost alone is a lower bound', () => {
  const f = fixture();
  const result = report(f.manifest, f.inputs);
  assert.equal(result.arms[0].strictPassRate, 1);
  assert.equal(result.arms[0].costComparable, false);
  assert.equal(result.arms[0].allInCostUsd, null);
  assert.equal(result.arms[0].knownCostLowerBoundUsd, 1);
  assert.equal(result.headlineEligible, false);
  assert.equal(result.officialLeaderboardComparable, false);
});

test('partial credit is diagnostic, never strict success', () => {
  const f = fixture(); fail(row(f));
  const result = report(f.manifest, f.inputs).arms[0];
  assert.equal(result.strictPassRate, 0);
  assert.equal(result.partialCreditDiagnostic, 0.5);
});

test('dynamic free assertion exclusion matches upstream rubric', () => {
  const t = task();
  t.exclusion_policy.initially_passing_indices = [0];
  const f = fixture({ tasks: [t] });
  for (const input of f.inputs) {
    const target = input.data.tasks[0];
    target.assertion_results[0].excluded = true;
    target.assertions_total = 1;
    target.assertions_passed = 1;
  }
  assert.equal(report(f.manifest, f.inputs).arms[0].strictPassRate, 1);

  const broken = fixture({ tasks: [structuredClone(t)] });
  for (const input of broken.inputs) {
    input.data.tasks[0].assertion_results[0].excluded = true;
    input.data.tasks[0].assertions_total = 1;
    input.data.tasks[0].assertions_passed = 1;
  }
  const target = row(broken);
  target.assertion_results[0].passed = false;
  target.assertion_results[0].excluded = false;
  target.passed = false;
  target.score = 0.5;
  target.assertions_total = 2;
  target.assertions_passed = 1;
  assert.equal(report(broken.manifest, broken.inputs).arms[0].strictPassRate, 0);
});

test('explicit exclusion remains excluded even when it fails', () => {
  const t = task();
  t.exclusion_policy.explicit_excluded_indices = [0];
  const f = fixture({ tasks: [t] });
  for (const input of f.inputs) {
    const target = input.data.tasks[0];
    target.assertion_results[0] = { type: 'informational', passed: false, excluded: true };
    target.assertions_total = 1;
    target.assertions_passed = 1;
  }
  assert.equal(report(f.manifest, f.inputs).arms[0].strictPassRate, 1);
});

test('force-scored initially passing assertion is never excluded', () => {
  const t = task();
  t.exclusion_policy.initially_passing_indices = [0];
  t.exclusion_policy.force_scored_indices = [0];
  const f = fixture({ tasks: [t] });
  assert.equal(report(f.manifest, f.inputs).arms[0].strictPassRate, 1);
});

test('all excluded assertions do not create a pass', () => {
  const t = task();
  t.exclusion_policy.explicit_excluded_indices = [0, 1];
  const f = fixture({ tasks: [t] });
  for (const input of f.inputs) {
    const target = input.data.tasks[0];
    target.assertion_results.forEach((result) => { result.excluded = true; });
    target.assertions_total = 0;
    target.assertions_passed = 0;
    target.passed = false;
    target.score = 0;
  }
  assert.equal(report(f.manifest, f.inputs).arms[0].strictPassRate, 0);
});

test('missing and unscored attempts remain in planned denominator', () => {
  const f = fixture({ repetitions: 2 });
  f.inputs = f.inputs.filter((input) => !(input.arm === 'raw' && input.repetition === 2));
  fail(row(f));
  row(f).assertion_results = [];
  const result = report(f.manifest, f.inputs);
  assert.equal(result.arms[0].plannedEpisodes, 2);
  assert.equal(result.arms[0].missingEpisodes, 1);
  assert.equal(result.arms[0].unscoredEpisodes, 1);
  assert.equal(result.arms[0].strictPassRate, 0);
  assert.equal(result.arms[0].rateIsLowerBound, true);
  assert.equal(result.comparisons[0].strictSuccessDelta, null);
  assert.equal(result.comparisons[0].confidenceInterval95, null);
});

test('paired task inference clusters repetitions by task', () => {
  const tasks = [task('sales.one', 'sales'), task('sales.two', 'sales'), task('hr.one', 'hr'), task('hr.two', 'hr')];
  for (const [index, t] of tasks.entries()) t.contract_sha256 = String(index + 1).repeat(64).slice(0, 64);
  const f = fixture({ repetitions: 2, tasks });
  for (const t of tasks.slice(0, 2)) {
    fail(row(f, 'raw', 1, t.name));
    fail(row(f, 'raw', 2, t.name));
  }
  const comparison = report(f.manifest, f.inputs).comparisons[0];
  assert.equal(comparison.completePairs, true);
  assert.equal(comparison.episodePairedWins, 4);
  assert.equal(comparison.taskPairedWins, 2);
  assert.equal(comparison.strictSuccessDelta, 0.5);
  assert.equal(comparison.confidenceInterval95.method, 'stratified_task_cluster_bootstrap');
  assert.equal(comparison.confidenceInterval95.samples, 1000);
  assert.ok(comparison.confidenceInterval95.low >= 0 && comparison.confidenceInterval95.high <= 1);
});

test('bootstrap is deterministic for a pinned analysis seed', () => {
  const tasks = [task('sales.one', 'sales'), task('sales.two', 'sales')];
  tasks[1].contract_sha256 = 'e'.repeat(64);
  const f = fixture({ tasks }); fail(row(f, 'raw', 1, 'sales.one'));
  assert.deepEqual(report(f.manifest, f.inputs).comparisons[0].confidenceInterval95,
    report(f.manifest, f.inputs).comparisons[0].confidenceInterval95);
});

test('all-in costs count verification and use the base model, not proxy alias', () => {
  const f = fixture();
  attachCosts(f, 'evidence', f.manifest.tasks[0].name, receipt({ reviewCalls: 1 }));
  const result = report(f.manifest, f.inputs).arms[1];
  assert.equal(result.costComparable, true);
  assert.equal(result.allInCostUsd, 1.5);
  assert.equal(result.accountedVerificationCalls, 1);
});

test('system comparison permits declared fallback and accounts it', () => {
  const f = fixture();
  f.manifest.comparison_kind = 'system_comparison';
  f.manifest.arms[1].fallback_models = ['fallback-model'];
  attachCosts(f, 'evidence', f.manifest.tasks[0].name, receipt({ fallback: 'fallback-model' }));
  const result = report(f.manifest, f.inputs).arms[1];
  assert.equal(result.allInCostUsd, 3);
  assert.equal(result.accountedFallbackCalls, 1);
});

test('unknown or unreconciled costs remain unknown rather than free', () => {
  const f = fixture();
  attachCosts(f, 'raw', f.manifest.tasks[0].name, { complete: false });
  assert.equal(report(f.manifest, f.inputs).arms[0].allInCostUsd, null);
  const f2 = fixture();
  attachCosts(f2, 'raw', f2.manifest.tasks[0].name, receipt({ usageReconciled: false }));
  assert.throws(() => report(f2.manifest, f2.inputs), /reconcile/);
});

for (const [name, mutate, pattern] of [
  ['optimistic passed flag', (f) => { row(f).assertion_results[1].passed = false; }, /disagrees/],
  ['zero assertion evidence', (f) => { row(f).assertion_results = []; }, /Unverifiable/],
  ['missing final state', (f) => { row(f).end_state = null; }, /Unverifiable/],
  ['duplicate rows', (f) => { findInput(f).data.tasks.push(structuredClone(row(f))); findInput(f).data.meta.total_tasks += 1; }, /Duplicate/],
  ['duplicate exports', (f) => { f.inputs.push(structuredClone(f.inputs[0])); }, /Duplicate/],
  ['unknown task', (f) => { row(f).name = 'sales.other'; }, /Unregistered/],
  ['contract mismatch', (f) => { row(f).task_contract_sha256 = 'f'.repeat(64); }, /contract mismatch/i],
  ['assertion count mismatch', (f) => { row(f).assertion_results.push({ passed: true, excluded: false }); }, /count mismatch/i],
  ['wrong exclusion', (f) => { row(f).assertion_results[1].excluded = true; }, /exclusion disagrees/i],
  ['string truthiness', (f) => { row(f).assertion_results[1].passed = 'false'; }, /Boolean/],
  ['summary count mismatch', (f) => { row(f).assertions_passed = 0; }, /totals disagree/],
  ['toolset mismatch', (f) => { findInput(f).data.meta.toolset = 'zapier'; }, /Metadata mismatch/],
  ['step mismatch', (f) => { findInput(f).data.meta.max_steps = 100; }, /Metadata mismatch/],
  ['version mismatch', (f) => { findInput(f).data.meta.benchmark_version = 'other'; }, /Metadata mismatch/],
  ['runner alias mismatch', (f) => { findInput(f).data.meta.model = 'other'; }, /Runner model/],
  ['simple cohort', (f) => { f.manifest.tasks[0].domain = 'simple'; }, /simple/],
  ['private score claim', (f) => { f.manifest.split = 'private_holdout'; }, /public results only/],
  ['mutable upstream', (f) => { f.manifest.upstream_commit = 'main'; }, /Pin the upstream/],
  ['mixed base model ablation', (f) => { f.manifest.arms[1].base_model = 'other'; }, /same base model/],
  ['fallback ablation', (f) => { f.manifest.arms[1].fallback_models = ['fallback']; }, /separate system/],
  ['missing analysis plan', (f) => { delete f.manifest.analysis; }, /Inference unit/],
  ['too few bootstrap samples', (f) => { f.manifest.analysis.bootstrap_samples = 99; }, />= 1000/],
  ['duplicate arm alias', (f) => { f.manifest.arms[1].runner_model = f.manifest.arms[0].runner_model; }, /aliases/],
  ['invalid force-scored policy', (f) => { f.manifest.tasks[0].exclusion_policy.force_scored_indices = [0]; }, /initially passed/],
  ['unregistered repetition', (f) => { f.inputs[0].repetition = 2; }, /Unexpected repetition/],
]) {
  test(`reject ${name}`, () => {
    const f = fixture(); mutate(f);
    assert.throws(() => report(f.manifest, f.inputs), pattern);
  });
}

test('reject incomplete or dishonest cost ledgers', () => {
  const cases = [
    [(value) => { value.components[0].model = 'proxy-alias'; }, /Primary cost model/],
    [(value) => { value.components[0].usd = -1; }, /Invalid cost/],
    [(value) => { value.usage_ledger_sha256 = 'bad'; }, /auditable/],
    [(value) => { value.components[0].usd = 0; }, /below native/],
    [(value) => { value.components.push({ kind: 'fallback', model: 'unknown', calls: 1, usd: 2 }); }, /Undeclared/],
  ];
  for (const [mutate, pattern] of cases) {
    const f = fixture(); const value = receipt(); mutate(value);
    attachCosts(f, 'raw', f.manifest.tasks[0].name, value);
    assert.throws(() => report(f.manifest, f.inputs), pattern);
  }
});

test('CLI verifies export bytes and retains missing run cells', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'automationbench-report-'));
  try {
    const f = fixture();
    const input = findInput(f, 'raw');
    const bytes = JSON.stringify(input.data);
    await writeFile(path.join(directory, 'raw.json'), bytes);
    f.manifest.runs = [{ arm: 'raw', repetition: 1, file: 'raw.json', sha256: sha256(bytes) }];
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(f.manifest));
    const result = await compareFromFile(path.join(directory, 'manifest.json'));
    assert.equal(result.arms[1].missingEpisodes, 1);
    assert.equal(result.manifestSha256.length, 64);
    await writeFile(path.join(directory, 'raw.json'), `${bytes} `);
    await assert.rejects(compareFromFile(path.join(directory, 'manifest.json')), /digest mismatch/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
