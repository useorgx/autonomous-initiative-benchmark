// Run: node --test runner/lib/validate-bundle-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAccountingContract,
  validateBundle,
  validateHeadlineEvidenceContract,
  validateModelIdentityContract,
  validatePublicationContract,
} from '../validate-bundle.mjs';
import { HUMAN_BASELINE_PROTOCOL_VERSION } from './human-baselines.mjs';
import { REPLICATION_PROTOCOL_VERSION } from './replication-evidence.mjs';

function validate({ metadata, tasks = [{ runs: [{ runId: 'run-1' }, { runId: 'run-2' }, { runId: 'run-3' }] }] }) {
  const errors = [];
  const warnings = [];
  validatePublicationContract({ metadata, tasks, strict: true, errors, warnings });
  return { errors, warnings };
}

test('strict publication contract accepts labeled bundles with complete loss accounting', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'headline',
      launchedRunCount: 4,
      lossRegistry: [
        {
          runId: 'run-lost-1',
          lossType: 'timeout',
          publicLabel: 'Timed out before final artifact',
          countedAsLoss: true,
        },
      ],
    },
  });

  assert.deepEqual(issues.errors, []);
  assert.deepEqual(issues.warnings, []);
});

test('strict publication contract rejects unlabeled publications', () => {
  const issues = validate({
    metadata: {
      launchedRunCount: 3,
      lossRegistry: [],
    },
  });

  assert.match(issues.errors.join('\n'), /metadata\.publicationLabel/);
});

test('strict publication contract rejects missing loss registries', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'headline',
      launchedRunCount: 3,
    },
  });

  assert.match(issues.errors.join('\n'), /metadata\.lossRegistry array/);
});

test('strict publication contract rejects silently dropped launched runs', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'headline',
      launchedRunCount: 5,
      lossRegistry: [
        {
          runId: 'run-lost-1',
          reason: 'worker crashed',
          publicLabel: 'Worker crashed',
          countedAsLoss: true,
        },
      ],
    },
  });

  assert.match(issues.errors.join('\n'), /launched-run accounting identity failed/);
});

test('strict publication contract rejects malformed loss entries', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'headline',
      launchedRunCount: 4,
      lossRegistry: [
        {
          runId: 'run-2',
          countedAsLoss: false,
        },
      ],
    },
  });
  const errorText = issues.errors.join('\n');

  assert.match(errorText, /runId run-2 is also present in scored task runs/);
  assert.match(errorText, /countedAsLoss must be true/);
  assert.match(errorText, /requires reason or lossType/);
  assert.match(errorText, /publicLabel is required/);
});

test('strict publication contract rejects invalid publication labels', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'marketing-only',
      launchedRunCount: 3,
      lossRegistry: [],
    },
  });

  assert.match(issues.errors.join('\n'), /publicationLabel must be one of/);
});

test('strict publication contract requires launched-run accounting', () => {
  const issues = validate({
    metadata: {
      publicationLabel: 'headline',
      lossRegistry: [],
    },
  });

  assert.match(issues.errors.join('\n'), /launchedRunCount or metadata\.launchLog/);
});

function validateModelIdentity({ metadata, tasks }) {
  const errors = [];
  const warnings = [];
  validateModelIdentityContract({ metadata, tasks, strict: true, errors, warnings });
  return { errors, warnings };
}

function validateAccounting({ metadata, tasks }) {
  const errors = [];
  const warnings = [];
  validateAccountingContract({ metadata, tasks, strict: true, errors, warnings });
  return { errors, warnings };
}

function validateHeadlineEvidence({ summary = {}, metadata, tasks }) {
  const errors = [];
  const warnings = [];
  validateHeadlineEvidenceContract({ summary, metadata, tasks, strict: true, errors, warnings });
  return { errors, warnings };
}

const hash = (char) => `sha256:${char.repeat(64)}`;

