// Native AutomationBench export consistency, accounting, and paired inference.
// This module does not execute or independently grade AutomationBench tasks.
import { createHash } from 'node:crypto';

export const SCHEMA = 'orgx.automationbench-comparison/v2';
const DOMAINS = new Set(['sales', 'marketing', 'operations', 'support', 'finance', 'hr']);
const COHORT_ROLES = new Set(['development_microcanary', 'development_pilot', 'public_full']);
const COST_KINDS = new Set(['primary', 'fallback', 'verification', 'retry', 'orchestration']);
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const CLAIM_LEVELS = new Set(['transport_control', 'experimental_control_policy', 'production_orgx_runtime']);
const EPSILON = 1e-9;

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 6) => value == null ? null : Number(Number(value).toFixed(digits));
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

function integerIndexArray(value, length, label) {
  const indices = value ?? [];
  assert(Array.isArray(indices), `${label} must be an array`);
  assert(new Set(indices).size === indices.length, `${label} contains duplicates`);
  assert(indices.every((index) => Number.isInteger(index) && index >= 0 && index < length), `${label} contains an invalid index`);
  return indices;
}

function validateTask(task) {
  assert(typeof task.name === 'string' && task.name.length > 0, 'Task name required');
  assert(DOMAINS.has(task.domain), 'Invalid/scaffold domain; simple must be reported separately');
  assert(HEX.test(task.contract_sha256 ?? ''), `Task contract not pinned: ${task.name}`);
  assert(typeof task.contract_schema === 'string' && task.contract_schema.length > 0, 'Task contract schema required');
  assert(Number.isInteger(task.assertions_total) && task.assertions_total > 0, 'Assertion count required');
  if (task.source_index != null) assert(Number.isInteger(task.source_index) && task.source_index >= 0, 'source_index must be a nonnegative integer');
  if (task.evaluation_example_id != null) assert(Number.isInteger(task.evaluation_example_id) && task.evaluation_example_id >= 0, 'evaluation_example_id must be a nonnegative integer');
  const policy = task.exclusion_policy ?? {};
  const explicit = integerIndexArray(policy.explicit_excluded_indices, task.assertions_total, 'explicit_excluded_indices');
  const initial = integerIndexArray(policy.initially_passing_indices, task.assertions_total, 'initially_passing_indices');
  const forced = integerIndexArray(policy.force_scored_indices, task.assertions_total, 'force_scored_indices');
  assert(!explicit.some((index) => forced.includes(index)), 'An assertion cannot be both explicitly excluded and force-scored');
  assert(forced.every((index) => initial.includes(index)), 'A force-scored assertion must record whether it initially passed');
}

function validateArm(arm) {
  assert(typeof arm.id === 'string' && arm.id.length > 0, 'Arm id required');
  assert(typeof arm.runner_model === 'string' && arm.runner_model.length > 0, 'Arm runner_model required');
  assert(typeof arm.proxy_arm === 'string' && arm.proxy_arm.length > 0, 'Arm proxy_arm required');
  assert(typeof arm.base_model === 'string' && arm.base_model.length > 0, 'Arm base_model required');
  assert(typeof arm.policy_id === 'string' && arm.policy_id.length > 0, 'Arm policy_id required');
  assert(HEX.test(arm.policy_hash ?? ''), 'Pin each policy hash');
  assert(CLAIM_LEVELS.has(arm.claim_level), 'Pin a valid claim_level');
  assert(typeof arm.reasoning_effort === 'string' && arm.reasoning_effort.length > 0, 'Pin effort; use not_applicable explicitly');
  assert(COMMIT.test(arm.runtime_commit ?? ''), 'Pin each runtime commit');
  assert(Array.isArray(arm.fallback_models) && arm.fallback_models.every((model) => typeof model === 'string' && model.length > 0), 'Declare fallback_models, including []');
}

