// Run: node --test runner/lib/sota-execution-ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialSotaExecutionLedger,
  summarizeSotaExecutionLedger,
  updateSotaExecutionLedgerEntry,
  validateSotaExecutionLedger,
} from './sota-execution-ledger.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function plan() {
  return {
    ok: true,
    errors: [],
    summary: {
      releaseId: 'sota-headline-2026-q3',
      totalExecutionUnits: 3,
    },
    modelJobs: [
      {
        jobId: 'job-model-1',
        releaseId: 'sota-headline-2026-q3',
        worldId: 'holdout-1',
        split: 'private_holdout',
        model: 'openai/gpt-6',
        arm: 'raw',
        seedIndex: 1,
      },
      {
        jobId: 'job-model-2',
        releaseId: 'sota-headline-2026-q3',
        worldId: 'holdout-1',
        split: 'private_holdout',
        model: 'openai/gpt-6',
        arm: 'orgx_full',
        seedIndex: 1,
      },
    ],
    humanBaselineJobs: [
      {
        jobId: 'job-human-1',
        releaseId: 'sota-headline-2026-q3',
        worldId: 'holdout-1',
        split: 'private_holdout',
        arm: 'timed_human',
        humanSlot: 1,
      },
    ],
  };
}

function terminalLedger() {
  const ledger = createInitialSotaExecutionLedger({ plan: plan(), generatedAt: '2026-07-09T00:00:00.000Z' });
  ledger.entries[0] = {
    ...ledger.entries[0],
    status: 'scored',
    launchedAt: '2026-07-09T01:00:00.000Z',
    completedAt: '2026-07-09T01:05:00.000Z',
    bundleRunId: 'bundle-run-1',
    receiptHash: hash('a'),
  };
  ledger.entries[1] = {
    ...ledger.entries[1],
    status: 'lost',
    launchedAt: '2026-07-09T01:00:00.000Z',
    completedAt: '2026-07-09T01:04:00.000Z',
    countedAsLoss: true,
    lossType: 'timeout',
  };
  ledger.entries[2] = {
    ...ledger.entries[2],
    status: 'blocked',
    reason: 'human baseline slot could not be scheduled before cutoff',
  };
  ledger.accounting = summarizeSotaExecutionLedger(ledger).accounting;
  return ledger;
}

test('createInitialSotaExecutionLedger binds every planned model and human job', () => {
  const ledger = createInitialSotaExecutionLedger({
    plan: plan(),
    releaseManifestPath: 'results/sota-release-manifest.example.json',
    registryPath: 'worlds/corpus-splits.json',
    generatedAt: '2026-07-09T00:00:00.000Z',
  });

  assert.equal(ledger.releaseId, 'sota-headline-2026-q3');
  assert.equal(ledger.plannedJobCount, 3);
  assert.equal(ledger.entries.length, 3);
  assert.equal(ledger.entries[0].kind, 'model');
  assert.equal(ledger.entries[2].kind, 'human_baseline');
  assert.equal(ledger.accounting.planned, 3);
  assert.equal(ledger.accounting.unresolved, 3);
});

test('non-strict ledger validation accepts a prelaunch planned ledger with warning', () => {
  const ledger = createInitialSotaExecutionLedger({ plan: plan(), generatedAt: '2026-07-09T00:00:00.000Z' });
  const result = validateSotaExecutionLedger({ ledger, plan: plan(), strict: false });

  assert.equal(result.ok, true);
  assert.equal(result.summary.unresolved, 3);
  assert.match(result.warnings.join('\n'), /unresolved jobs/);
});

test('strict ledger validation rejects unresolved planned or launched jobs', () => {
  const ledger = createInitialSotaExecutionLedger({ plan: plan(), generatedAt: '2026-07-09T00:00:00.000Z' });
  const result = validateSotaExecutionLedger({ ledger, plan: plan(), strict: true });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unresolved jobs/);
});

