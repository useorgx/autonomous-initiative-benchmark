// Run: node --test runner/lib/validate-world-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

test('validate-world rejects private holdout worlds without generator metadata', async () => {
  const worldDir = await makeWorldFixture({ includeGenerator: false, includeAnatomy: true });
  const result = await runValidateWorld(worldDir);
  assert.equal(result.ok, false);
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /private_holdout worlds must declare generator metadata/);
});

test('validate-world accepts private holdout worlds with generator metadata and anatomy', async () => {
  const worldDir = await makeWorldFixture({ includeGenerator: true, includeAnatomy: true });
  const result = await runValidateWorld(worldDir);
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
});

test('validate-world rejects private holdout worlds with incomplete anatomy', async () => {
  const worldDir = await makeWorldFixture({ includeGenerator: true, includeAnatomy: false });
  const result = await runValidateWorld(worldDir);
  assert.equal(result.ok, false);
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /worldAnatomy must set true/);
});

async function makeWorldFixture({ includeGenerator, includeAnatomy }) {
  const root = await mkdtemp(path.join(tmpdir(), 'orgx-world-contract-'));
  const worldDir = path.join(root, 'world');
  await mkdir(path.join(worldDir, 'private'), { recursive: true });
  await writeFile(path.join(worldDir, 'world.yaml'), worldYaml({ includeGenerator, includeAnatomy }));
  await writeFile(path.join(worldDir, 'private', 'evaluator.yaml'), evaluatorYaml());
  await writeFile(path.join(worldDir, 'receipt.json'), `${JSON.stringify({ worldId: 'holdout_contract_fixture', ok: true })}\n`);
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

function worldYaml({ includeGenerator, includeAnatomy }) {
  return `worldId: holdout_contract_fixture
version: "1.0.0"
title: Holdout Contract Fixture
split: private_holdout
status: holdout_candidate
domainMix:
  - engineering
goal: >
  Complete a seeded private holdout task with hidden evaluator state, policy
  boundaries, deterministic validators, and a side-effectful state mutation.
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
${includeGenerator ? generatorYaml() : ''}${includeAnatomy ? anatomyYaml() : ''}`;
}

function generatorYaml() {
  return `generator:
  type: parametric
  seedHash: sha256
  difficultyAxis: horizon_steps
  defaultLevels: 3
  knobs:
    - name: horizon_steps
      type: integer
      min: 2
      max: 8
      default: 2
      monotonic: harder_when_increases
    - name: distractors
      type: integer
      min: 0
      max: 4
      default: 0
      monotonic: harder_when_increases
`;
}

function anatomyYaml() {
  return `worldAnatomy:
  seededWorkspaceState: true
  toolOrApiSurface: true
  hiddenEvaluatorState: true
  approvalOrPolicyBoundary: true
  plausibleTrap: true
  sideEffectfulStateMutation: true
  nauTriple: true
  deterministicValidatorBundle: true
  perturbationPass: true
  difficultyKnobs: true
  graderMutationTest: true
  signedReceiptHash: true
`;
}

function evaluatorYaml() {
  return `worldId: holdout_contract_fixture
evaluatorIsolation:
  agentCanRead: false
  referenceAnswersOffPath: true
validators:
  - id: ok
    type: json_path_equals
    path: ok
    expected: true
    deterministic: true
    critical: true
    dimension: outcome
    weight: 1
`;
}