export function validateManifest(manifest) {
  assert(manifest?.schema === SCHEMA, 'Unsupported manifest schema');
  assert(COMMIT.test(manifest.upstream_commit ?? ''), 'Pin the upstream commit');
  assert(manifest.split === 'public', 'This importer supports public results only, not official private scores');
  assert(COHORT_ROLES.has(manifest.cohort_role), 'Declare a valid cohort_role');
  assert(typeof manifest.selection_seed === 'string' && manifest.selection_seed.length > 0, 'Pin the cohort selection seed');
  assert(HEX.test(manifest.cohort_sha256 ?? ''), 'Pin the cohort digest');
  assert(typeof manifest.benchmark_version === 'string' && manifest.benchmark_version.length > 0, 'Pin benchmark_version');
  assert(['api', 'zapier', 'limited_zapier'].includes(manifest.toolset), 'Invalid toolset');
  assert(Number.isInteger(manifest.max_steps) && manifest.max_steps > 0, 'Invalid max_steps');
  assert(Number.isInteger(manifest.repetitions) && manifest.repetitions > 0, 'Invalid repetitions');
  assert(['harness_ablation', 'system_comparison'].includes(manifest.comparison_kind), 'Declare comparison_kind');

  const analysis = manifest.analysis ?? {};
  assert(analysis.unit === 'task', 'Inference unit must be task');
  assert(analysis.method === 'stratified_task_cluster_bootstrap', 'Unsupported inference method');
  assert(Number.isInteger(analysis.bootstrap_samples) && analysis.bootstrap_samples >= 1000, 'bootstrap_samples must be >= 1000');
  assert(typeof analysis.seed === 'string' && analysis.seed.length > 0, 'Pin the inference seed');

  assert(Array.isArray(manifest.tasks) && manifest.tasks.length > 0, 'Preregister a nonempty task cohort');
  assert(new Set(manifest.tasks.map((task) => task.name)).size === manifest.tasks.length, 'Duplicate task in cohort');
  manifest.tasks.forEach(validateTask);
  const exampleIds = manifest.tasks.map((task) => task.evaluation_example_id).filter((value) => value != null);
  if (exampleIds.length) {
    assert(exampleIds.length === manifest.tasks.length, 'Either pin every evaluation_example_id or none');
    assert(new Set(exampleIds).size === exampleIds.length, 'Duplicate evaluation_example_id');
    assert(exampleIds.every((value, index) => value === index), 'evaluation_example_id must match filtered source order');
  }

  assert(Array.isArray(manifest.arms) && manifest.arms.length >= 2, 'At least two arms required');
  assert(new Set(manifest.arms.map((arm) => arm.id)).size === manifest.arms.length, 'Duplicate arm');
  assert(new Set(manifest.arms.map((arm) => arm.runner_model)).size === manifest.arms.length, 'runner_model aliases must be unique');
  manifest.arms.forEach(validateArm);
  assert(manifest.arms.some((arm) => arm.id === manifest.baseline_arm), 'Unknown baseline arm');

  if (manifest.comparison_kind === 'harness_ablation') {
    assert(new Set(manifest.arms.map((arm) => arm.base_model)).size === 1, 'Harness ablation requires the same base model');
    assert(new Set(manifest.arms.map((arm) => arm.reasoning_effort)).size === 1, 'Harness ablation requires equal effort');
    assert(manifest.arms.every((arm) => arm.fallback_models.length === 0), 'Fallback systems belong in a separate system comparison');
  }
  return manifest;
}

function expectedExcluded(task, result, index) {
  const policy = task.exclusion_policy ?? {};
  const explicit = new Set(policy.explicit_excluded_indices ?? []);
  const initial = new Set(policy.initially_passing_indices ?? []);
  const forced = new Set(policy.force_scored_indices ?? []);
  if (explicit.has(index)) return true;
  if (forced.has(index)) return false;
  if (initial.has(index)) return result.passed === true;
  return false;
}

function scoreRow(row, task) {
  if (!row) return { status: 'missing', pass: 0, partial: null };
  assert(row.task_contract_sha256 === task.contract_sha256 && row.task_contract_schema === task.contract_schema,
    `Task contract mismatch: ${task.name}`);
  const results = row.assertion_results;
  if (!Array.isArray(results) || results.length === 0 || row.end_state == null) {
    assert(row.passed !== true, `Unverifiable success claim: ${task.name}`);
    return { status: 'unscored', pass: 0, partial: null };
  }
  assert(results.length === task.assertions_total, `Assertion count mismatch: ${task.name}`);
  results.forEach((result, index) => {
    assert(result && typeof result === 'object' && typeof result.passed === 'boolean', 'Assertions must contain Boolean passed');
    assert(typeof result.excluded === 'boolean', 'Assertion excluded flag must be Boolean');
    assert(result.excluded === expectedExcluded(task, result, index), `Assertion exclusion disagrees with pinned policy: ${task.name}/${index}`);
  });
  const scored = results.filter((result) => !result.excluded);
  const successes = scored.filter((result) => result.passed).length;
  const pass = Number(scored.length > 0 && successes === scored.length);
  assert(row.passed === Boolean(pass), `Export passed disagrees with assertions: ${task.name}`);
  assert(row.assertions_total === scored.length && row.assertions_passed === successes,
    `Export assertion totals disagree: ${task.name}`);
  return { status: 'scored', pass, partial: scored.length ? successes / scored.length : 0 };
}

