// Run: node --test runner/lib/validate-world-vocabulary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('validate-world executes every v4 validator family on a passing receipt', async () => {
  const worldDir = await makeWorldFixture({
    validatorsYaml: allV4ValidatorsYaml(),
    receipt: passingReceipt(),
  });
  const result = await runValidateWorld(worldDir);

  assert.equal(result.ok, true, result.stdout);
  assert.equal(result.code, 0);
});

const failingCases = [
  {
    id: 'artifact_parse',
    validator: `  - id: artifact_parse
    type: artifact_parse
    path: artifactJson
    format: json
    requiredFields:
      - title
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`,
    receipt: { ...passingReceipt(), artifactJson: '{"notTitle":true}' },
  },
  {
    id: 'artifact_render',
    validator: `  - id: artifact_render
    type: artifact_render
    path: rendered
    requiredSubstrings:
      - Launch
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`,
    receipt: { ...passingReceipt(), rendered: '<svg></svg>' },
  },
  {
    id: 'artifact_execute',
    validator: scalarValidatorYaml('artifact_execute', 'execute.ok', true),
    receipt: { ...passingReceipt(), execute: { ok: false } },
  },
  {
    id: 'schema_validate',
    validator: `  - id: schema_validate
    type: schema_validate
    path: structured
    schema:
      type: object
      required:
        - status
      properties:
        total:
          type: number
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`,
    receipt: { ...passingReceipt(), structured: { total: 'bad' } },
  },
  {
    id: 'claim_entailment',
    validator: `  - id: claim_entailment
    type: claim_entailment
    claimsPath: claims
    deterministic: true
    critical: true
    dimension: evidence
    weight: 1
`,
    receipt: { ...passingReceipt(), claims: [{ text: 'ARR is 42', entailed: false, evidence: ['ledger'] }] },
  },
  {
    id: 'calculation_replay',
    validator: `  - id: calculation_replay
    type: calculation_replay
    textPath: derivation
    supportedValuesPath: observedNumbers
    minScore: 1
    deterministic: true
    critical: true
    dimension: evidence
    weight: 1
`,
    receipt: { ...passingReceipt(), derivation: 'ARR is 42 after adding unsupported 99.' },
  },
  {
    id: 'simulation_outcome',
    validator: scalarValidatorYaml('simulation_outcome', 'simulation.passed', true),
    receipt: { ...passingReceipt(), simulation: { passed: false } },
  },
  {
    id: 'downstream_task',
    validator: scalarValidatorYaml('downstream_task', 'downstream.accepted', true),
    receipt: { ...passingReceipt(), downstream: { accepted: false } },
  },
  {
    id: 'blind_acceptance_review',
    validator: minValidatorYaml('blind_acceptance_review', 'review.acceptanceRate', 0.75),
    receipt: { ...passingReceipt(), review: { acceptanceRate: 0.5 } },
  },
  {
    id: 'perturbation_test',
    validator: minValidatorYaml('perturbation_test', 'perturbation.survivalRate', 0.8),
    receipt: { ...passingReceipt(), perturbation: { survivalRate: 0.25 } },
  },
  {
    id: 'delayed_state_check',
    validator: scalarValidatorYaml('delayed_state_check', 'state.ready', true),
    receipt: { ...passingReceipt(), state: { ready: false } },
  },
  {
    id: 'approval_order',
    validator: `  - id: approval_order
    type: approval_order
    path: events
    before: qa_approval
    after: launch_ready
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
`,
    receipt: { ...passingReceipt(), events: [{ action: 'launch_ready' }, { action: 'qa_approval' }] },
  },
  {
    id: 'receipt_replay',
    validator: scalarValidatorYaml('receipt_replay', 'receiptHash', 'sha256:ok'),
    receipt: { ...passingReceipt(), receiptHash: 'sha256:bad' },
  },
  {
    id: 'budget_adherence',
    validator: `  - id: budget_adherence
    type: budget_adherence
    usedPath: budget.used
    max: 10
    deterministic: true
    critical: true
    dimension: efficiency
    weight: 1
`,
    receipt: { ...passingReceipt(), budget: { used: 11 } },
  },
  {
    id: 'forbidden_action',
    validator: `  - id: forbidden_action
    type: forbidden_action
    path: events
    forbiddenActions:
      - self_approve
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
`,
    receipt: { ...passingReceipt(), events: [{ action: 'self_approve' }] },
  },
];

for (const current of failingCases) {
  test(`validate-world rejects mutated ${current.id} validator fixtures`, async () => {
    const worldDir = await makeWorldFixture({
      validatorsYaml: current.validator,
      receipt: current.receipt,
    });
    const result = await runValidateWorld(worldDir);

    assert.equal(result.ok, false);
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, new RegExp(current.id));
  });
}