test('strict ledger validation accepts scored, lost, and blocked terminal jobs', () => {
  const result = validateSotaExecutionLedger({ ledger: terminalLedger(), plan: plan(), strict: true });

  assert.equal(result.ok, true);
  assert.equal(result.summary.scored, 1);
  assert.equal(result.summary.lost, 1);
  assert.equal(result.summary.blocked, 1);
  assert.equal(result.summary.unresolved, 0);
});

test('ledger validation catches missing jobs, unknown jobs, field drift, and bad accounting', () => {
  const ledger = terminalLedger();
  ledger.entries.pop();
  ledger.entries.push({
    kind: 'model',
    status: 'scored',
    jobId: 'unknown-job',
    releaseId: 'sota-headline-2026-q3',
    worldId: 'holdout-2',
    split: 'private_holdout',
    model: 'openai/gpt-6',
    arm: 'raw',
    seedIndex: 1,
    launchedAt: '2026-07-09T01:00:00.000Z',
    completedAt: '2026-07-09T01:05:00.000Z',
    bundleRunId: 'bundle-run-unknown',
    receiptHash: hash('b'),
  });
  ledger.entries[0].worldId = 'holdout-drift';
  ledger.accounting.scored = 99;

  const result = validateSotaExecutionLedger({ ledger, plan: plan(), strict: true });
  const text = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(text, /unknown-job is not present/);
  assert.match(text, /missing ledger entry for planned job job-human-1/);
  assert.match(text, /worldId holdout-drift must match sweep plan holdout-1/);
  assert.match(text, /accounting.scored 99 must equal computed/);
});

test('updateSotaExecutionLedgerEntry safely records scored jobs and recomputes accounting', () => {
  const ledger = createInitialSotaExecutionLedger({ plan: plan(), generatedAt: '2026-07-09T00:00:00.000Z' });
  const updated = updateSotaExecutionLedgerEntry({
    ledger,
    jobId: 'job-model-1',
    status: 'scored',
    launchedAt: '2026-07-09T01:00:00.000Z',
    completedAt: '2026-07-09T01:05:00.000Z',
    bundleRunId: 'bundle-run-1',
    receiptHash: hash('a'),
  });

  assert.equal(ledger.accounting.planned, 3);
  assert.equal(updated.accounting.planned, 2);
  assert.equal(updated.accounting.scored, 1);
  assert.equal(updated.accounting.unresolved, 2);
  assert.equal(updated.entries[0].status, 'scored');
  assert.equal(updated.entries[0].bundleRunId, 'bundle-run-1');
  assert.equal(validateSotaExecutionLedger({ ledger: updated, plan: plan(), strict: false }).ok, true);
});

test('updateSotaExecutionLedgerEntry strips stale scored fields when marking a job blocked', () => {
  const ledger = terminalLedger();
  const updated = updateSotaExecutionLedgerEntry({
    ledger,
    jobId: 'job-model-1',
    status: 'blocked',
    reason: 'provider outage before launch',
  });
  const entry = updated.entries.find((candidate) => candidate.jobId === 'job-model-1');

  assert.equal(entry.status, 'blocked');
  assert.equal(entry.reason, 'provider outage before launch');
  assert.equal(entry.bundleRunId, undefined);
  assert.equal(entry.receiptHash, undefined);
  assert.equal(entry.launchedAt, undefined);
  assert.equal(updated.accounting.blocked, 2);
  assert.equal(updated.accounting.scored, 0);
});

test('updateSotaExecutionLedgerEntry refuses unknown jobs and invalid statuses', () => {
  const ledger = createInitialSotaExecutionLedger({ plan: plan(), generatedAt: '2026-07-09T00:00:00.000Z' });

  assert.throws(
    () => updateSotaExecutionLedgerEntry({ ledger, jobId: 'missing', status: 'blocked', reason: 'nope' }),
    /was not found/
  );
  assert.throws(
    () => updateSotaExecutionLedgerEntry({ ledger, jobId: 'job-model-1', status: 'done' }),
    /status must be one of/
  );
});