function costFor(receipt, arm, row, taskName) {
  const nativeKnown = finite(row?.cost) ? row.cost : null;
  if (!receipt || receipt.complete !== true || !Array.isArray(receipt.components) || receipt.components.length === 0) {
    return { totalCostUsd: null, knownCostLowerBoundUsd: nativeKnown, fallbackCalls: null, verificationCalls: null, costTelemetryComplete: false };
  }
  assert(receipt.scope === 'all_model_calls_and_orchestration', 'Cost scope is incomplete');
  assert(HEX.test(receipt.usage_ledger_sha256 ?? ''), 'Bind an auditable usage ledger');
  assert(receipt.usage_reconciled === true, `Usage must reconcile before cost is complete: ${taskName}`);
  let fallbackCalls = 0;
  let verificationCalls = 0;
  for (const component of receipt.components) {
    assert(COST_KINDS.has(component.kind) && finite(component.usd), `Invalid cost component: ${taskName}`);
    if (component.kind !== 'orchestration') {
      assert(Number.isInteger(component.calls) && component.calls >= 0 && typeof component.model === 'string' && component.model.length > 0,
        'Invalid model-call ledger');
      if (component.kind === 'fallback') {
        assert(arm.fallback_models.includes(component.model), 'Undeclared fallback model');
        fallbackCalls += component.calls;
      }
      if (component.kind === 'primary') assert(component.model === arm.base_model, 'Primary cost model mismatch');
      if (component.kind === 'verification') {
        assert(component.model === arm.base_model || arm.fallback_models.includes(component.model), 'Verification model not declared');
        verificationCalls += component.calls;
      }
    }
  }
  assert(receipt.components.some((component) => component.kind === 'primary'), 'Primary cost component required');
  const total = receipt.components.reduce((sum, component) => sum + component.usd, 0);
  assert(nativeKnown == null || total + EPSILON >= nativeKnown, 'All-in cost is below native export cost');
  return {
    totalCostUsd: total,
    knownCostLowerBoundUsd: total,
    fallbackCalls,
    verificationCalls,
    costTelemetryComplete: true,
  };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function seedInt(seed) {
  return createHash('sha256').update(seed).digest().readUInt32BE(0);
}

function percentile(sorted, probability) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stratifiedTaskBootstrap(taskDiffs, analysis, comparisonId) {
  const byDomain = new Map();
  for (const task of taskDiffs) {
    const group = byDomain.get(task.domain) ?? [];
    group.push(task.diff);
    byDomain.set(task.domain, group);
  }
  const random = mulberry32(seedInt(`${analysis.seed}\0${comparisonId}`));
  const samples = [];
  for (let iteration = 0; iteration < analysis.bootstrap_samples; iteration += 1) {
    const draw = [];
    for (const values of byDomain.values()) {
      for (let index = 0; index < values.length; index += 1) draw.push(values[Math.floor(random() * values.length)]);
    }
    samples.push(mean(draw));
  }
  samples.sort((left, right) => left - right);
  return {
    method: analysis.method,
    unit: analysis.unit,
    samples: analysis.bootstrap_samples,
    low: round(percentile(samples, 0.025)),
    high: round(percentile(samples, 0.975)),
  };
}

function buildComparison(manifest, episodes, candidateId) {
  const baseline = new Map(episodes.filter((episode) => episode.arm === manifest.baseline_arm)
    .map((episode) => [`${episode.task}\0${episode.repetition}`, episode]));
  const candidate = new Map(episodes.filter((episode) => episode.arm === candidateId)
    .map((episode) => [`${episode.task}\0${episode.repetition}`, episode]));
  const pairs = [];
  for (const task of manifest.tasks) for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
    const key = `${task.name}\0${repetition}`;
    pairs.push({ task: task.name, domain: task.domain, repetition, baseline: baseline.get(key), candidate: candidate.get(key) });
  }
  const complete = pairs.every((pair) => pair.baseline?.status === 'scored' && pair.candidate?.status === 'scored');
  const episodeDiffs = pairs.map((pair) => (pair.candidate?.pass ?? 0) - (pair.baseline?.pass ?? 0));
  const taskDiffs = manifest.tasks.map((task) => {
    const taskPairs = pairs.filter((pair) => pair.task === task.name);
    return { task: task.name, domain: task.domain,
      diff: mean(taskPairs.map((pair) => (pair.candidate?.pass ?? 0) - (pair.baseline?.pass ?? 0))) };
  });
  const taskDelta = mean(taskDiffs.map((task) => task.diff));
  return {
    baseline: manifest.baseline_arm,
    arm: candidateId,
    completePairs: complete,
    episodePairsPlanned: pairs.length,
    episodePairedWins: episodeDiffs.filter((diff) => diff > 0).length,
    episodePairedLosses: episodeDiffs.filter((diff) => diff < 0).length,
    episodePairedTies: episodeDiffs.filter((diff) => diff === 0).length,
    taskPairs: taskDiffs.length,
    taskPairedWins: taskDiffs.filter((task) => task.diff > 0).length,
    taskPairedLosses: taskDiffs.filter((task) => task.diff < 0).length,
    taskPairedTies: taskDiffs.filter((task) => task.diff === 0).length,
    observedDeltaWithMissingAsFailure: round(mean(episodeDiffs)),
    strictSuccessDelta: complete ? round(taskDelta) : null,
    confidenceInterval95: complete ? stratifiedTaskBootstrap(taskDiffs, manifest.analysis, `${manifest.baseline_arm}:${candidateId}`) : null,
    inferenceStatus: complete ? 'complete_public_task_cluster_inference' : 'incomplete_pairs_no_treatment_effect_claim',
  };
}

