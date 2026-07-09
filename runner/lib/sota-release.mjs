import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { HUMAN_BASELINE_MIN_N } from './human-baselines.mjs';
import { summarizeReplicationRows } from './replication-evidence.mjs';

export const RELEASE_STATUS = new Set(['draft_preflight', 'preregistered', 'running', 'candidate', 'released']);
export const RELEASE_PUBLICATION_LABEL = 'headline';
export const RELEASE_MIN_K = 8;
export const RELEASE_MIN_EPISODES_PER_CELL = 8;
export const RELEASE_MIN_FRONTIER_MODELS = 5;
export const REQUIRED_RELEASE_ARMS = [
  'raw',
  'best_of_n',
  'self_reflection',
  'open_agent_scaffold',
  'orgx_full',
  'orgx_minus_verification',
  'orgx_minus_memory_provenance',
  'orgx_minus_approval_gate',
  'timed_human',
];
export const REQUIRED_RELEASE_METRICS = [
  'pass_at_k',
  'pass_pow_k',
  'horizon_50',
  'horizon_80',
  'gate_depth',
  'cost_per_accepted_work_product',
  'human_rework_minutes',
  'perturbation_survival_rate',
];

export function validateSotaReleaseManifest(manifest, evidence = {}, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const gates = [];

  validateReleaseShape(manifest, errors);

  const holdoutTarget = Number(
    evidence.registry?.splits?.private_holdout?.targetWorldCount ??
      evidence.registry?.splits?.private_holdout?.worlds?.length ??
      20
  );

  gates.push(preregistrationGate(manifest, evidence, { strict }));
  gates.push(frontierSweepGate(manifest));
  gates.push(executionLedgerGate(evidence.executionLedger, { strict }));
  gates.push(humanBaselinePlanGate(evidence.humanBaselinePlan, { strict }));
  gates.push(humanBaselineGate(evidence.humanBaselineSummary, holdoutTarget));
  gates.push(headlineBundleGate(evidence.headlineBundle));
  gates.push(replicationGate(evidence.replicationRows, evidence.replicationEvidence));
  gates.push(strangerReproductionGate(evidence.strangerReproduction, manifest));

  if (strict && !['candidate', 'released'].includes(manifest?.status)) {
    errors.push('strict release validation requires status to be candidate or released.');
  }

  const failedGates = gates.filter((gate) => gate.status === 'fail');
  if (!strict) {
    for (const gate of failedGates) warnings.push(`${gate.id}: ${gate.remediation}`);
  } else {
    for (const gate of failedGates) errors.push(`${gate.id}: ${gate.remediation}`);
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'release_gate_passed' : 'release_gate_failed',
    summary: {
      total: gates.length,
      passed: gates.filter((gate) => gate.status === 'pass').length,
      failed: failedGates.length,
    },
    errors,
    warnings,
    gates,
  };
}

export async function sha256File(filePath) {
  const data = await readFile(filePath);
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}

function validateReleaseShape(manifest, errors) {
  if (!isRecord(manifest)) {
    errors.push('release manifest must be an object.');
    return;
  }
  for (const field of ['contractVersion', 'releaseId', 'releaseDate', 'status', 'publicationLabel', 'preregistration', 'frontierSweep', 'evidence']) {
    if (manifest[field] === undefined) errors.push(`missing required field: ${field}`);
  }
  if (manifest.status && !RELEASE_STATUS.has(manifest.status)) {
    errors.push(`status must be one of ${[...RELEASE_STATUS].join(', ')}.`);
  }
  if (manifest.publicationLabel !== RELEASE_PUBLICATION_LABEL) {
    errors.push(`publicationLabel must be ${RELEASE_PUBLICATION_LABEL} for SOTA release validation.`);
  }
}

function preregistrationGate(manifest, evidence, { strict = false } = {}) {
  const pre = manifest?.preregistration ?? {};
  const issues = [];
  if (!nonEmpty(pre.protocolPath)) issues.push('protocolPath is required');
  if (!isSha256(pre.protocolHash)) issues.push('protocolHash must be sha256:<64 hex>');
  if (!isIso(pre.committedAt)) issues.push('committedAt must be an ISO timestamp');
  if (strict && !isIso(pre.firstRunLaunchedAt)) issues.push('firstRunLaunchedAt is required for strict release validation');
  if (pre.firstRunLaunchedAt !== null && pre.firstRunLaunchedAt !== undefined && !isIso(pre.firstRunLaunchedAt)) {
    issues.push('firstRunLaunchedAt must be null or an ISO timestamp');
  }
  if (isIso(pre.committedAt) && isIso(pre.firstRunLaunchedAt) && Date.parse(pre.committedAt) >= Date.parse(pre.firstRunLaunchedAt)) {
    issues.push('committedAt must precede firstRunLaunchedAt');
  }
  if (evidence.protocolHash && pre.protocolHash && evidence.protocolHash !== pre.protocolHash) {
    issues.push(`protocolHash does not match ${pre.protocolPath}`);
  }
  return gate({
    id: 'preregistration',
    pass: issues.length === 0,
    evidence: {
      protocolPath: pre.protocolPath ?? null,
      protocolHash: pre.protocolHash ?? null,
      committedAt: pre.committedAt ?? null,
      firstRunLaunchedAt: pre.firstRunLaunchedAt ?? null,
    },
    details: issues,
    remediation: 'Commit a preregistered protocol hash before the first frontier sweep run.',
  });
}

