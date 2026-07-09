export const REQUIRED_SCHEMAS = [
  'schemas/evaluation-manifest.schema.json',
  'schemas/model-manifest.schema.json',
  'schemas/benchmark-run-manifest.schema.json',
  'schemas/human-baseline-plan.schema.json',
  'schemas/human-expert-roster.schema.json',
  'schemas/human-baseline-session-packets.schema.json',
  'schemas/human-baseline-session-kits.schema.json',
  'schemas/sota-release-manifest.schema.json',
  'schemas/sota-sweep-plan.schema.json',
  'schemas/sota-execution-ledger.schema.json',
  'schemas/third-party-replication-evidence.schema.json',
  'schemas/stranger-reproduction-receipt.schema.json',
  'schemas/outreach-target-plan.schema.json',
  'schemas/outreach-action-ledger.schema.json',
  'schemas/private-validator-bundle.schema.json',
  'schemas/initiative-world.schema.json',
];

export const REQUIRED_SCRIPTS = [
  'validate:manifest',
  'validate:bundle:strict',
  'validate:prompts',
  'validate:dimensions',
  'validate:human-baselines',
  'validate:human-expert-roster',
  'plan:human-baselines',
  'export:human-baseline-packets',
  'materialize:human-baseline-kits',
  'validate:human-baseline-kits',
  'validate:replication',
  'validate:reproduction',
  'validate:outreach-plan',
  'materialize:outreach-drafts',
  'init:outreach-ledger',
  'validate:outreach-ledger',
  'record:outreach-action',
  'validate:release',
  'validate:release-ledger',
  'record:release-ledger-job',
  'plan:release-sweep',
  'drill:future-model',
];

export const REQUIRED_PROVIDER_KEYS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'fugu',
];

export const REQUIRED_V4_VALIDATORS = [
  'artifact_parse',
  'artifact_render',
  'artifact_execute',
  'schema_validate',
  'claim_entailment',
  'calculation_replay',
  'simulation_outcome',
  'downstream_task',
  'blind_acceptance_review',
  'perturbation_test',
  'delayed_state_check',
  'approval_order',
  'receipt_replay',
  'budget_adherence',
  'forbidden_action',
];

export const REQUIRED_HOLDOUT_ANATOMY = [
  'seeded_workspace_state',
  'tool_surface',
  'hidden_evaluator_state',
  'approval_or_policy_boundary',
  'plausible_trap',
  'side_effectful_mutation',
  'nau_triple',
  'deterministic_validator_bundle',
  'perturbation_pass',
  'difficulty_knobs',
  'grader_mutation_test',
  'signed_receipt_hash',
];

