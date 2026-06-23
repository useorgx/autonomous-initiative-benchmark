// Provenance completeness — a field-based audit metric, not a vibes metric.
//
// Deliberately scored as (required_audit_fields_present / total) per execution
// step, so a black-box orchestration endpoint earns credit for whatever its
// payload DOES expose (e.g. orchestration token counts) rather than scoring 0
// by fiat. OrgX should win because its execution record is deeper, not because
// the rubric is rigged against competitors.

export const REQUIRED_AUDIT_FIELDS = [
  'goal_id',
  'run_id',
  'step_id',
  'actor',
  'model',
  'provider',
  'input_context_hash',
  'visible_sources',
  'decision',
  'tool_calls',
  'cost',
  'latency',
  'confidence',
  'verification_result',
  'state_delta',
  'failure_mode',
  'recovery_action',
];

function fieldPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return true; // an explicit [] is a real answer ("no tools")
  return true;
}

// Completeness of a single step record.
export function stepProvenanceCompleteness(step = {}, fields = REQUIRED_AUDIT_FIELDS) {
  const present = fields.filter((f) => fieldPresent(step[f]));
  const missing = fields.filter((f) => !fieldPresent(step[f]));
  return {
    ratio: fields.length ? Number((present.length / fields.length).toFixed(4)) : 1,
    present: present.length,
    total: fields.length,
    missing,
  };
}

// Run-level completeness = mean across steps (a run is only as auditable as its
// least-documented steps drag it). Empty step list scores 0 — a run with no
// recorded steps is not auditable.
export function provenanceCompleteness(steps = [], fields = REQUIRED_AUDIT_FIELDS) {
  if (!steps.length) {
    return { ratio: 0, steps: 0, perStepRatios: [], note: 'no steps recorded' };
  }
  const perStep = steps.map((s) => stepProvenanceCompleteness(s, fields));
  const ratio = Number(
    (perStep.reduce((sum, p) => sum + p.ratio, 0) / perStep.length).toFixed(4)
  );
  return { ratio, steps: steps.length, perStepRatios: perStep.map((p) => p.ratio) };
}

// Decision replayability: can another agent reconstruct WHY the system acted?
// 1.0 full replay, 0.5 partial (decision present but missing context/cost/state),
// 0.0 final answer only.
export function decisionReplayability(step = {}) {
  const hasDecision = fieldPresent(step.decision);
  if (!hasDecision) return 0;
  const replayCritical = ['input_context_hash', 'visible_sources', 'state_delta', 'cost'];
  const have = replayCritical.filter((f) => fieldPresent(step[f])).length;
  if (have === replayCritical.length) return 1;
  return 0.5;
}
