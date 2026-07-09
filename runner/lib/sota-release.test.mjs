// Run: node --test runner/lib/sota-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_RELEASE_ARMS,
  REQUIRED_RELEASE_METRICS,
  validateSotaReleaseManifest,
} from './sota-release.mjs';
import {
  REPLICATION_EVIDENCE_PROTOCOL_VERSION,
  REPLICATION_PROTOCOL_VERSION,
  validateReplicationEvidenceDocument,
} from './replication-evidence.mjs';
import {
  STRANGER_REPRODUCTION_PROTOCOL_VERSION,
  validateStrangerReproductionReceipt,
} from './stranger-reproduction.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function manifest(overrides = {}) {
  return {
    contractVersion: 'orgx-bench-v1.1',
    releaseId: 'sota-headline-2026-q3',
    releaseDate: '2026-07-09',
    status: 'candidate',
    publicationLabel: 'headline',
    preregistration: {
      protocolPath: 'docs/strategy/sota-undeniable-plan-2026-07-08.md',
      protocolHash: hash('a'),
      committedAt: '2026-07-08T00:00:00.000Z',
      firstRunLaunchedAt: '2026-07-09T00:00:00.000Z',
    },
    frontierSweep: {
      frontierModels: [
        'openai/gpt-5.6-high',
        'openai/gpt-6',
        'anthropic/claude-fable-5',
        'google/gemini-3',
        'deepseek/deepseek-v4-pro',
      ],
      arms: REQUIRED_RELEASE_ARMS,
      minK: 8,
      minEpisodesPerCell: 8,
      metrics: REQUIRED_RELEASE_METRICS,
    },
    evidence: {
      registryPath: 'worlds/corpus-splits.json',
      humanBaselinePlanPath: 'results/human-baseline-plan-2026q3.json',
      humanBaselineSummaryPath: 'results/human-baseline-summary.json',
      executionLedgerPath: 'results/sota-execution-ledger-2026q3.json',
      headlineBundlePath: 'results/sota-headline-2026-q3',
      externalReplicationSource: 'headline_bundle_metadata',
      externalReplicationEvidencePath: 'results/third-party-replication-2026q3.json',
      strangerReproductionReceiptPath: 'results/stranger-reproduction-2026q3.json',
    },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    protocolHash: hash('a'),
    registry: { splits: { private_holdout: { targetWorldCount: 20 } } },
    humanBaselineSummary: {
      humans: 3,
      samples: 60,
      worlds_with_minimum_humans: 20,
      protocol_eligible: true,
      headline_eligible: true,
    },
    headlineBundle: {
      exists: true,
      publicationLabel: 'headline',
      strictErrors: [],
    },
    executionLedger: executionLedger(),
    humanBaselinePlan: humanBaselinePlan(),
    replicationRows: [replicationRow()],
    replicationEvidence: replicationEvidence(),
    strangerReproduction: strangerReproductionEvidence(),
    ...overrides,
  };
}

function humanBaselinePlan(overrides = {}) {
  return {
    exists: true,
    path: 'results/human-baseline-plan-2026q3.json',
    validation: {
      ok: true,
      summary: {
        target_worlds: 20,
        required_sessions: 60,
        completed_sessions: 60,
        assigned_sessions: 0,
        unassigned_sessions: 0,
        worlds_complete: 20,
        worlds_fully_assigned_or_complete: 20,
        invalid_baseline_records: 0,
      },
      errors: [],
      warnings: [],
    },
    ...overrides,
  };
}

function executionLedger(overrides = {}) {
  return {
    exists: true,
    path: 'results/sota-execution-ledger-2026q3.json',
    validation: {
      ok: true,
      summary: {
        expectedJobCount: 9020,
        ledgerJobCount: 9020,
        planned: 0,
        launched: 0,
        scored: 8960,
        lost: 0,
        blocked: 60,
        terminal: 9020,
        unresolved: 0,
        modelJobs: 8960,
        humanBaselineJobs: 60,
      },
      errors: [],
      warnings: [],
    },
    ...overrides,
  };
}

function replicationRow(overrides = {}) {
  return {
    protocol_version: REPLICATION_PROTOCOL_VERSION,
    party_id: 'external-lab-1',
    party_name: 'External Lab 1',
    world_id: 'holdout-2026q3-01-revenue_leakage',
    submission_id: 'submission-1',
    model_manifest_id: 'models-frontier-2026q3',
    run_manifest_id: 'run-private-holdout-2026q3',
    seed_commitment_hash: hash('c'),
    signed_receipt_hash: hash('d'),
    scorecard_hash: hash('e'),
    replication_protocol_hash: hash('f'),
    discrepancy_log_hash: hash('0'),
    submitted_at: '2026-07-10T10:00:00.000Z',
    scored_at: '2026-07-10T10:05:00.000Z',
    agreement_within_ci: true,
    discrepancies: [],
    ...overrides,
  };
}

