#!/usr/bin/env node
// Validate a pre-registration evaluation manifest against the contract.
// Pre-registration exists to pre-empt "you chose the tests after seeing the
// results" — so the manifest MUST be complete and every arm MUST be named.
// Usage: node runner/validate-manifest.mjs <manifest.json>
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const VALID_SYSTEMS = new Set(['single_frontier', 'provider_native_agent', 'best_of_n', 'self_reflection', 'static_orgx', 'adaptive_orgx', 'full_orgx', 'fugu', 'fugu_ultra']);
const VALID_METRICS = new Set(['world_success_rate', 'trust_adjusted_score', 'pass_at_k', 'pass_pow_k', 'quality_per_ktoken', 'cost_per_verified_outcome', 'latency', 'provenance_completeness', 'recovery_score', 'budget_adherence', 'uncertainty_honesty']);

export function validateManifest(m) {
  const errors = [];
  for (const f of ['id', 'date', 'claim', 'arms', 'tasks', 'metrics', 'headlineEligible']) {
    if (m[f] === undefined) errors.push(`missing required field: ${f}`);
  }
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