export function buildAutomationBenchReport(manifest, inputs) {
  const validated = validateManifest(manifest);
  assert(Array.isArray(inputs), 'Inputs must be an array');
  const tasks = new Map(validated.tasks.map((task) => [task.name, task]));
  const arms = new Map(validated.arms.map((arm) => [arm.id, arm]));
  const slots = new Map();

  for (const input of inputs) {
    const arm = arms.get(input.arm);
    assert(arm, 'Unknown input arm');
    assert(Number.isInteger(input.repetition) && input.repetition >= 1 && input.repetition <= validated.repetitions, 'Unexpected repetition');
    const key = `${input.arm}\0${input.repetition}`;
    assert(!slots.has(key), 'Duplicate arm/repetition export');
    const { meta, tasks: rows } = input.data ?? {};
    assert(meta && Array.isArray(rows), 'Not a native AutomationBench export');
    for (const field of ['toolset', 'benchmark_version', 'max_steps']) assert(meta[field] === validated[field], `Metadata mismatch: ${field}`);
    assert(meta.model === arm.runner_model && (meta.reasoning_effort ?? 'not_applicable') === arm.reasoning_effort, 'Runner model/effort mismatch');
    assert(meta.total_tasks === rows.length, 'Native export task count mismatch');
    assert(Array.isArray(meta.domains) && meta.domains.length > 0 && meta.domains.every((domain) => DOMAINS.has(domain)), 'Invalid export domains');
    assert(new Set(rows.map((row) => row.name)).size === rows.length, 'Duplicate task row');
    assert(rows.every((row) => tasks.has(row.name)), 'Unregistered task in export');
    assert(rows.every((row) => meta.domains.includes(tasks.get(row.name).domain)), 'Task/export domain mismatch');
    const costs = input.costs ?? {};
    assert(Object.keys(costs).every((name) => tasks.has(name)), 'Unregistered cost receipt');
    slots.set(key, { rows: new Map(rows.map((row) => [row.name, row])), costs });
  }

  const episodes = [];
  for (const arm of validated.arms) for (let repetition = 1; repetition <= validated.repetitions; repetition += 1) {
    const input = slots.get(`${arm.id}\0${repetition}`);
    for (const task of validated.tasks) {
      const row = input?.rows.get(task.name);
      episodes.push({ arm: arm.id, repetition, task: task.name, domain: task.domain,
        ...scoreRow(row, task), ...costFor(input?.costs[task.name], arm, row, task.name) });
    }
  }

  const reportArms = validated.arms.map((arm) => {
    const armEpisodes = episodes.filter((episode) => episode.arm === arm.id);
    const strictSuccesses = armEpisodes.reduce((sum, episode) => sum + episode.pass, 0);
    const scoredEpisodes = armEpisodes.filter((episode) => episode.status === 'scored');
    const costsComplete = armEpisodes.every((episode) => episode.costTelemetryComplete);
    const completeCost = costsComplete ? armEpisodes.reduce((sum, episode) => sum + episode.totalCostUsd, 0) : null;
    const knownCosts = armEpisodes.filter((episode) => episode.knownCostLowerBoundUsd != null);
    const taskGroups = validated.tasks.map((task) => armEpisodes.filter((episode) => episode.task === task.name));
    return {
      id: arm.id,
      policyId: arm.policy_id,
      policyHash: arm.policy_hash,
      proxyArm: arm.proxy_arm,
      claimLevel: arm.claim_level,
      runnerModel: arm.runner_model,
      baseModel: arm.base_model,
      runtimeCommit: arm.runtime_commit,
      declaredFallbackModels: arm.fallback_models,
      plannedEpisodes: armEpisodes.length,
      scoredEpisodes: scoredEpisodes.length,
      missingEpisodes: armEpisodes.filter((episode) => episode.status === 'missing').length,
      unscoredEpisodes: armEpisodes.filter((episode) => episode.status === 'unscored').length,
      strictSuccesses,
      strictPassRate: round(strictSuccesses / armEpisodes.length),
      rateIsLowerBound: scoredEpisodes.length !== armEpisodes.length,
      partialCreditDiagnostic: scoredEpisodes.length ? round(mean(scoredEpisodes.map((episode) => episode.partial))) : null,
      atLeastOneSuccessPerTask: round(mean(taskGroups.map((group) => Number(group.some((episode) => episode.pass === 1))))),
      allRepetitionsSuccessfulPerTask: round(mean(taskGroups.map((group) => Number(group.every((episode) => episode.pass === 1))))),
      costComparable: costsComplete,
      allInCostUsd: round(completeCost),
      costPerStrictSuccessUsd: costsComplete && strictSuccesses > 0 ? round(completeCost / strictSuccesses) : null,
      knownCostLowerBoundUsd: knownCosts.length ? round(knownCosts.reduce((sum, episode) => sum + episode.knownCostLowerBoundUsd, 0)) : null,
      knownCostCoverageEpisodes: knownCosts.length,
      accountedFallbackCalls: costsComplete ? armEpisodes.reduce((sum, episode) => sum + episode.fallbackCalls, 0) : null,
      accountedVerificationCalls: costsComplete ? armEpisodes.reduce((sum, episode) => sum + episode.verificationCalls, 0) : null,
      domainResults: Object.fromEntries([...new Set(validated.tasks.map((task) => task.domain))].map((domain) => {
        const domainEpisodes = armEpisodes.filter((episode) => episode.domain === domain);
        return [domain, {
          planned: domainEpisodes.length,
          scored: domainEpisodes.filter((episode) => episode.status === 'scored').length,
          strictSuccesses: domainEpisodes.reduce((sum, episode) => sum + episode.pass, 0),
          strictPassRate: round(mean(domainEpisodes.map((episode) => episode.pass))),
        }];
      })),
    };
  });

  return {
    schema: SCHEMA,
    benchmark: 'AutomationBench',
    upstreamCommit: validated.upstream_commit,
    benchmarkVersion: validated.benchmark_version,
    split: validated.split,
    cohortRole: validated.cohort_role,
    selectionSeed: validated.selection_seed,
    toolset: validated.toolset,
    comparisonKind: validated.comparison_kind,
    officialLeaderboardComparable: false,
    headlineEligible: false,
    evidenceLevel: 'native_export_plus_proxy_usage_reconciliation',
    caveat: 'Public-set result only. Native assertion records are consistency-checked, not independently replayed here. Missing or unscored episodes remain in the denominator; incomplete cost telemetry remains unknown.',
    arms: reportArms,
    comparisons: validated.arms.filter((arm) => arm.id !== validated.baseline_arm)
      .map((arm) => buildComparison(validated, episodes, arm.id)),
  };
}