function executionLedgerGate(executionLedger, { strict = false } = {}) {
  const validation = executionLedger?.validation;
  const missing = executionLedger?.exists !== true;
  const unresolved = Number(validation?.summary?.unresolved ?? 0);
  const issues = [
    ...(missing ? ['executionLedgerPath is not set or does not point at a readable ledger'] : []),
    ...(!missing && !validation ? ['execution ledger validation result is required'] : []),
    ...((validation?.errors ?? []).map((error) => String(error))),
    ...(strict && unresolved > 0 ? [`execution ledger has ${unresolved} unresolved jobs`] : []),
  ];
  return gate({
    id: 'execution-ledger',
    pass: issues.length === 0,
    evidence: executionLedger
      ? {
          exists: executionLedger.exists === true,
          path: executionLedger.path ?? null,
          summary: validation?.summary ?? null,
          warnings: validation?.warnings ?? [],
          errors: validation?.errors ?? [],
        }
      : null,
    details: issues,
    remediation: 'Create and maintain a SOTA execution ledger so every planned sweep job is scored, lost, or explicitly blocked.',
  });
}

function humanBaselinePlanGate(humanBaselinePlan, { strict = false } = {}) {
  const validation = humanBaselinePlan?.validation;
  const missing = humanBaselinePlan?.exists !== true;
  const unassigned = Number(validation?.summary?.unassigned_sessions ?? 0);
  const issues = [
    ...(missing ? ['humanBaselinePlanPath is not set or does not point at a readable plan'] : []),
    ...(!missing && !validation ? ['human baseline plan validation result is required'] : []),
    ...((validation?.errors ?? []).map((error) => String(error))),
    ...(strict && unassigned > 0 ? [`human baseline plan has ${unassigned} unassigned sessions`] : []),
  ];
  return gate({
    id: 'human-baseline-plan',
    pass: issues.length === 0,
    evidence: humanBaselinePlan
      ? {
          exists: humanBaselinePlan.exists === true,
          path: humanBaselinePlan.path ?? null,
          summary: validation?.summary ?? null,
          warnings: validation?.warnings ?? [],
          errors: validation?.errors ?? [],
        }
      : null,
    details: issues,
    remediation: 'Create and assign the timed-human baseline plan for every private holdout world.',
  });
}

function frontierSweepGate(manifest) {
  const sweep = manifest?.frontierSweep ?? {};
  const arms = new Set((sweep.arms ?? []).map((arm) => String(arm)));
  const metrics = new Set((sweep.metrics ?? []).map((metric) => String(metric)));
  const missingArms = REQUIRED_RELEASE_ARMS.filter((arm) => !arms.has(arm));
  const missingMetrics = REQUIRED_RELEASE_METRICS.filter((metric) => !metrics.has(metric));
  const issues = [
    ...(Number(sweep.minK ?? 0) < RELEASE_MIN_K ? [`minK must be >= ${RELEASE_MIN_K}`] : []),
    ...(Number(sweep.minEpisodesPerCell ?? 0) < RELEASE_MIN_EPISODES_PER_CELL
      ? [`minEpisodesPerCell must be >= ${RELEASE_MIN_EPISODES_PER_CELL}`]
      : []),
    ...((sweep.frontierModels ?? []).length < RELEASE_MIN_FRONTIER_MODELS
      ? [`frontierModels must include at least ${RELEASE_MIN_FRONTIER_MODELS} models`]
      : []),
    ...missingArms.map((arm) => `missing arm: ${arm}`),
    ...missingMetrics.map((metric) => `missing metric: ${metric}`),
  ];
  return gate({
    id: 'frontier-sweep-design',
    pass: issues.length === 0,
    evidence: {
      frontierModelCount: (sweep.frontierModels ?? []).length,
      minK: sweep.minK ?? null,
      minEpisodesPerCell: sweep.minEpisodesPerCell ?? null,
      arms: sweep.arms ?? [],
      metrics: sweep.metrics ?? [],
    },
    details: issues,
    remediation: 'Declare the full frontier model, arm, metric, n, and k matrix before publishing a headline release.',
  });
}