export function evaluateSotaReadiness({
  artifacts = {},
  registry = {},
  packageJson = {},
  providerKeys = [],
  validatorTypes = [],
  futureModelDrills = [],
  humanBaselineSummary = null,
  orgxEvidence = {},
  headlineBundleCount = 0,
  externallyReplicatedRows = 0,
  strangerReproduction = null,
} = {}) {
  const checks = [];
  const scripts = packageJson.scripts ?? {};
  const previewWorlds = registry?.splits?.initiative_worlds_preview?.worlds ?? [];
  const holdout = registry?.splits?.private_holdout ?? {};
  const canary = registry?.splits?.rotating_canary ?? {};
  const holdoutWorlds = holdout.worlds ?? [];
  const validHoldoutWorlds = holdoutWorlds.filter(isValidHoldoutGeneratorCommitment);
  const uniqueHoldoutWorldIds = new Set(holdoutWorlds.map((world) => world?.worldId).filter(Boolean));
  const canaryCommitments = canary.rotationCalendar ?? [];
  const validCanaryCommitments = canaryCommitments.filter(isValidCanaryCommitment);
  const holdoutTarget = Number(holdout.targetWorldCount ?? 20);
  const canaryTarget = Number(canary.targetWorldsPerQuarter ?? 10);
  const latestDrill = [...futureModelDrills].reverse().find((drill) => drill?.ok);

  checks.push(
    gate({
      id: 'ws0.contract-document',
      workstream: 'WS0',
      requirement: 'Publish a binding OrgX-Bench contract.',
      pass: Boolean(artifacts['docs/orgx-bench-v1-contract.md']),
      evidence: 'docs/orgx-bench-v1-contract.md',
      remediation: 'Keep the public contract document in docs/ and update it with every benchmark contract revision.',
    })
  );

  checks.push(
    gate({
      id: 'ws0.plan-document',
      workstream: 'WS0',
      requirement: 'Keep the SOTA plan versioned in the repo.',
      pass: Boolean(artifacts['docs/strategy/sota-undeniable-plan-2026-07-08.md']),
      evidence: 'docs/strategy/sota-undeniable-plan-2026-07-08.md',
      remediation: 'Add or restore the dated SOTA plan so the readiness gates remain grounded in an explicit contract.',
    })
  );

  checks.push(
    gate({
      id: 'ws0.schema-surface',
      workstream: 'WS0',
      requirement: 'Ship public schemas for manifests, worlds, and sealed validators.',
      pass: REQUIRED_SCHEMAS.every((file) => artifacts[file]),
      evidence: REQUIRED_SCHEMAS.filter((file) => artifacts[file]),
      missing: REQUIRED_SCHEMAS.filter((file) => !artifacts[file]),
      remediation: 'Add the missing schema files before claiming an externally checkable benchmark contract.',
    })
  );

  checks.push(
    gate({
      id: 'ws0.validation-command-surface',
      workstream: 'WS0',
      requirement: 'Expose repeatable validator commands for manifests, bundles, prompts, dimensions, and future-model drills.',
      pass: REQUIRED_SCRIPTS.every((script) => scripts[script]),
      evidence: REQUIRED_SCRIPTS.filter((script) => scripts[script]),
      missing: REQUIRED_SCRIPTS.filter((script) => !scripts[script]),
      remediation: 'Add missing npm scripts so reviewers can run the gates without knowing internal file paths.',
    })
  );

  checks.push(
    gate({
      id: 'ws0.construct-validity-audits',
      workstream: 'WS0',
      requirement: 'Automate prompt de-signposting, dimension independence, and strict bundle negative controls.',
      pass:
        Boolean(artifacts['runner/lib/prompt-audit.mjs']) &&
        Boolean(artifacts['runner/lib/dimension-independence.mjs']) &&
        Boolean(artifacts['runner/lib/validate-bundle-contract.test.mjs']),
      evidence: [
        'runner/lib/prompt-audit.mjs',
        'runner/lib/dimension-independence.mjs',
        'runner/lib/validate-bundle-contract.test.mjs',
      ].filter((file) => artifacts[file]),
      remediation: 'Restore the audit modules/tests so construct-validity failures have executable negative controls.',
    })
  );

  checks.push(
    gate({
      id: 'ws1.provider-registry',
      workstream: 'WS1',
      requirement: 'Provider registry covers the benchmark frontier provider set without code branches per model.',
      pass: REQUIRED_PROVIDER_KEYS.every((provider) => providerKeys.includes(provider)),
      evidence: providerKeys,
      missing: REQUIRED_PROVIDER_KEYS.filter((provider) => !providerKeys.includes(provider)),
      remediation: 'Add missing providers to runner/lib/providers.mjs and route model identity through manifests.',
    })
  );

  checks.push(
    gate({
      id: 'ws1.manifest-bound-runner',
      workstream: 'WS1',
      requirement: 'Runner refuses unmanifested model/run configurations.',
      pass:
        Boolean(artifacts['runner/lib/run-manifest.mjs']) &&
        Boolean(artifacts['runner/lib/run-manifest.test.mjs']) &&
        Boolean(artifacts['results/benchmark-run-manifest.example.json']),
      evidence: [
        'runner/lib/run-manifest.mjs',
        'runner/lib/run-manifest.test.mjs',
        'results/benchmark-run-manifest.example.json',
      ].filter((file) => artifacts[file]),
      remediation: 'Keep run-manifest resolution and refusal tests wired before adding real frontier rows.',
    })
  );

  checks.push(
    gate({
      id: 'ws1.future-model-drill',
      workstream: 'WS1',
      requirement: 'A GPT-6-style model row can be introduced through manifests and dry-run the sweep matrix.',
      pass:
        Boolean(latestDrill) &&
        String(latestDrill.model ?? '').includes('gpt-6') &&
        Number(latestDrill.jobCount ?? 0) > 0 &&
        Boolean(latestDrill.manifests?.evaluationManifest) &&
        Boolean(latestDrill.manifests?.runManifest),
      evidence: latestDrill
        ? {
            model: latestDrill.model,
            split: latestDrill.split,
            worldCount: latestDrill.worldCount,
            jobCount: latestDrill.jobCount,
          }
        : null,
      remediation: 'Run npm run drill:future-model -- --out results/future-model-fire-drill-YYYY-MM-DD.json.',
    })
  );

  checks.push(
    gate({
      id: 'ws2.validator-vocabulary',
      workstream: 'WS2',
      requirement: 'Private-validator schema registers every v4 work-product validator family.',
      pass: REQUIRED_V4_VALIDATORS.every((type) => validatorTypes.includes(type)),
      evidence: REQUIRED_V4_VALIDATORS.filter((type) => validatorTypes.includes(type)),
      missing: REQUIRED_V4_VALIDATORS.filter((type) => !validatorTypes.includes(type)),
      remediation: 'Add missing validator types to schemas/private-validator-bundle.schema.json and validate-world execution tests.',
    })
  );

  checks.push(
    gate({
      id: 'ws2.public-preview-scale',
      workstream: 'WS2',
      requirement: 'Public preview grows from toy coverage to at least 10 runnable preview worlds.',
      pass: previewWorlds.length >= 10,
      evidence: { previewWorldCount: previewWorlds.length, target: 10 },
      remediation: 'Promote more open worlds into worlds/preview with oracle receipts and registry entries.',
    })
  );

  checks.push(
    gate({
      id: 'ws2.private-holdout-generators',
      workstream: 'WS2',
      requirement: 'Private headline holdout contains at least 20 sealed parametric generator commitments.',
      pass:
        holdoutWorlds.length >= holdoutTarget &&
        validHoldoutWorlds.length === holdoutWorlds.length &&
        uniqueHoldoutWorldIds.size === holdoutWorlds.length &&
        holdout.targetWorldShape === 'parametric_generators',
      evidence: {
        privateHoldoutWorldCount: holdoutWorlds.length,
        validCommitmentCount: validHoldoutWorlds.length,
        uniqueWorldIdCount: uniqueHoldoutWorldIds.size,
        target: holdoutTarget,
        targetWorldShape: holdout.targetWorldShape ?? null,
      },
      remediation: 'Populate the private_holdout registry/export with 20+ unique sealed parametric generator commitments, source/seed/validator hashes, difficulty knobs, and full anatomy flags.',
    })
  );

  checks.push(
    gate({
      id: 'ws2.rotating-canaries',
      workstream: 'WS2',
      requirement: 'Quarterly canary rotation has at least 10 scheduled private canaries with seed and validator hash commitments.',
      pass:
        validCanaryCommitments.length >= canaryTarget &&
        validCanaryCommitments.length === canaryCommitments.length,
      evidence: {
        canaryCommitmentCount: canaryCommitments.length,
        validCommitmentCount: validCanaryCommitments.length,
        target: canaryTarget,
      },
      remediation: 'Add a rotating_canary.rotationCalendar with 10 private canary commitments, each carrying canaryId, quarter, domain, seedCommitmentHash, validatorBundleHash, and status.',
    })
  );

  checks.push(
    gate({
      id: 'ws3.timed-human-baselines',
      workstream: 'WS3',
      requirement: 'Measured timed human baselines meet the >=3 distinct-human gate on every private holdout world.',
      pass:
        Boolean(humanBaselineSummary?.headline_eligible) &&
        Number(humanBaselineSummary?.humans ?? 0) >= 3 &&
        Number(humanBaselineSummary?.worlds_with_minimum_humans ?? 0) >= holdoutTarget,
      evidence: humanBaselineSummary
        ? {
            humans: humanBaselineSummary.humans,
            samples: humanBaselineSummary.samples,
            worlds_with_minimum_humans: humanBaselineSummary.worlds_with_minimum_humans ?? 0,
            target_worlds: holdoutTarget,
            protocol_eligible: humanBaselineSummary.protocol_eligible ?? null,
            headline_eligible: humanBaselineSummary.headline_eligible,
          }
        : null,
      remediation: 'Collect real timed expert sessions with runner/record-human-baseline.mjs and publish the summary.',
    })
  );

  checks.push(
    gate({
      id: 'ws4.orgx-pinning-and-lab',
      workstream: 'WS4',
      requirement: 'Private OrgX lane enforces benchmark provider pinning and exports manifest/loss ids into the Lab truth surface.',
      pass:
        orgxEvidence.exists === true &&
        orgxEvidence.pinningViolation === true &&
        orgxEvidence.pinningChaosTest === true &&
        orgxEvidence.manifestIds === true &&
        orgxEvidence.labPublishabilityReason === true,
      evidence: orgxEvidence,
      remediation: 'Implement/verify benchmarkPinnedProvider, pinning_violated failures, manifest id propagation, and run-page publishability reasons in ~/Code/orgx.',
    })
  );

  checks.push(
    gate({
      id: 'ws5.external-verifiability',
      workstream: 'WS5',
      requirement: 'A sealed-validator submission path exists for outside parties without exposing holdout fixtures.',
      pass: orgxEvidence.submissionApi === true && orgxEvidence.leakAudit === true,
      evidence: {
        submissionApi: orgxEvidence.submissionApi === true,
        leakAudit: orgxEvidence.leakAudit === true,
      },
      remediation: 'Build the sealed submission API, information-leak audit, and canary anomaly drill in ~/Code/orgx.',
    })
  );

  checks.push(
    gate({
      id: 'ws6.frontier-headline-release',
      workstream: 'WS6',
      requirement: 'At least one strict headline bundle exists with frontier-model rows and no missing loss/accounting evidence.',
      pass: headlineBundleCount > 0,
      evidence: { headlineBundleCount },
      remediation: 'Run the preregistered private-holdout frontier sweep and publish strict-valid headline bundles.',
    })
  );

  checks.push(
    gate({
      id: 'ws6.third-party-replication',
      workstream: 'WS6',
      requirement: 'At least one externally replicated row is present in the release evidence.',
      pass: externallyReplicatedRows > 0,
      evidence: { externallyReplicatedRows },
      remediation: 'Have an outside evaluator run through the sealed API and publish the replicated row/discrepancy log.',
    })
  );

  checks.push(
    gate({
      id: 'ws6.stranger-reproduction',
      workstream: 'WS6',
      requirement: 'An outside reviewer has recomputed the public headline release from public files and matched it to the digit.',
      pass:
        strangerReproduction?.exists === true &&
        strangerReproduction?.validation?.ok === true &&
        strangerReproduction.validation.summary?.completed === true &&
        strangerReproduction.validation.summary?.matched_to_digit === true,
      evidence: strangerReproduction
        ? {
            exists: strangerReproduction.exists === true,
            path: strangerReproduction.path ?? null,
            summary: strangerReproduction.validation?.summary ?? null,
            errors: strangerReproduction.validation?.errors ?? strangerReproduction.strictErrors ?? [],
          }
        : null,
      remediation: 'Have an outside reviewer run the public reproduction command and attach a valid stranger_reproduction_v1 receipt.',
    })
  );

  const summary = summarizeChecks(checks);
  return {
    ok: summary.failed === 0,
    status: summary.failed === 0 ? 'sota_ready' : 'not_sota_ready',
    summary,
    checks,
  };
}