function makeReplicationRow(overrides = {}) {
  return {
    protocol_version: REPLICATION_PROTOCOL_VERSION,
    party_id: 'external-lab-1',
    party_name: 'External Lab 1',
    world_id: 'holdout-design-task-a',
    submission_id: 'submission-headline-1',
    model_manifest_id: 'openai/gpt-5.6-high',
    run_manifest_id: 'run-private-holdout-2026q3',
    seed_commitment_hash: hash('a'),
    signed_receipt_hash: hash('b'),
    scorecard_hash: hash('c'),
    replication_protocol_hash: hash('d'),
    discrepancy_log_hash: hash('e'),
    submitted_at: '2026-07-08T10:00:00.000Z',
    scored_at: '2026-07-08T10:05:00.000Z',
    agreement_within_ci: true,
    discrepancies: [],
    ...overrides,
  };
}

function makeHumanBaselineSummary(tasks, overrides = {}) {
  const perWorld = tasks.map((task) => ({
    world_id: task.id,
    samples: 3,
    humans: 3,
    median_seconds: 1800,
    success_rate: 1,
    protocol_eligible: true,
  }));
  return {
    protocol_version: HUMAN_BASELINE_PROTOCOL_VERSION,
    humans: 3,
    samples: tasks.length * 3,
    median_seconds: 1800,
    success_rate: 1,
    per_world: perWorld,
    worlds_with_minimum_humans: tasks.length,
    protocol_eligible: true,
    protocol_error_count: 0,
    headline_eligible: true,
    minimum_humans: 3,
    ...overrides,
  };
}

test('strict model identity accepts provider-reported ids that match the model manifest', () => {
  const issues = validateModelIdentity({
    metadata: {
      modelManifest: {
        models: [{ id: 'openai/gpt-5.6-high', provider: 'openai', model: 'gpt-5.6-high' }],
      },
    },
    tasks: [
      {
        runs: [
          {
            runId: 'run-1',
            provider: 'openai',
            modelManifestId: 'openai/gpt-5.6-high',
            usage: { providerReportedModel: 'gpt-5.6-high' },
          },
        ],
      },
    ],
  });

  assert.deepEqual(issues.errors, []);
});

test('strict model identity rejects provider-side model swaps', () => {
  const issues = validateModelIdentity({
    metadata: {
      modelManifest: {
        models: [{ id: 'openai/gpt-5.6-high', provider: 'openai', model: 'gpt-5.6-high' }],
      },
    },
    tasks: [
      {
        runs: [
          {
            runId: 'run-swapped',
            provider: 'openai',
            modelManifestId: 'openai/gpt-5.6-high',
            usage: { providerReportedModel: 'gpt-5.6-mini' },
          },
        ],
      },
    ],
  });

  assert.match(issues.errors.join('\n'), /provider-reported model id gpt-5\.6-mini must match/);
});

test('strict model identity rejects missing provider-reported model ids', () => {
  const issues = validateModelIdentity({
    metadata: {
      modelManifest: {
        models: [{ id: 'openai/gpt-5.6-high', provider: 'openai', model: 'gpt-5.6-high' }],
      },
    },
    tasks: [
      {
        runs: [{ runId: 'run-no-receipt', provider: 'openai', modelManifestId: 'openai/gpt-5.6-high' }],
      },
    ],
  });

  assert.match(issues.errors.join('\n'), /missing provider-reported model id/);
});

test('strict accounting accepts provider-usage runs with zero fallback', () => {
  const issues = validateAccounting({
    metadata: {
      accountingComparable: true,
      normalizedCostFallbackRunCount: 0,
    },
    tasks: [
      {
        runs: [
          {
            runId: 'run-1',
            provider: 'openai',
            usageProvenance: 'provider_usage',
            normalizedCostFallbackUsed: false,
          },
        ],
      },
    ],
  });

  assert.deepEqual(issues.errors, []);
});