function replicationEvidence(overrides = {}) {
  const document = {
    protocol_version: REPLICATION_EVIDENCE_PROTOCOL_VERSION,
    release_id: 'sota-headline-2026-q3',
    generated_at: '2026-07-10T11:00:00.000Z',
    rows: [replicationRow()],
    ...overrides,
  };
  return {
    exists: true,
    path: 'results/third-party-replication-2026q3.json',
    rows: document.rows,
    validation: validateReplicationEvidenceDocument(document, { strict: false }),
  };
}

function strangerReceipt(overrides = {}) {
  return {
    protocol_version: STRANGER_REPRODUCTION_PROTOCOL_VERSION,
    release_id: 'sota-headline-2026-q3',
    reviewer_id: 'external-reviewer-1',
    reviewer_affiliation: 'Independent Eval Lab',
    recorded_at: '2026-07-11T00:00:00.000Z',
    command: 'npm run validate:release -- --strict --manifest results/sota-headline-2026-q3.json',
    public_inputs: [
      {
        path: 'results/sota-headline-2026-q3',
        sha256: hash('1'),
        role: 'headline_bundle',
      },
      {
        path: 'results/sota-headline-2026-q3.json',
        sha256: hash('2'),
        role: 'release_manifest',
      },
    ],
    result_hash: hash('3'),
    bundle_hash: hash('4'),
    release_manifest_hash: hash('5'),
    reproduction_log_hash: hash('6'),
    completed: true,
    matched_to_digit: true,
    deviations: [],
    reproduction_environment: [{ name: 'node', value: '26.x' }],
    ...overrides,
  };
}

function strangerReproductionEvidence(receiptOverrides = {}) {
  return {
    exists: true,
    path: 'results/stranger-reproduction-2026q3.json',
    validation: validateStrangerReproductionReceipt(strangerReceipt(receiptOverrides), { strict: false }),
  };
}

test('strict SOTA release validation accepts a complete release candidate', () => {
  const result = validateSotaReleaseManifest(manifest(), evidence(), { strict: true });

  assert.equal(result.ok, true);
  assert.equal(result.summary.failed, 0);
  assert.deepEqual(result.errors, []);
});

test('draft preflight remains structurally valid but reports missing evidence gates', () => {
  const result = validateSotaReleaseManifest(
    manifest({
      status: 'draft_preflight',
      evidence: {
        ...manifest().evidence,
        humanBaselinePlanPath: null,
        executionLedgerPath: null,
        headlineBundlePath: null,
        externalReplicationEvidencePath: null,
        strangerReproductionReceiptPath: null,
      },
    }),
    evidence({
      humanBaselineSummary: {
        humans: 0,
        samples: 0,
        worlds_with_minimum_humans: 0,
        protocol_eligible: false,
        headline_eligible: false,
      },
      executionLedger: { exists: false, strictErrors: ['executionLedgerPath is not set'] },
      humanBaselinePlan: { exists: false, strictErrors: ['humanBaselinePlanPath is not set'] },
      headlineBundle: { exists: false, strictErrors: ['headlineBundlePath is not set'] },
      replicationEvidence: { exists: false, rows: [], strictErrors: [] },
      replicationRows: [],
      strangerReproduction: { exists: false, strictErrors: ['strangerReproductionReceiptPath is not set'] },
    }),
    { strict: false }
  );

  assert.equal(result.ok, true);
  assert.equal(result.summary.failed, 6);
  assert.match(result.warnings.join('\n'), /execution-ledger/);
  assert.match(result.warnings.join('\n'), /human-baseline-plan/);
  assert.match(result.warnings.join('\n'), /timed-human-baselines/);
  assert.match(result.warnings.join('\n'), /strict-headline-bundle/);
  assert.match(result.warnings.join('\n'), /stranger-reproduction/);
});

test('strict mode rejects draft status and every missing release evidence gate', () => {
  const result = validateSotaReleaseManifest(
    manifest({ status: 'draft_preflight' }),
    evidence({
      humanBaselineSummary: null,
      executionLedger: { exists: false, strictErrors: ['missing'] },
      humanBaselinePlan: { exists: false, strictErrors: ['missing'] },
      headlineBundle: { exists: false, strictErrors: ['missing'] },
      replicationEvidence: { exists: false, rows: [], strictErrors: [] },
      replicationRows: [],
      strangerReproduction: { exists: false, strictErrors: ['missing'] },
    }),
    { strict: true }
  );
  const text = result.errors.join('\n');

  assert.equal(result.ok, false);
  assert.match(text, /status to be candidate or released/);
  assert.match(text, /execution-ledger/);
  assert.match(text, /human-baseline-plan/);
  assert.match(text, /timed-human-baselines/);
  assert.match(text, /strict-headline-bundle/);
  assert.match(text, /third-party-replication/);
  assert.match(text, /stranger-reproduction/);
});