function gate({ id, workstream, requirement, pass, evidence, missing = [], remediation }) {
  return {
    id,
    workstream,
    status: pass ? 'pass' : 'fail',
    requirement,
    evidence,
    ...(missing.length ? { missing } : {}),
    ...(pass ? {} : { remediation }),
  };
}

function summarizeChecks(checks) {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const failed = checks.filter((check) => check.status === 'fail').length;
  return {
    total: checks.length,
    passed,
    failed,
  };
}

function isValidCanaryCommitment(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return (
    nonEmpty(entry.canaryId) &&
    nonEmpty(entry.quarter) &&
    nonEmpty(entry.domain) &&
    isSha256(entry.seedCommitmentHash) &&
    isSha256(entry.validatorBundleHash) &&
    ['scheduled_private', 'generated_private', 'burned'].includes(entry.status)
  );
}

function isValidHoldoutGeneratorCommitment(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const anatomy = new Set(Array.isArray(entry.anatomy) ? entry.anatomy : []);
  return (
    nonEmpty(entry.worldId) &&
    nonEmpty(entry.domain) &&
    entry.status === 'committed_private' &&
    entry.generatorType === 'parametric' &&
    isSha256(entry.generatorSourceHash) &&
    isSha256(entry.seedCommitmentHash) &&
    isSha256(entry.validatorBundleHash) &&
    Array.isArray(entry.difficultyKnobs) &&
    entry.difficultyKnobs.length >= 4 &&
    entry.difficultyKnobs.every(nonEmpty) &&
    REQUIRED_HOLDOUT_ANATOMY.every((flag) => anatomy.has(flag))
  );
}

function isSha256(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
