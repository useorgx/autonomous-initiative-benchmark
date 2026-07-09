#!/usr/bin/env node
// Validate a pre-registration evaluation manifest against the contract.
// Pre-registration exists to pre-empt "you chose the tests after seeing the
// results" — so the manifest MUST be complete and every arm MUST be named.
// Usage: node runner/validate-manifest.mjs <manifest.json>
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const HEADLINE_MIN_K = 8;
const VALID_SYSTEMS = new Set([
  'single_frontier',
  'provider_native_agent',
  'best_of_n',
  'self_reflection',
  'static_orgx',
  'adaptive_orgx',
  'full_orgx',
  'fugu',
  'fugu_ultra',
]);
const VALID_METRICS = new Set([
  'world_success_rate',
  'trust_adjusted_score',
  'pass_at_k',
  'pass_pow_k',
  'quality_per_ktoken',
  'cost_per_verified_outcome',
  'latency',
  'provenance_completeness',
  'recovery_score',
  'budget_adherence',
  'uncertainty_honesty',
  'qualified_work_product_success',
  'normalized_artifact_utility',
  'human_acceptance_rate',
  'perturbation_survival_rate',
  'horizon_50',
  'horizon_80',
  'gate_depth',
]);
const REQUIRED_LOSS_POLICY_FLAGS = [
  'publishAllAttempts',
  'singleAgentWinsAreLosses',
  'invalidRunsCountAsLosses',
];
const REQUIRED_LOSS_REGISTRY_IDS = [
  'single_agent_quality_win',
  'invalid_output',
  'timeout',
  'cost_loss',
  'unmeasured',
];
const REQUIRED_HEADLINE_METRICS = [
  'pass_at_k',
  'pass_pow_k',
  'horizon_50',
  'horizon_80',
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateModelManifest(m, errors) {
  if (!isObject(m.modelManifest)) {
    errors.push('modelManifest is required so future model comparisons are provider/model-version pinned');
    return new Set();
  }

  const manifest = m.modelManifest;
  if (!nonEmpty(manifest.id)) errors.push('modelManifest.id is required');
  if (!nonEmpty(manifest.createdAt)) errors.push('modelManifest.createdAt is required');
  if (!Array.isArray(manifest.models) || manifest.models.length === 0) {
    errors.push('modelManifest.models must list at least one pinned model entry');
    return new Set();
  }

  const modelIds = new Set();
  manifest.models.forEach((model, i) => {
    if (!isObject(model)) {
      errors.push(`modelManifest.models[${i}] must be an object`);
      return;
    }
    if (!nonEmpty(model.id)) errors.push(`modelManifest.models[${i}].id is required`);
    if (!nonEmpty(model.provider)) errors.push(`modelManifest.models[${i}].provider is required`);
    if (!nonEmpty(model.model)) errors.push(`modelManifest.models[${i}].model is required`);
    if (model.pinned !== true) errors.push(`modelManifest.models[${i}].pinned must be true`);
    if (!nonEmpty(model.accessDate)) errors.push(`modelManifest.models[${i}].accessDate is required`);
    if (nonEmpty(model.id)) modelIds.add(model.id);
    if (nonEmpty(model.model)) modelIds.add(model.model);
  });
  return modelIds;
}

function validateLossPolicy(m, errors) {
  if (!isObject(m.lossPolicy)) {
    errors.push('lossPolicy is required so regressions and comparison losses cannot be hidden');
    return;
  }
  for (const flag of REQUIRED_LOSS_POLICY_FLAGS) {
    if (m.lossPolicy[flag] !== true) {
      errors.push(`lossPolicy.${flag} must be true`);
    }
  }
}

function validateLossRegistry(m, errors) {
  if (!Array.isArray(m.lossRegistry) || m.lossRegistry.length === 0) {
    errors.push('lossRegistry must list benchmark loss categories before the run');
    return;
  }

  const ids = new Set();
  let countedLossCount = 0;
  m.lossRegistry.forEach((entry, i) => {
    if (!isObject(entry)) {
      errors.push(`lossRegistry[${i}] must be an object`);
      return;
    }
    if (!nonEmpty(entry.id)) errors.push(`lossRegistry[${i}].id is required`);
    if (entry.countedAsLoss !== true && entry.countedAsLoss !== false) {
      errors.push(`lossRegistry[${i}].countedAsLoss must be boolean`);
    }
    if (!nonEmpty(entry.publicLabel)) errors.push(`lossRegistry[${i}].publicLabel is required`);
    if (nonEmpty(entry.id)) ids.add(entry.id);
    if (entry.countedAsLoss === true) countedLossCount += 1;
  });
  for (const id of REQUIRED_LOSS_REGISTRY_IDS) {
    if (!ids.has(id)) errors.push(`lossRegistry is missing required category: ${id}`);
  }
  if (countedLossCount === 0) {
    errors.push('lossRegistry must mark at least one category as countedAsLoss:true');
  }
}

function validateHeadlinePolicy(m, errors) {
  if (m.headlineEligible !== true) return;

  if (!/private_holdout/.test(String(m.tasks))) {
    errors.push('headlineEligible:true requires private_holdout tasks');
  }
  if (Number(m.k ?? 0) < HEADLINE_MIN_K) {
    errors.push(`headlineEligible:true requires k >= ${HEADLINE_MIN_K}`);
  }
  if (!isObject(m.humanBaselinePolicy)) {
    errors.push('headlineEligible:true requires humanBaselinePolicy');
    return;
  }
  if (Number(m.humanBaselinePolicy.minimumDistinctHumans ?? 0) < 3) {
    errors.push('headlineEligible:true requires humanBaselinePolicy.minimumDistinctHumans >= 3');
  }
  if (m.humanBaselinePolicy.timedRuns !== true) {
    errors.push('headlineEligible:true requires humanBaselinePolicy.timedRuns:true');
  }
  if (m.humanBaselinePolicy.blindReview !== true) {
    errors.push('headlineEligible:true requires humanBaselinePolicy.blindReview:true');
  }
  if (m.humanBaselinePolicy.publishAggregate !== true) {
    errors.push('headlineEligible:true requires humanBaselinePolicy.publishAggregate:true');
  }
  for (const metric of REQUIRED_HEADLINE_METRICS) {
    if (!Array.isArray(m.metrics) || !m.metrics.includes(metric)) {
      errors.push(`headlineEligible:true requires metric ${metric}`);
    }
  }
  if (!isObject(m.generatorPolicy)) {
    errors.push('headlineEligible:true requires generatorPolicy for parametric difficulty curves');
  } else {
    if (m.generatorPolicy.type !== 'parametric_generators') {
      errors.push('generatorPolicy.type must be parametric_generators');
    }
    if (Number(m.generatorPolicy.minimumGeneratorCount ?? 0) < 20) {
      errors.push('generatorPolicy.minimumGeneratorCount must be >= 20');
    }
    if (m.generatorPolicy.difficultyKnobsRequired !== true) {
      errors.push('generatorPolicy.difficultyKnobsRequired must be true');
    }
    if (m.generatorPolicy.deterministicStateHash !== true) {
      errors.push('generatorPolicy.deterministicStateHash must be true');
    }
    if (m.generatorPolicy.monotonicityEvidenceRequired !== true) {
      errors.push('generatorPolicy.monotonicityEvidenceRequired must be true');
    }
  }
}

export function validateManifest(m) {
  const errors = [];
  for (const f of ['contractVersion', 'id', 'date', 'claim', 'arms', 'tasks', 'k', 'metrics', 'headlineEligible']) {
    if (m[f] === undefined) errors.push(`missing required field: ${f}`);
  }
  if (m.k !== undefined && (!Number.isInteger(m.k) || m.k < 1)) {
    errors.push('k must be an integer >= 1');
  }
  const modelIds = validateModelManifest(m, errors);
  validateLossPolicy(m, errors);
  validateLossRegistry(m, errors);
  if (typeof m.claim === 'string' && m.claim.trim().length < 20) {
    errors.push('claim must be a substantive falsifiable hypothesis (>= 20 chars)');
  }
  if (!Array.isArray(m.arms) || m.arms.length < 2) {
    errors.push('arms must list at least 2 named comparison arms');
  } else {
    m.arms.forEach((a, i) => {
      if (!a.id) errors.push(`arms[${i}]: missing id`);
      if (!a.model) errors.push(`arms[${i}]: missing model — vague labels (Model A/B/C) are forbidden`);
      if (a.system && !VALID_SYSTEMS.has(a.system)) errors.push(`arms[${i}]: unknown system "${a.system}"`);
      const manifestKey = a.modelManifestId ?? a.model;
      if (manifestKey && modelIds.size > 0 && !modelIds.has(manifestKey)) {
        errors.push(`arms[${i}]: model "${manifestKey}" is not pinned in modelManifest.models`);
      }
    });
  }
  if (Array.isArray(m.metrics)) {
    for (const metric of m.metrics) {
      if (!VALID_METRICS.has(metric)) errors.push(`unknown metric "${metric}"`);
    }
  }
  if (m.headlineEligible === true && /public_validation|preview/.test(String(m.tasks))) {
    errors.push('headlineEligible:true is invalid for public_validation/preview tasks (contamination-visible)');
  }
  validateHeadlinePolicy(m, errors);
  return { ok: errors.length === 0, errors };
}

// CLI entry (only when run directly, not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node runner/validate-manifest.mjs <manifest.json>');
    process.exit(2);
  }
  const m = JSON.parse(await readFile(file, 'utf8'));
  const { ok, errors } = validateManifest(m);
  console.log(JSON.stringify({ file, ok, errors }, null, 2));
  process.exit(ok ? 0 : 1);
}
