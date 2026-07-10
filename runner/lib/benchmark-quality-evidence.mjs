export const WORLD_QUALITY_PROTOCOL_VERSION = 'orgx_bench_world_quality_v1';
export const CONTAMINATION_AUDIT_PROTOCOL_VERSION = 'orgx_bench_contamination_audit_v1';
export const STATISTICAL_PRECISION_PROTOCOL_VERSION = 'orgx_bench_statistical_precision_v1';
export const CORRECTION_LEDGER_PROTOCOL_VERSION = 'orgx_bench_correction_ledger_v1';

export const DEFAULT_QUALITY_THRESHOLDS = Object.freeze({
  minimumIndependentReviewers: 5,
  maximumFalseAcceptanceRate: 0.02,
  maximumFalseRejectionRate: 0.02,
  maximumAmbiguityRate: 0.05,
  minimumReviewerAgreement: 0.67,
  minimumCounterfactualTwinPassRate: 0.95,
  minimumMetamorphicPassRate: 0.95,
  minimumDelayedConsequencePassRate: 0.95,
  maximumSevereDefects: 0,
});

export const DEFAULT_PRECISION_THRESHOLDS = Object.freeze({
  minimumEpisodesPerCell: 8,
  maximumCiWidth: 0.1,
});

const TASK_ISSUE_KEYS = [
  'overly_strict_tests',
  'underspecified_prompt',
  'low_coverage_tests',
  'misleading_prompt',
];

export function validateWorldQualityAudit(document, { strict = false, expectedWorldIds = [] } = {}) {
  const errors = [];
  const warnings = [];
  const worlds = Array.isArray(document?.worlds) ? document.worlds : [];
  const thresholds = { ...DEFAULT_QUALITY_THRESHOLDS, ...(document?.thresholds ?? {}) };

  requireProtocol(document, WORLD_QUALITY_PROTOCOL_VERSION, errors);
  requireString(document?.release_id, 'release_id', errors);
  requireIso(document?.generated_at, 'generated_at', errors);
  requireStatus(document?.status, errors);

  const ids = new Set();
  for (const [index, world] of worlds.entries()) {
    const prefix = `worlds[${index}]`;
    requireString(world?.world_id, `${prefix}.world_id`, errors);
    if (world?.world_id && ids.has(world.world_id)) errors.push(`${prefix}.world_id must be unique`);
    if (world?.world_id) ids.add(world.world_id);
    requireHash(world?.generator_hash, `${prefix}.generator_hash`, errors);

    const reviewers = uniqueStrings(world?.reviewer_ids);
    if (reviewers.length < Number(thresholds.minimumIndependentReviewers)) {
      errors.push(`${prefix}.reviewer_ids requires at least ${thresholds.minimumIndependentReviewers} independent reviewers`);
    }

    const zoo = world?.solution_zoo ?? {};
    requireMinimum(zoo.valid_solution_count, 2, `${prefix}.solution_zoo.valid_solution_count`, errors);
    requireMinimum(zoo.invalid_solution_count, 3, `${prefix}.solution_zoo.invalid_solution_count`, errors);
    requireRateAtMost(zoo.false_acceptance_rate, thresholds.maximumFalseAcceptanceRate, `${prefix}.solution_zoo.false_acceptance_rate`, errors);
    requireRateAtMost(zoo.false_rejection_rate, thresholds.maximumFalseRejectionRate, `${prefix}.solution_zoo.false_rejection_rate`, errors);
    if (zoo.accepts_all_valid !== true) errors.push(`${prefix}.solution_zoo.accepts_all_valid must be true`);
    if (zoo.rejects_all_invalid !== true) errors.push(`${prefix}.solution_zoo.rejects_all_invalid must be true`);

    const taskAudit = world?.task_audit ?? {};
    for (const key of TASK_ISSUE_KEYS) {
      if (!Number.isInteger(taskAudit[key]) || taskAudit[key] < 0) {
        errors.push(`${prefix}.task_audit.${key} must be a non-negative integer`);
      }
    }
    requireMaximum(taskAudit.severe_defects, thresholds.maximumSevereDefects, `${prefix}.task_audit.severe_defects`, errors);
    requireRateAtMost(taskAudit.ambiguity_rate, thresholds.maximumAmbiguityRate, `${prefix}.task_audit.ambiguity_rate`, errors);
    requireRateAtLeast(taskAudit.reviewer_agreement, thresholds.minimumReviewerAgreement, `${prefix}.task_audit.reviewer_agreement`, errors);

    validatePassEvidence(world?.counterfactual_twins, thresholds.minimumCounterfactualTwinPassRate, `${prefix}.counterfactual_twins`, errors);
    validatePassEvidence(world?.metamorphic_tests, thresholds.minimumMetamorphicPassRate, `${prefix}.metamorphic_tests`, errors);
    validatePassEvidence(world?.delayed_consequence_tests, thresholds.minimumDelayedConsequencePassRate, `${prefix}.delayed_consequence_tests`, errors);

    if (world?.status !== 'eligible') errors.push(`${prefix}.status must be eligible`);
  }

  const missingWorldIds = expectedWorldIds.filter((worldId) => !ids.has(worldId));
  const unexpectedWorldIds = [...ids].filter((worldId) => expectedWorldIds.length > 0 && !expectedWorldIds.includes(worldId));
  if (strict && document?.status !== 'complete') errors.push('strict world-quality validation requires status=complete');
  if (strict && missingWorldIds.length > 0) errors.push(`world-quality audit is missing worlds: ${missingWorldIds.join(', ')}`);
  if (unexpectedWorldIds.length > 0) warnings.push(`world-quality audit contains non-headline worlds: ${unexpectedWorldIds.join(', ')}`);
  if (!strict && document?.status !== 'complete') warnings.push('world-quality audit is preflight and cannot support a headline release');

  return result({
    errors,
    warnings,
    summary: {
      status: document?.status ?? null,
      worlds_audited: worlds.length,
      expected_worlds: expectedWorldIds.length,
      eligible_worlds: worlds.filter((world) => world?.status === 'eligible').length,
      missing_world_ids: missingWorldIds,
      maximum_false_acceptance_rate: max(worlds.map((world) => world?.solution_zoo?.false_acceptance_rate)),
      maximum_false_rejection_rate: max(worlds.map((world) => world?.solution_zoo?.false_rejection_rate)),
      severe_defects: sum(worlds.map((world) => world?.task_audit?.severe_defects)),
    },
  });
}

