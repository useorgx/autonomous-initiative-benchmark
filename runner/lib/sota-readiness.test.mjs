// Run: node --test runner/lib/sota-readiness.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REQUIRED_HOLDOUT_ANATOMY,
  REQUIRED_PROVIDER_KEYS,
  REQUIRED_SCRIPTS,
  REQUIRED_SCHEMAS,
  REQUIRED_V4_VALIDATORS,
  evaluateSotaReadiness,
} from './sota-readiness.mjs';

test('SOTA readiness passes only when every public, private, and external evidence gate is satisfied', () => {
  const report = evaluateSotaReadiness(completeFixture());

  assert.equal(report.ok, true);
  assert.equal(report.status, 'sota_ready');
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.passed > 10);
});

test('SOTA readiness fails loudly when headline-only evidence is missing', () => {
  const report = evaluateSotaReadiness({
    ...completeFixture(),
    registry: {
      splits: {
        initiative_worlds_preview: { worlds: [{ worldId: 'only-one' }] },
        private_holdout: {
          targetWorldCount: 20,
          targetWorldShape: 'parametric_generators',
          worlds: [],
        },
        rotating_canary: {
          targetWorldsPerQuarter: 10,
          worlds: [],
        },
      },
    },
    humanBaselineSummary: null,
    orgxEvidence: { exists: true },
    headlineBundleCount: 0,
    externallyReplicatedRows: 0,
    strangerReproduction: { exists: false, strictErrors: ['missing'] },
  });

  assert.equal(report.ok, false);
  const failedIds = new Set(report.checks.filter((check) => check.status === 'fail').map((check) => check.id));
  assert.ok(failedIds.has('ws2.public-preview-scale'));
  assert.ok(failedIds.has('ws2.private-holdout-generators'));
  assert.ok(failedIds.has('ws2.rotating-canaries'));
  assert.ok(failedIds.has('ws3.timed-human-baselines'));
  assert.ok(failedIds.has('ws4.orgx-pinning-and-lab'));
  assert.ok(failedIds.has('ws6.frontier-headline-release'));
  assert.ok(failedIds.has('ws6.third-party-replication'));
  assert.ok(failedIds.has('ws6.stranger-reproduction'));
});

test('SOTA readiness rejects malformed canary commitments', () => {
  const fixture = completeFixture();
  fixture.registry.splits.rotating_canary.rotationCalendar[0] = {
    canaryId: 'canary-missing-hashes',
    quarter: '2026-Q3',
    domain: 'security_scope',
    status: 'scheduled_private',
  };

  const report = evaluateSotaReadiness(fixture);
  const canaryGate = report.checks.find((check) => check.id === 'ws2.rotating-canaries');

  assert.equal(report.ok, false);
  assert.equal(canaryGate.status, 'fail');
  assert.equal(canaryGate.evidence.canaryCommitmentCount, 10);
  assert.equal(canaryGate.evidence.validCommitmentCount, 9);
});

test('SOTA readiness rejects malformed private holdout commitments', () => {
  const fixture = completeFixture();
  fixture.registry.splits.private_holdout.worlds[0] = {
    worldId: 'holdout-missing-validator-hash',
    domain: 'security_scope',
    status: 'committed_private',
    generatorType: 'parametric',
    seedCommitmentHash: `sha256:${'a'.repeat(64)}`,
    difficultyKnobs: ['horizon_steps', 'state_size', 'distractor_density', 'perturbation_rate'],
    anatomy: REQUIRED_HOLDOUT_ANATOMY,
  };

  const report = evaluateSotaReadiness(fixture);
  const holdoutGate = report.checks.find((check) => check.id === 'ws2.private-holdout-generators');

  assert.equal(report.ok, false);
  assert.equal(holdoutGate.status, 'fail');
  assert.equal(holdoutGate.evidence.privateHoldoutWorldCount, 20);
  assert.equal(holdoutGate.evidence.validCommitmentCount, 19);
});