test('strict accounting rejects fallback-normalized runs', () => {
  const issues = validateAccounting({
    metadata: {
      accountingComparable: true,
      normalizedCostFallbackRunCount: 1,
    },
    tasks: [
      {
        runs: [
          {
            runId: 'run-fallback',
            provider: 'openai',
            usageProvenance: 'provider_usage',
            normalizedCostFallbackUsed: true,
          },
        ],
      },
    ],
  });
  const errorText = issues.errors.join('\n');

  assert.match(errorText, /normalizedCostFallbackRunCount=0/);
  assert.match(errorText, /used normalized cost fallback/);
});

test('strict accounting rejects missing provider usage provenance and missing streams', () => {
  const issues = validateAccounting({
    metadata: {
      costComparable: true,
      missingAccountingStreams: ['child_runs'],
    },
    tasks: [
      {
        runs: [
          {
            runId: 'run-missing',
            provider: 'openai',
            missingAccountingStreams: ['provider_receipt'],
          },
        ],
      },
    ],
  });
  const errorText = issues.errors.join('\n');

  assert.match(errorText, /requires no missing accounting streams/);
  assert.match(errorText, /missing accounting streams: provider_receipt/);
  assert.match(errorText, /usageProvenance must be provider_usage/);
});

function makeStrictHeadlineBundle(metadataOverrides = {}) {
  const judgePanel = [
    { provider: 'openai', model: 'gpt-5.6-judge-a', reasoningEffort: 'high' },
    { provider: 'openai', model: 'gpt-5.6-judge-b', reasoningEffort: 'high' },
    { provider: 'openai', model: 'gpt-5.6-judge-c', reasoningEffort: 'high' },
  ];
  const tasks = ['a', 'b', 'c'].map((suffix) => ({
    id: `holdout-design-task-${suffix}`,
    split: 'private_holdout',
    domain: 'design',
    acceptanceCriteria: [
      { id: 'correctness', description: 'Correct output' },
      { id: 'utility', description: 'Useful output' },
      { id: 'trust', description: 'Trustworthy output' },
    ],
    humanBaseline: {
      timeSeconds: 1800,
      costCents: 5000,
      qualityScore: 86,
      completeness: 0.9,
      sampleSize: 3,
      methodology: 'Timed expert operators.',
      sourceSummary: 'Three blind timed human runs.',
    },
    runs: [
      {
        runId: `run-${suffix}`,
        provider: 'openai',
        model: 'gpt-5.6-high',
        modelManifestId: 'openai/gpt-5.6-high',
        providerReportedModel: 'gpt-5.6-high',
        usageProvenance: 'provider_usage',
        normalizedCostFallbackUsed: false,
        autonomousCompleted: true,
        durationSeconds: 120,
        qualityScore: 90,
        completeness: 0.95,
        criterionScores: { correctness: 0.9, utility: 0.92, trust: 0.95 },
        scoringSource: 'independent_judges',
        judgeAggregate: { qualityScore: 90 },
      },
    ],
  }));
  const allRuns = tasks.flatMap((task) => task.runs);
  const judgments = {
    protocol: { judgePanel },
    runs: allRuns.map((run) => ({
      runId: run.runId,
      aggregate: { qualityScore: 90 },
      judges: judgePanel.map((judge, index) => ({
        judgeId: `judge-${index + 1}`,
        status: 'completed',
        model: judge.model,
        reasoningEffort: judge.reasoningEffort,
        usage: { output_tokens_details: { reasoning_tokens: 100 + index } },
        costCents: 2,
      })),
    })),
  };

  return {
    summary: {
      benchmarkWeek: 'headline-synthetic-20260708',
      benchmarkVersion: '2026-q3',
    },
    metadata: {
      benchmarkWeek: 'headline-synthetic-20260708',
      taskCount: tasks.length,
      repeatCount: 3,
      evaluationMethod: { independentJudges: true, judgePanel },
      tokenUsage: {
        generation: { totalTokens: 3000, costCents: 30 },
        judging: { totalTokens: 3000, reasoningTokens: 900, costCents: 30 },
        total: { totalTokens: 6000, costCents: 60 },
      },
      publicationLabel: 'headline',
      launchedRunCount: allRuns.length,
      lossRegistry: [],
      modelManifest: {
        models: [{ id: 'openai/gpt-5.6-high', provider: 'openai', model: 'gpt-5.6-high' }],
      },
      accountingComparable: true,
      normalizedCostFallbackRunCount: 0,
      human_baseline_summary: makeHumanBaselineSummary(tasks),
      externalReplication: { rows: [makeReplicationRow()] },
      ...metadataOverrides,
    },
    tasks,
    examples: allRuns.map((run) => ({ runId: run.runId, artifact: 'example' })),
    scorecardCsv: ['task_id,run_id', ...allRuns.map((run) => `task,${run.runId}`)].join('\n'),
    judgments,
  };
}