function humanBaselineGate(summary, holdoutTarget) {
  const pass =
    Boolean(summary?.headline_eligible) &&
    summary?.protocol_eligible === true &&
    Number(summary?.humans ?? 0) >= HUMAN_BASELINE_MIN_N &&
    Number(summary?.worlds_with_minimum_humans ?? 0) >= holdoutTarget;
  return gate({
    id: 'timed-human-baselines',
    pass,
    evidence: summary
      ? {
          humans: summary.humans,
          samples: summary.samples,
          worlds_with_minimum_humans: summary.worlds_with_minimum_humans,
          target_worlds: holdoutTarget,
          protocol_eligible: summary.protocol_eligible,
          headline_eligible: summary.headline_eligible,
        }
      : null,
    remediation: `Collect at least ${HUMAN_BASELINE_MIN_N} protocol-valid human baselines for every private holdout world.`,
  });
}

function headlineBundleGate(bundle) {
  const pass =
    Boolean(bundle?.exists) &&
    bundle?.publicationLabel === RELEASE_PUBLICATION_LABEL &&
    Array.isArray(bundle?.strictErrors) &&
    bundle.strictErrors.length === 0;
  return gate({
    id: 'strict-headline-bundle',
    pass,
    evidence: bundle ?? null,
    remediation: 'Publish a strict-valid headline bundle with private holdout tasks, loss accounting, provider usage, human baselines, and replication evidence.',
  });
}

function replicationGate(rows, replicationEvidence = null) {
  const summary = summarizeReplicationRows(rows ?? []);
  const evidenceErrors = [
    ...((replicationEvidence?.validation?.errors ?? []).map((error) => String(error))),
    ...((replicationEvidence?.strictErrors ?? []).map((error) => String(error))),
  ];
  return gate({
    id: 'third-party-replication',
    pass: summary.validRows > 0 && summary.agreementWithinCiRows > 0 && evidenceErrors.length === 0,
    evidence: {
      rows: summary.rows,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows,
      independentParties: summary.independentParties,
      agreementWithinCiRows: summary.agreementWithinCiRows,
      evidencePath: replicationEvidence?.path ?? null,
      evidenceDocumentPresent: replicationEvidence?.exists === true,
      errors: [...summary.errors, ...evidenceErrors],
    },
    details: evidenceErrors,
    remediation: 'Attach at least one valid third-party replication row with agreement_within_ci:true.',
  });
}

function strangerReproductionGate(strangerReproduction, manifest) {
  const validation = strangerReproduction?.validation;
  const summary = validation?.summary ?? {};
  const missing = strangerReproduction?.exists !== true;
  const releaseIdMismatch =
    nonEmpty(summary.release_id) &&
    nonEmpty(manifest?.releaseId) &&
    summary.release_id !== manifest.releaseId;
  const readinessIssues = [];

  if (summary.completed !== true) readinessIssues.push('receipt is not completed');
  if (summary.matched_to_digit !== true) readinessIssues.push('receipt does not match headline numbers to the digit');
  if (releaseIdMismatch) {
    readinessIssues.push(`receipt release_id ${summary.release_id} does not match manifest releaseId ${manifest.releaseId}`);
  }

  const validationErrors = [
    ...((validation?.errors ?? []).map((error) => String(error))),
    ...((strangerReproduction?.strictErrors ?? []).map((error) => String(error))),
  ];
  const issues = [
    ...(missing ? ['strangerReproductionReceiptPath is not set or does not point at a readable receipt'] : []),
    ...(!missing && !validation ? ['stranger reproduction receipt validation result is required'] : []),
    ...(!missing ? validationErrors : []),
    ...(!missing && validation ? readinessIssues : []),
  ];

  return gate({
    id: 'stranger-reproduction',
    pass: issues.length === 0,
    evidence: strangerReproduction
      ? {
          exists: strangerReproduction.exists === true,
          path: strangerReproduction.path ?? null,
          summary: validation?.summary ?? null,
          warnings: validation?.warnings ?? [],
          errors: validationErrors,
        }
      : null,
    details: issues,
    remediation: 'Record an outside reviewer recomputing the headline release from public files to the digit.',
  });
}

function gate({ id, pass, evidence, details = [], remediation }) {
  return {
    id,
    status: pass ? 'pass' : 'fail',
    evidence,
    ...(details.length ? { details } : {}),
    ...(pass ? {} : { remediation }),
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIso(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}
