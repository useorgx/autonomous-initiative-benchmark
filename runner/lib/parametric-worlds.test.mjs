// Run: node --test runner/lib/parametric-worlds.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessMonotoneDifficulty,
  buildDifficultySchedule,
  buildParametricInstanceId,
  deterministicStateHash,
  estimateReliabilityHorizons,
  materializeWorldForEpisode,
  normalizeKnobs,
  selectAdaptiveDifficultyLevel,
  validateGeneratorMetadata,
} from './parametric-worlds.mjs';

const generator = {
  type: 'parametric',
  difficultyAxis: 'horizon_steps',
  defaultLevels: 4,
  knobs: [
    {
      name: 'horizon_steps',
      type: 'integer',
      min: 4,
      max: 16,
      default: 4,
      monotonic: 'harder_when_increases',
    },
    {
      name: 'distractors',
      type: 'integer',
      min: 0,
      max: 6,
      default: 1,
      monotonic: 'harder_when_increases',
    },
    {
      name: 'approval_trap',
      type: 'boolean',
      default: true,
      monotonic: 'nominal',
    },
  ],
};

test('validateGeneratorMetadata catches malformed parametric contracts', () => {
  const errors = validateGeneratorMetadata({
    type: 'fixed',
    knobs: [{ name: 'BadName', type: 'integer', min: 8, max: 1, default: 9 }],
  });
  assert.match(errors.join('\n'), /type must be parametric/);
  assert.match(errors.join('\n'), /snake_case/);
  assert.match(errors.join('\n'), /max must be >= min/);
});

test('normalizeKnobs enforces bounds and defaults', () => {
  assert.deepEqual(normalizeKnobs(generator, { horizon_steps: 8 }), {
    horizon_steps: 8,
    distractors: 1,
    approval_trap: true,
  });
  assert.throws(() => normalizeKnobs(generator, { horizon_steps: 17 }), /outside/);
});

test('buildDifficultySchedule produces deterministic monotone levels', () => {
  const schedule = buildDifficultySchedule(generator, { levels: 4 });
  assert.deepEqual(schedule.map((level) => level.knobs.horizon_steps), [4, 8, 12, 16]);
  assert.deepEqual(schedule.map((level) => level.difficultyScore), [0.0833, 0.25, 0.4167, 0.5833]);
});

test('instance ids and state hashes are canonical and seed-bound', () => {
  const left = buildParametricInstanceId({
    worldId: 'world',
    seedIndex: 2,
    knobs: { distractors: 1, horizon_steps: 8 },
  });
  const right = buildParametricInstanceId({
    worldId: 'world',
    seedIndex: 2,
    knobs: { horizon_steps: 8, distractors: 1 },
  });
  assert.equal(left, right);
  assert.notEqual(left, buildParametricInstanceId({ worldId: 'world', seedIndex: 3, knobs: { horizon_steps: 8, distractors: 1 } }));

  const hashA = deterministicStateHash({
    worldId: 'world',
    seedIndex: 1,
    knobs: { horizon_steps: 8 },
    state: { b: 2, a: 1 },
  });
  const hashB = deterministicStateHash({
    worldId: 'world',
    seedIndex: 1,
    knobs: { horizon_steps: 8 },
    state: { a: 1, b: 2 },
  });
  assert.equal(hashA, hashB);
});

test('materializeWorldForEpisode attaches difficulty provenance', () => {
  const baseWorld = {
    id: 'parametric_world',
    parametric: generator,
    generateInstance({ seedIndex, knobs }) {
      return {
        id: 'discarded_instance_id',
        prompt: `steps=${knobs.horizon_steps};seed=${seedIndex}`,
        serializedState: {
          seedIndex,
          horizonSteps: knobs.horizon_steps,
        },
      };
    },
  };

  const difficulty = buildDifficultySchedule(generator, { levels: 2 })[1];
  const instance = materializeWorldForEpisode(baseWorld, { seedIndex: 7, difficulty });
  assert.equal(instance.id, 'parametric_world');
  assert.equal(instance.prompt, 'steps=16;seed=7');
  assert.equal(instance.difficulty.knobs.horizon_steps, 16);
  assert.match(instance.difficulty.instanceId, /^parametric_world:s7:/);
  assert.match(instance.difficulty.stateHash, /^[a-f0-9]{64}$/);
});

test('monotonicity and reliability horizons are computed from difficulty curves', () => {
  const curve = [
    { difficultyScore: 0.1, passRate: 1 },
    { difficultyScore: 0.4, passRate: 0.82 },
    { difficultyScore: 0.7, passRate: 0.52 },
    { difficultyScore: 0.9, passRate: 0.35 },
  ];
  assert.equal(assessMonotoneDifficulty(curve).ok, true);
  assert.deepEqual(estimateReliabilityHorizons(curve), { p50: 0.7, p80: 0.4 });

  const bad = assessMonotoneDifficulty([
    { difficultyScore: 0.1, passRate: 0.6 },
    { difficultyScore: 0.2, passRate: 0.8 },
  ]);
  assert.equal(bad.ok, false);
  assert.equal(bad.violations.length, 1);
});

test('selectAdaptiveDifficultyLevel escalates until the frontier band or floor', () => {
  const schedule = buildDifficultySchedule(generator, { levels: 4 });
  assert.equal(selectAdaptiveDifficultyLevel({ schedule, results: [] }).next.id, 'd1');

  const afterEasy = selectAdaptiveDifficultyLevel({
    schedule,
    results: [{ difficultyId: 'd1', passAtK: 0.92 }],
  });
  assert.equal(afterEasy.complete, false);
  assert.equal(afterEasy.reason, 'escalate');
  assert.equal(afterEasy.next.id, 'd2');

  const frontier = selectAdaptiveDifficultyLevel({
    schedule,
    results: [
      { difficultyId: 'd1', passAtK: 0.92 },
      { difficultyId: 'd2', passAtK: 0.67 },
    ],
  });
  assert.equal(frontier.complete, true);
  assert.equal(frontier.reason, 'frontier_band_found');
  assert.equal(frontier.horizonCandidate.id, 'd2');

  const belowFloor = selectAdaptiveDifficultyLevel({
    schedule,
    results: [
      { difficultyId: 'd1', passAtK: 0.92 },
      { difficultyId: 'd2', passAtK: 0.38 },
    ],
  });
  assert.equal(belowFloor.complete, true);
  assert.equal(belowFloor.reason, 'below_floor');
  assert.equal(belowFloor.horizonCandidate.id, 'd1');
});