test('validateBundle strict accepts a complete synthetic headline bundle', () => {
  const bundle = makeStrictHeadlineBundle();
  const issues = validateBundle({ ...bundle, strict: true });

  assert.deepEqual(issues.errors, []);
});

test('validateBundle strict rejects a synthetic headline bundle with a dropped launched run', () => {
  const bundle = makeStrictHeadlineBundle({ launchedRunCount: 4 });
  const issues = validateBundle({ ...bundle, strict: true });

  assert.match(issues.errors.join('\n'), /launched-run accounting identity failed/);
});

test('strict headline evidence rejects public-validation tasks labeled as headline', () => {
  const bundle = makeStrictHeadlineBundle();
  bundle.tasks[0].split = 'public_validation';
  const issues = validateHeadlineEvidence({
    summary: bundle.summary,
    metadata: bundle.metadata,
    tasks: bundle.tasks,
  });

  assert.match(issues.errors.join('\n'), /must be split=private_holdout/);
});

test('validateBundle strict rejects headline bundles without human baseline evidence', () => {
  const bundle = makeStrictHeadlineBundle({ human_baseline_summary: null });
  const issues = validateBundle({ ...bundle, strict: true });

  assert.match(issues.errors.join('\n'), /human_baseline_summary evidence/);
});

test('validateBundle strict rejects headline bundles with incomplete human baseline world coverage', () => {
  const bundle = makeStrictHeadlineBundle();
  bundle.metadata.human_baseline_summary = {
    ...bundle.metadata.human_baseline_summary,
    worlds_with_minimum_humans: 1,
    per_world: bundle.metadata.human_baseline_summary.per_world.slice(0, 1),
  };
  const issues = validateBundle({ ...bundle, strict: true });
  const errorText = issues.errors.join('\n');

  assert.match(errorText, /worlds_with_minimum_humans must cover all headline worlds/);
  assert.match(errorText, /per_world missing headline world holdout-design-task-b/);
});

test('validateBundle strict rejects headline bundles without third-party replication', () => {
  const bundle = makeStrictHeadlineBundle({ externalReplication: { rows: [] } });
  const issues = validateBundle({ ...bundle, strict: true });

  assert.match(issues.errors.join('\n'), /at least one valid third-party replication row/);
});

test('validateBundle strict rejects malformed or non-agreeing third-party replication evidence', () => {
  const malformed = makeStrictHeadlineBundle({
    externalReplication: { rows: [makeReplicationRow({ signed_receipt_hash: 'missing' })] },
  });
  const nonAgreeing = makeStrictHeadlineBundle({
    externalReplication: { rows: [makeReplicationRow({ agreement_within_ci: false })] },
  });

  assert.match(validateBundle({ ...malformed, strict: true }).errors.join('\n'), /signed_receipt_hash/);
  assert.match(validateBundle({ ...nonAgreeing, strict: true }).errors.join('\n'), /agreement_within_ci=true/);
});