test('strict release validation requires a fully assigned human-baseline plan', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({
      humanBaselinePlan: humanBaselinePlan({
        validation: {
          ok: true,
          summary: {
            target_worlds: 20,
            required_sessions: 60,
            completed_sessions: 0,
            assigned_sessions: 57,
            unassigned_sessions: 3,
            worlds_complete: 0,
            worlds_fully_assigned_or_complete: 19,
            invalid_baseline_records: 0,
          },
          errors: [],
          warnings: ['3 human-baseline sessions are unassigned.'],
        },
      }),
    }),
    { strict: true }
  );
  const gateText = JSON.stringify(result.gates.find((gate) => gate.id === 'human-baseline-plan'));

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /human-baseline-plan/);
  assert.match(gateText, /unassigned sessions/);
});

test('strict release validation requires the execution ledger to resolve every planned job', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({
      executionLedger: executionLedger({
        validation: {
          ok: true,
          summary: {
            expectedJobCount: 9020,
            ledgerJobCount: 9020,
            planned: 2,
            launched: 1,
            scored: 8957,
            lost: 0,
            blocked: 60,
            terminal: 9017,
            unresolved: 3,
            modelJobs: 8960,
            humanBaselineJobs: 60,
          },
          errors: [],
          warnings: ['execution ledger has 3 unresolved jobs'],
        },
      }),
    }),
    { strict: true }
  );

  assert.equal(result.ok, false);
  const gateText = JSON.stringify(result.gates.find((gate) => gate.id === 'execution-ledger'));
  assert.match(result.errors.join('\n'), /execution-ledger/);
  assert.match(gateText, /unresolved jobs/);
});

test('release validation rejects sweep designs that cannot support frontier claims', () => {
  const result = validateSotaReleaseManifest(
    manifest({
      frontierSweep: {
        frontierModels: ['openai/gpt-5.6-high'],
        arms: ['raw'],
        minK: 2,
        minEpisodesPerCell: 1,
        metrics: ['pass_at_k'],
      },
    }),
    evidence(),
    { strict: true }
  );
  const text = JSON.stringify(result.gates.find((gate) => gate.id === 'frontier-sweep-design'));

  assert.equal(result.ok, false);
  assert.match(text, /frontierModels/);
  assert.match(text, /missing arm: orgx_full/);
  assert.match(text, /missing metric: horizon_80/);
});

test('release validation rejects post-hoc preregistration and protocol hash drift', () => {
  const result = validateSotaReleaseManifest(
    manifest({
      preregistration: {
        protocolPath: 'docs/strategy/sota-undeniable-plan-2026-07-08.md',
        protocolHash: hash('a'),
        committedAt: '2026-07-09T00:00:00.000Z',
        firstRunLaunchedAt: '2026-07-08T00:00:00.000Z',
      },
    }),
    evidence({ protocolHash: hash('b') }),
    { strict: true }
  );
  const text = JSON.stringify(result.gates.find((gate) => gate.id === 'preregistration'));

  assert.match(text, /committedAt must precede/);
  assert.match(text, /protocolHash does not match/);
});

test('strict release validation requires a first-run launch timestamp', () => {
  const result = validateSotaReleaseManifest(
    manifest({
      preregistration: {
        ...manifest().preregistration,
        firstRunLaunchedAt: null,
      },
    }),
    evidence(),
    { strict: true }
  );
  const text = JSON.stringify(result.gates.find((gate) => gate.id === 'preregistration'));

  assert.equal(result.ok, false);
  assert.match(text, /firstRunLaunchedAt is required/);
});

test('release validation requires agreeing third-party replication evidence', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({ replicationRows: [replicationRow({ agreement_within_ci: false })] }),
    { strict: true }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /third-party-replication/);
});

test('release validation includes standalone third-party replication evidence errors', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({
      replicationRows: [replicationRow()],
      replicationEvidence: replicationEvidence({
        protocol_version: 'wrong',
      }),
    }),
    { strict: true }
  );
  const gateText = JSON.stringify(result.gates.find((gate) => gate.id === 'third-party-replication'));

  assert.equal(result.ok, false);
  assert.match(gateText, /third_party_replication_evidence_v1/);
});

test('release validation requires a completed outside reproduction receipt', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({ strangerReproduction: strangerReproductionEvidence({ completed: false, matched_to_digit: false }) }),
    { strict: true }
  );
  const gateText = JSON.stringify(result.gates.find((gate) => gate.id === 'stranger-reproduction'));

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /stranger-reproduction/);
  assert.match(gateText, /not completed/);
  assert.match(gateText, /does not match headline numbers/);
});

test('release validation requires reproduction receipt release_id to match the manifest', () => {
  const result = validateSotaReleaseManifest(
    manifest(),
    evidence({ strangerReproduction: strangerReproductionEvidence({ release_id: 'different-release' }) }),
    { strict: true }
  );
  const gateText = JSON.stringify(result.gates.find((gate) => gate.id === 'stranger-reproduction'));

  assert.equal(result.ok, false);
  assert.match(gateText, /does not match manifest releaseId/);
});