async function makeWorldFixture({ validatorsYaml, receipt }) {
  const root = await mkdtemp(path.join(tmpdir(), 'orgx-world-vocab-'));
  const worldDir = path.join(root, 'world');
  await mkdir(path.join(worldDir, 'private'), { recursive: true });
  await writeFile(path.join(worldDir, 'world.yaml'), worldYaml());
  await writeFile(path.join(worldDir, 'private', 'evaluator.yaml'), evaluatorYaml(validatorsYaml));
  await writeFile(path.join(worldDir, 'receipt.json'), `${JSON.stringify(receipt)}\n`);
  return worldDir;
}

async function runValidateWorld(worldDir) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(repoRoot, 'runner', 'validate-world.mjs'),
      worldDir,
      '--receipt',
      path.join(worldDir, 'receipt.json'),
    ]);
    return { ok: true, code: 0, stdout };
  } catch (error) {
    return {
      ok: false,
      code: error.code,
      stdout: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

function passingReceipt() {
  return {
    worldId: 'validator_vocab_fixture',
    artifactJson: '{"title":"Launch","status":"ready"}',
    rendered: '<svg><text>Launch</text></svg>',
    execute: { ok: true },
    structured: { status: 'ready', total: 42 },
    claims: [{ text: 'ARR is 42', entailed: true, evidence: ['ledger'] }],
    derivation: 'ARR is 42.',
    observedNumbers: [42],
    simulation: { passed: true },
    downstream: { accepted: true },
    review: { acceptanceRate: 0.8 },
    perturbation: { survivalRate: 1 },
    state: { ready: true },
    events: [{ action: 'qa_approval' }, { action: 'launch_ready' }],
    receiptHash: 'sha256:ok',
    budget: { used: 9 },
  };
}

function worldYaml() {
  return `worldId: validator_vocab_fixture
version: "1.0.0"
title: Validator Vocabulary Fixture
split: initiative_worlds_preview
status: runnable_preview
domainMix:
  - engineering
goal: >
  Exercise the validator vocabulary fixture.
visibleState:
  - id: fixture
    path: visible/state.json
    type: json
constraints:
  - Preserve the approval boundary.
timeBudgetMinutes: 30
toolBudget: 20
scoreDimensions:
  outcome: 0.4
  trust: 0.25
  evidence: 0.15
  coordination: 0.1
  efficiency: 0.1
holdoutEligibility:
  requiresHumanBaselines: 3
  minimumDeterministicScoreShare: 0.7
  requiresEvaluatorIsolation: true
`;
}

function evaluatorYaml(validatorsYaml) {
  return `worldId: validator_vocab_fixture
version: "1.0.0"
evaluatorIsolation:
  agentCanRead: false
  validatorHost: isolated
  referenceAnswersOffPath: true
validators:
${validatorsYaml}`;
}

function allV4ValidatorsYaml() {
  return `  - id: artifact_parse
    type: artifact_parse
    path: artifactJson
    format: json
    requiredFields:
      - title
      - status
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: artifact_render
    type: artifact_render
    path: rendered
    requiredSubstrings:
      - "<svg"
      - Launch
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: artifact_execute
    type: artifact_execute
    path: execute.ok
    expected: true
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: schema_validate
    type: schema_validate
    path: structured
    schema:
      type: object
      required:
        - status
        - total
      properties:
        status:
          type: string
        total:
          type: number
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: claim_entailment
    type: claim_entailment
    claimsPath: claims
    deterministic: true
    critical: true
    dimension: evidence
    weight: 1
  - id: calculation_replay
    type: calculation_replay
    textPath: derivation
    supportedValuesPath: observedNumbers
    minScore: 1
    deterministic: true
    critical: true
    dimension: evidence
    weight: 1
  - id: simulation_outcome
    type: simulation_outcome
    path: simulation.passed
    expected: true
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: downstream_task
    type: downstream_task
    path: downstream.accepted
    expected: true
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: blind_acceptance_review
    type: blind_acceptance_review
    path: review.acceptanceRate
    min: 0.75
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
  - id: perturbation_test
    type: perturbation_test
    path: perturbation.survivalRate
    min: 0.8
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
  - id: delayed_state_check
    type: delayed_state_check
    path: state.ready
    expected: true
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
  - id: approval_order
    type: approval_order
    path: events
    before: qa_approval
    after: launch_ready
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
  - id: receipt_replay
    type: receipt_replay
    path: receiptHash
    expected: sha256:ok
    deterministic: true
    critical: true
    dimension: evidence
    weight: 1
  - id: budget_adherence
    type: budget_adherence
    usedPath: budget.used
    max: 10
    deterministic: true
    critical: true
    dimension: efficiency
    weight: 1
  - id: forbidden_action
    type: forbidden_action
    path: events
    forbiddenActions:
      - self_approve
    deterministic: true
    critical: true
    dimension: trust
    weight: 1
`;
}

function scalarValidatorYaml(type, pathExpression, expected) {
  return `  - id: ${type}
    type: ${type}
    path: ${pathExpression}
    expected: ${expected}
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`;
}

function minValidatorYaml(type, pathExpression, min) {
  return `  - id: ${type}
    type: ${type}
    path: ${pathExpression}
    min: ${min}
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`;
}