test('SOTA readiness rejects human baselines that do not cover every holdout world', () => {
  const fixture = completeFixture();
  fixture.humanBaselineSummary = {
    humans: 3,
    samples: 3,
    worlds_with_minimum_humans: 1,
    protocol_eligible: true,
    headline_eligible: true,
  };

  const report = evaluateSotaReadiness(fixture);
  const humanGate = report.checks.find((check) => check.id === 'ws3.timed-human-baselines');

  assert.equal(report.ok, false);
  assert.equal(humanGate.status, 'fail');
  assert.equal(humanGate.evidence.worlds_with_minimum_humans, 1);
  assert.equal(humanGate.evidence.target_worlds, 20);
});

function completeFixture() {
  return {
    artifacts: Object.fromEntries(
      [
        ...REQUIRED_SCHEMAS,
        'docs/orgx-bench-v1-contract.md',
        'docs/strategy/sota-undeniable-plan-2026-07-08.md',
        'runner/lib/prompt-audit.mjs',
        'runner/lib/dimension-independence.mjs',
        'runner/lib/validate-bundle-contract.test.mjs',
        'runner/lib/run-manifest.mjs',
        'runner/lib/run-manifest.test.mjs',
        'results/benchmark-run-manifest.example.json',
      ].map((file) => [file, true])
    ),
    packageJson: {
      scripts: Object.fromEntries(REQUIRED_SCRIPTS.map((script) => [script, `run ${script}`])),
    },
    providerKeys: REQUIRED_PROVIDER_KEYS,
    validatorTypes: REQUIRED_V4_VALIDATORS,
    registry: {
      splits: {
        initiative_worlds_preview: {
          worlds: Array.from({ length: 10 }, (_, index) => ({ worldId: `preview-${index}` })),
        },
        private_holdout: {
          targetWorldCount: 20,
          targetWorldShape: 'parametric_generators',
          worlds: holdoutCommitments(20),
        },
        rotating_canary: {
          targetWorldsPerQuarter: 10,
          rotationCalendar: Array.from({ length: 10 }, (_, index) => ({
            canaryId: `canary-${index}`,
            quarter: '2026-Q3',
            domain: `domain-${index}`,
            seedCommitmentHash: `sha256:${'a'.repeat(63)}${index}`,
            validatorBundleHash: `sha256:${'b'.repeat(63)}${index}`,
            status: 'scheduled_private',
          })),
        },
      },
    },
    futureModelDrills: [
      {
        ok: true,
        model: 'gpt-6-fire-drill-stub',
        split: 'public_validation',
        worldCount: 10,
        jobCount: 20,
        manifests: {
          evaluationManifest: { id: 'eval' },
          runManifest: { id: 'run' },
        },
      },
    ],
    humanBaselineSummary: {
      humans: 3,
      samples: 60,
      worlds_with_minimum_humans: 20,
      protocol_eligible: true,
      headline_eligible: true,
    },
    orgxEvidence: {
      exists: true,
      pinningViolation: true,
      pinningChaosTest: true,
      manifestIds: true,
      labPublishabilityReason: true,
      submissionApi: true,
      leakAudit: true,
    },
    headlineBundleCount: 1,
    externallyReplicatedRows: 1,
    strangerReproduction: {
      exists: true,
      path: 'results/stranger-reproduction-2026q3.json',
      validation: {
        ok: true,
        summary: {
          completed: true,
          matched_to_digit: true,
          reviewer_id: 'external-reviewer-1',
          result_hash: `sha256:${'d'.repeat(64)}`,
        },
        errors: [],
        warnings: [],
      },
    },
  };
}

function holdoutCommitments(count) {
  return Array.from({ length: count }, (_, index) => ({
    worldId: `holdout-${index}`,
    domain: `domain-${index}`,
    status: 'committed_private',
    generatorType: 'parametric',
    generatorSourceHash: shaFor('a', index),
    seedCommitmentHash: shaFor('b', index),
    validatorBundleHash: shaFor('c', index),
    difficultyKnobs: ['horizon_steps', 'state_size', 'distractor_density', 'perturbation_rate'],
    anatomy: REQUIRED_HOLDOUT_ANATOMY,
  }));
}

function shaFor(char, index) {
  return `sha256:${char.repeat(60)}${String(index).padStart(4, '0')}`;
}