export function validateContaminationAudit(document, { strict = false, expectedWorldIds = [] } = {}) {
  const errors = [];
  const warnings = [];
  const worlds = Array.isArray(document?.worlds) ? document.worlds : [];

  requireProtocol(document, CONTAMINATION_AUDIT_PROTOCOL_VERSION, errors);
  requireString(document?.release_id, 'release_id', errors);
  requireIso(document?.generated_at, 'generated_at', errors);
  requireStatus(document?.status, errors);

  const policy = document?.policy ?? {};
  for (const field of ['sealed_vault', 'just_in_time_seeds', 'signed_access_log', 'provider_retention_controls', 'burn_on_strong_leak_signal']) {
    if (policy[field] !== true) errors.push(`policy.${field} must be true`);
  }

  const ids = new Set();
  for (const [index, world] of worlds.entries()) {
    const prefix = `worlds[${index}]`;
    requireString(world?.world_id, `${prefix}.world_id`, errors);
    if (world?.world_id && ids.has(world.world_id)) errors.push(`${prefix}.world_id must be unique`);
    if (world?.world_id) ids.add(world.world_id);
    requireMinimum(world?.probe_runs, 1, `${prefix}.probe_runs`, errors);
    requireMinimum(world?.canary_count, 1, `${prefix}.canary_count`, errors);
    requireMinimum(world?.access_event_count, 1, `${prefix}.access_event_count`, errors);
    if (!Number.isInteger(world?.strong_leak_signals) || world.strong_leak_signals < 0) {
      errors.push(`${prefix}.strong_leak_signals must be a non-negative integer`);
    }
    if (Number(world?.strong_leak_signals ?? 0) > 0 && world?.burned !== true) {
      errors.push(`${prefix} must be burned when strong_leak_signals > 0`);
    }
    if (world?.burned === true && !nonEmpty(world?.burn_reason)) errors.push(`${prefix}.burn_reason is required for burned worlds`);
    if (world?.headline_eligible === true && (world?.burned === true || Number(world?.strong_leak_signals ?? 0) > 0)) {
      errors.push(`${prefix} cannot be headline_eligible after a strong leak signal or burn`);
    }
  }

  const missingWorldIds = expectedWorldIds.filter((worldId) => !ids.has(worldId));
  if (strict && document?.status !== 'complete') errors.push('strict contamination validation requires status=complete');
  if (strict && missingWorldIds.length > 0) errors.push(`contamination audit is missing worlds: ${missingWorldIds.join(', ')}`);
  if (!strict && document?.status !== 'complete') warnings.push('contamination audit is preflight and cannot support a headline release');

  return result({
    errors,
    warnings,
    summary: {
      status: document?.status ?? null,
      worlds_audited: worlds.length,
      expected_worlds: expectedWorldIds.length,
      headline_eligible_worlds: worlds.filter((world) => world?.headline_eligible === true).length,
      burned_worlds: worlds.filter((world) => world?.burned === true).length,
      strong_leak_signals: sum(worlds.map((world) => world?.strong_leak_signals)),
      missing_world_ids: missingWorldIds,
    },
  });
}

