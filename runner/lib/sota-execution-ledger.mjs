export const LEDGER_STATUSES = new Set(['planned', 'launched', 'scored', 'lost', 'blocked']);
export const LEDGER_TERMINAL_STATUSES = new Set(['scored', 'lost', 'blocked']);

export function createInitialSotaExecutionLedger({
  plan,
  releaseManifestPath = null,
  registryPath = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const entries = [
    ...(plan?.modelJobs ?? []).map((job) => ({
      kind: 'model',
      status: 'planned',
      jobId: job.jobId,
      releaseId: job.releaseId,
      worldId: job.worldId,
      split: job.split,
      model: job.model,
      arm: job.arm,
      seedIndex: job.seedIndex,
    })),
    ...(plan?.humanBaselineJobs ?? []).map((job) => ({
      kind: 'human_baseline',
      status: 'planned',
      jobId: job.jobId,
      releaseId: job.releaseId,
      worldId: job.worldId,
      split: job.split,
      arm: job.arm,
      humanSlot: job.humanSlot,
    })),
  ];
  const ledger = {
    contractVersion: 'orgx-bench-sota-execution-ledger-v1',
    releaseId: plan?.summary?.releaseId ?? null,
    generatedAt,
    source: {
      releaseManifestPath,
      registryPath,
    },
    plannedJobCount: plan?.summary?.totalExecutionUnits ?? entries.length,
    accounting: summarizeEntries(entries).accounting,
    entries,
  };
  return ledger;
}

export function validateSotaExecutionLedger({ ledger, plan, strict = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(ledger)) {
    return failure('execution ledger must be an object.');
  }
  if (!isRecord(plan) || !isRecord(plan.summary)) {
    return failure('sweep plan with summary is required.');
  }
  if (plan.ok === false) {
    errors.push(...(plan.errors ?? []).map((error) => `sweep plan is invalid: ${error}`));
  }

  const expectedJobs = [...(plan.modelJobs ?? []), ...(plan.humanBaselineJobs ?? [])];
  const expectedById = new Map(expectedJobs.map((job) => [job.jobId, job]));
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const seen = new Set();

  if (!nonEmpty(ledger.contractVersion)) errors.push('contractVersion is required.');
  if (!nonEmpty(ledger.releaseId)) errors.push('releaseId is required.');
  if (ledger.releaseId && plan.summary.releaseId && ledger.releaseId !== plan.summary.releaseId) {
    errors.push(`releaseId ${ledger.releaseId} must match sweep plan releaseId ${plan.summary.releaseId}.`);
  }
  if (!isIso(ledger.generatedAt)) errors.push('generatedAt must be an ISO timestamp.');
  if (!Number.isInteger(ledger.plannedJobCount)) errors.push('plannedJobCount must be an integer.');
  if (Number.isInteger(ledger.plannedJobCount) && ledger.plannedJobCount !== expectedJobs.length) {
    errors.push(`plannedJobCount ${ledger.plannedJobCount} must equal sweep plan job count ${expectedJobs.length}.`);
  }

  entries.forEach((entry, index) => {
    validateLedgerEntry({ entry, index, expectedById, seen, errors });
  });

  for (const expected of expectedJobs) {
    if (!seen.has(expected.jobId)) errors.push(`missing ledger entry for planned job ${expected.jobId}.`);
  }

  const summary = summarizeEntries(entries);
  validateDeclaredAccounting({ declared: ledger.accounting, actual: summary.accounting, errors });

  if (summary.accounting.unresolved > 0) {
    const message = `execution ledger has ${summary.accounting.unresolved} unresolved jobs (${summary.accounting.planned} planned, ${summary.accounting.launched} launched).`;
    if (strict) errors.push(message);
    else warnings.push(message);
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'execution_ledger_valid' : 'execution_ledger_invalid',
    summary: {
      expectedJobCount: expectedJobs.length,
      ledgerJobCount: entries.length,
      ...summary.accounting,
      modelJobs: summary.kindCounts.model ?? 0,
      humanBaselineJobs: summary.kindCounts.human_baseline ?? 0,
    },
    errors,
    warnings,
  };

  function failure(error) {
    return {
      ok: false,
      strict,
      status: 'execution_ledger_invalid',
      summary: {
        expectedJobCount: 0,
        ledgerJobCount: 0,
        planned: 0,
        launched: 0,
        scored: 0,
        lost: 0,
        blocked: 0,
        terminal: 0,
        unresolved: 0,
        modelJobs: 0,
        humanBaselineJobs: 0,
      },
      errors: [error],
      warnings: [],
    };
  }
}

export function summarizeSotaExecutionLedger(ledger) {
  return summarizeEntries(Array.isArray(ledger?.entries) ? ledger.entries : []);
}

export function updateSotaExecutionLedgerEntry({
  ledger,
  jobId,
  status,
  launchedAt,
  completedAt,
  bundleRunId,
  receiptHash,
  lossType,
  countedAsLoss,
  reason,
  notes,
} = {}) {
  if (!isRecord(ledger) || !Array.isArray(ledger.entries)) {
    throw new Error('ledger with entries array is required.');
  }
  if (!nonEmpty(jobId)) throw new Error('jobId is required.');
  if (!LEDGER_STATUSES.has(status)) {
    throw new Error(`status must be one of ${[...LEDGER_STATUSES].join(', ')}.`);
  }

  const index = ledger.entries.findIndex((entry) => entry?.jobId === jobId);
  if (index === -1) throw new Error(`ledger job ${jobId} was not found.`);

  const next = structuredClone(ledger);
  next.entries[index] = normalizeUpdatedEntry({
    entry: next.entries[index],
    status,
    launchedAt,
    completedAt,
    bundleRunId,
    receiptHash,
    lossType,
    countedAsLoss,
    reason,
    notes,
  });
  next.accounting = summarizeEntries(next.entries).accounting;
  return next;
}

function validateLedgerEntry({ entry, index, expectedById, seen, errors }) {
  const prefix = `entries[${index}]`;
  if (!isRecord(entry)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }

  const jobId = stringValue(entry.jobId);
  if (!jobId) {
    errors.push(`${prefix}.jobId is required.`);
    return;
  }
  if (seen.has(jobId)) errors.push(`duplicate ledger jobId ${jobId}.`);
  seen.add(jobId);

  const expected = expectedById.get(jobId);
  if (!expected) {
    errors.push(`${prefix}.jobId ${jobId} is not present in the sweep plan.`);
    return;
  }

  if (!LEDGER_STATUSES.has(entry.status)) errors.push(`${prefix}.status must be one of ${[...LEDGER_STATUSES].join(', ')}.`);
  const expectedKind = expected.model ? 'model' : 'human_baseline';
  if (entry.kind !== expectedKind) errors.push(`${prefix}.kind ${entry.kind ?? '<missing>'} must be ${expectedKind}.`);
  compareField({ entry, expected, field: 'releaseId', prefix, errors });
  compareField({ entry, expected, field: 'worldId', prefix, errors });
  compareField({ entry, expected, field: 'split', prefix, errors });
  compareField({ entry, expected, field: 'arm', prefix, errors });

  if (expected.model) {
    compareField({ entry, expected, field: 'model', prefix, errors });
    compareField({ entry, expected, field: 'seedIndex', prefix, errors });
  } else {
    compareField({ entry, expected, field: 'humanSlot', prefix, errors });
  }

  validateStatusEvidence({ entry, prefix, errors });
}

function normalizeUpdatedEntry({
  entry,
  status,
  launchedAt,
  completedAt,
  bundleRunId,
  receiptHash,
  lossType,
  countedAsLoss,
  reason,
  notes,
}) {
  const base = {
    kind: entry.kind,
    status,
    jobId: entry.jobId,
    releaseId: entry.releaseId,
    worldId: entry.worldId,
    split: entry.split,
    arm: entry.arm,
  };
  if (entry.model !== undefined) base.model = entry.model;
  if (entry.seedIndex !== undefined) base.seedIndex = entry.seedIndex;
  if (entry.humanSlot !== undefined) base.humanSlot = entry.humanSlot;

  if (['launched', 'scored', 'lost'].includes(status)) {
    base.launchedAt = launchedAt ?? entry.launchedAt;
  }
  if (['scored', 'lost'].includes(status)) {
    base.completedAt = completedAt ?? entry.completedAt;
  }
  if (status === 'scored') {
    base.bundleRunId = bundleRunId ?? entry.bundleRunId;
    base.receiptHash = receiptHash ?? entry.receiptHash;
  }
  if (status === 'lost') {
    base.countedAsLoss = countedAsLoss ?? entry.countedAsLoss ?? true;
    if (lossType ?? entry.lossType) base.lossType = lossType ?? entry.lossType;
    if (reason ?? entry.reason) base.reason = reason ?? entry.reason;
  }
  if (status === 'blocked') {
    base.reason = reason ?? entry.reason;
  }
  if (notes ?? entry.notes) base.notes = notes ?? entry.notes;

  return base;
}

function compareField({ entry, expected, field, prefix, errors }) {
  if (entry[field] !== expected[field]) {
    errors.push(`${prefix}.${field} ${entry[field] ?? '<missing>'} must match sweep plan ${expected[field]}.`);
  }
}

function validateStatusEvidence({ entry, prefix, errors }) {
  if (['launched', 'scored', 'lost'].includes(entry.status) && !isIso(entry.launchedAt)) {
    errors.push(`${prefix}.launchedAt is required for ${entry.status} jobs.`);
  }
  if (['scored', 'lost'].includes(entry.status) && !isIso(entry.completedAt)) {
    errors.push(`${prefix}.completedAt is required for ${entry.status} jobs.`);
  }
  if (entry.status === 'scored') {
    if (!nonEmpty(entry.bundleRunId)) errors.push(`${prefix}.bundleRunId is required for scored jobs.`);
    if (!isSha256(entry.receiptHash)) errors.push(`${prefix}.receiptHash must be sha256:<64 hex> for scored jobs.`);
  }
  if (entry.status === 'lost') {
    if (entry.countedAsLoss !== true) errors.push(`${prefix}.countedAsLoss must be true for lost jobs.`);
    if (!nonEmpty(entry.lossType) && !nonEmpty(entry.reason)) errors.push(`${prefix} requires lossType or reason for lost jobs.`);
  }
  if (entry.status === 'blocked' && !nonEmpty(entry.reason)) {
    errors.push(`${prefix}.reason is required for blocked jobs.`);
  }
}

function summarizeEntries(entries) {
  const statusCounts = Object.fromEntries([...LEDGER_STATUSES].map((status) => [status, 0]));
  const kindCounts = {};
  for (const entry of entries) {
    if (LEDGER_STATUSES.has(entry?.status)) statusCounts[entry.status] += 1;
    if (entry?.kind) kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;
  }
  const terminal = [...LEDGER_TERMINAL_STATUSES].reduce((sum, status) => sum + statusCounts[status], 0);
  const unresolved = statusCounts.planned + statusCounts.launched;
  return {
    accounting: {
      planned: statusCounts.planned,
      launched: statusCounts.launched,
      scored: statusCounts.scored,
      lost: statusCounts.lost,
      blocked: statusCounts.blocked,
      terminal,
      unresolved,
      total: entries.length,
    },
    kindCounts,
  };
}

function validateDeclaredAccounting({ declared, actual, errors }) {
  if (!isRecord(declared)) {
    errors.push('accounting is required.');
    return;
  }
  for (const [field, value] of Object.entries(actual)) {
    if (declared[field] !== value) {
      errors.push(`accounting.${field} ${declared[field] ?? '<missing>'} must equal computed ${value}.`);
    }
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nonEmpty(value) {
  return stringValue(value).length > 0;
}

function isIso(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}