export function validateStatisticalPrecisionReport(document, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const cells = Array.isArray(document?.cells) ? document.cells : [];
  const policy = { ...DEFAULT_PRECISION_THRESHOLDS, ...(document?.policy ?? {}) };

  requireProtocol(document, STATISTICAL_PRECISION_PROTOCOL_VERSION, errors);
  requireString(document?.release_id, 'release_id', errors);
  requireIso(document?.generated_at, 'generated_at', errors);
  requireStatus(document?.status, errors);
  if (policy.paired_seeds !== true) errors.push('policy.paired_seeds must be true');
  if (policy.hierarchical_model !== true) errors.push('policy.hierarchical_model must be true');
  if (policy.suppress_rank_on_overlap !== true) errors.push('policy.suppress_rank_on_overlap must be true');
  requireMinimum(policy.minimumEpisodesPerCell, DEFAULT_PRECISION_THRESHOLDS.minimumEpisodesPerCell, 'policy.minimumEpisodesPerCell', errors);
  requireRateAtMost(policy.maximumCiWidth, DEFAULT_PRECISION_THRESHOLDS.maximumCiWidth, 'policy.maximumCiWidth', errors);

  for (const [index, cell] of cells.entries()) {
    const prefix = `cells[${index}]`;
    for (const field of ['world_id', 'model_id', 'arm']) requireString(cell?.[field], `${prefix}.${field}`, errors);
    requireMinimum(cell?.attempts, policy.minimumEpisodesPerCell, `${prefix}.attempts`, errors);
    requireRate(cell?.ci_low, `${prefix}.ci_low`, errors);
    requireRate(cell?.ci_high, `${prefix}.ci_high`, errors);
    const width = Number(cell?.ci_high) - Number(cell?.ci_low);
    if (Number.isFinite(width) && width > Number(policy.maximumCiWidth) + 1e-12) {
      errors.push(`${prefix} CI width ${round(width)} exceeds ${policy.maximumCiWidth}`);
    }
    if (cell?.precision_met !== true) errors.push(`${prefix}.precision_met must be true`);
  }

  if (strict && document?.status !== 'complete') errors.push('strict precision validation requires status=complete');
  if (strict && cells.length === 0) errors.push('strict precision validation requires at least one measured cell');
  if (!strict && document?.status !== 'complete') warnings.push('statistical precision report is preflight and cannot support a headline release');

  return result({
    errors,
    warnings,
    summary: {
      status: document?.status ?? null,
      cells: cells.length,
      precise_cells: cells.filter((cell) => cell?.precision_met === true).length,
      maximum_ci_width: max(cells.map((cell) => Number(cell?.ci_high) - Number(cell?.ci_low))),
      all_cells_precise: cells.length > 0 && cells.every((cell) => cell?.precision_met === true),
    },
  });
}

export function validateCorrectionLedger(document, { strict = false, releaseId = null } = {}) {
  const errors = [];
  const warnings = [];
  const entries = Array.isArray(document?.entries) ? document.entries : [];

  requireProtocol(document, CORRECTION_LEDGER_PROTOCOL_VERSION, errors);
  requireIso(document?.updated_at, 'updated_at', errors);
  if (!['active', 'superseded'].includes(document?.status)) errors.push('status must be active or superseded');

  const ids = new Set();
  for (const [index, entry] of entries.entries()) {
    const prefix = `entries[${index}]`;
    requireString(entry?.correction_id, `${prefix}.correction_id`, errors);
    if (entry?.correction_id && ids.has(entry.correction_id)) errors.push(`${prefix}.correction_id must be unique`);
    if (entry?.correction_id) ids.add(entry.correction_id);
    requireIso(entry?.reported_at, `${prefix}.reported_at`, errors);
    if (!['open', 'resolved', 'rejected'].includes(entry?.status)) errors.push(`${prefix}.status is invalid`);
    if (!['low', 'moderate', 'severe', 'critical'].includes(entry?.severity)) errors.push(`${prefix}.severity is invalid`);
    if (!Array.isArray(entry?.affected_release_ids)) errors.push(`${prefix}.affected_release_ids must be an array`);
    requireString(entry?.public_summary, `${prefix}.public_summary`, errors);
    if (['severe', 'critical'].includes(entry?.severity) && entry?.status === 'resolved' && entry?.score_recomputed !== true) {
      errors.push(`${prefix}.score_recomputed must be true for resolved severe or critical corrections`);
    }
  }

  const relevantEntries = releaseId
    ? entries.filter((entry) => entry?.affected_release_ids?.includes(releaseId))
    : entries;
  const openBlocking = relevantEntries.filter((entry) => entry?.status === 'open' && ['severe', 'critical'].includes(entry?.severity));
  if (strict && document?.status !== 'active') errors.push('strict correction validation requires status=active');
  if (openBlocking.length > 0) errors.push(`release has ${openBlocking.length} open severe or critical corrections`);

  return result({
    errors,
    warnings,
    summary: {
      status: document?.status ?? null,
      entries: entries.length,
      relevant_entries: relevantEntries.length,
      open_blocking_corrections: openBlocking.length,
      score_recomputations: relevantEntries.filter((entry) => entry?.score_recomputed === true).length,
    },
  });
}

function validatePassEvidence(value, minimumPassRate, label, errors) {
  requireMinimum(value?.case_count, 1, `${label}.case_count`, errors);
  requireMinimum(value?.passed_count, 1, `${label}.passed_count`, errors);
  if (Number(value?.passed_count) > Number(value?.case_count)) errors.push(`${label}.passed_count cannot exceed case_count`);
  requireRateAtLeast(value?.pass_rate, minimumPassRate, `${label}.pass_rate`, errors);
  const computed = Number(value?.case_count) > 0 ? Number(value?.passed_count) / Number(value?.case_count) : NaN;
  if (Number.isFinite(computed) && Math.abs(computed - Number(value?.pass_rate)) > 0.0001) {
    errors.push(`${label}.pass_rate does not match passed_count / case_count`);
  }
}

function requireProtocol(document, protocol, errors) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    errors.push('document must be an object');
    return;
  }
  if (document.protocol_version !== protocol) errors.push(`protocol_version must be ${protocol}`);
}

function requireStatus(status, errors) {
  if (!['preflight', 'complete'].includes(status)) errors.push('status must be preflight or complete');
}

function requireString(value, label, errors) {
  if (!nonEmpty(value)) errors.push(`${label} must be a non-empty string`);
}

function requireIso(value, label, errors) {
  if (!nonEmpty(value) || Number.isNaN(Date.parse(value))) errors.push(`${label} must be an ISO timestamp`);
}

function requireHash(value, label, errors) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(value ?? ''))) errors.push(`${label} must be sha256:<64 lowercase hex>`);
}

function requireMinimum(value, minimum, label, errors) {
  if (!Number.isFinite(Number(value)) || Number(value) < Number(minimum)) errors.push(`${label} must be >= ${minimum}`);
}

function requireMaximum(value, maximum, label, errors) {
  if (!Number.isFinite(Number(value)) || Number(value) > Number(maximum)) errors.push(`${label} must be <= ${maximum}`);
}

function requireRate(value, label, errors) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1) errors.push(`${label} must be between 0 and 1`);
}

function requireRateAtMost(value, maximum, label, errors) {
  requireRate(value, label, errors);
  if (Number.isFinite(Number(value)) && Number(value) > Number(maximum)) errors.push(`${label} must be <= ${maximum}`);
}

function requireRateAtLeast(value, minimum, label, errors) {
  requireRate(value, label, errors);
  if (Number.isFinite(Number(value)) && Number(value) < Number(minimum)) errors.push(`${label} must be >= ${minimum}`);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(nonEmpty))];
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
}

function max(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : null;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function result({ errors, warnings, summary }) {
  return { ok: errors.length === 0, summary, errors, warnings };
}
