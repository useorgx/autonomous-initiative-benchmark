import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode, runRestartEpisode } from './world-engine.mjs';

function toolCall(name, args, id = 'call-1') {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
      },
    }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

const draftWorld = {
  id: 'draft-recovery-fixture',
  prompt: 'Return the answer with submit.',
  initState: () => ({}),
  tools: [{
    name: 'submit',
    description: 'Submit answer.',
    parameters: {
      type: 'object',
      properties: { answer: { type: 'integer' }, _confidence: { type: 'number' } },
      required: ['answer'],
      additionalProperties: true,
    },
    terminal: true,
    handler: (args) => args,
  }],
  verificationPrompt: () => 'Check the answer.',
  validate: ({ terminal }) => ({
    pass: terminal.submission?.answer === 42,
    dimensions: { outcome: Number(terminal.submission?.answer === 42) },
  }),
};

test('draft recovery preserves availability but records failed verification and incomplete telemetry', async () => {
  let calls = 0;
  const result = await runEpisode({
    world: draftWorld,
    arm: 'orgx2',
    provider: 'fixture',
    model: 'fixture-model',
    episodeId: 'draft-recovery',
    chatFn: async () => {
      calls += 1;
      if (calls === 1) return toolCall('submit', { answer: 42, _confidence: 0.5 });
      throw new Error('verification transport failed');
    },
  });

  assert.equal(result.pass, true, 'the independent validator still decides correctness');
  assert.equal(result.terminalKind, 'submit');
  assert.deepEqual(result.submission, { answer: 42 });
  assert.equal(result.failed, true);
  assert.equal(result.resourceTelemetryComplete, false);
  assert.equal(result.executionError, 'verification transport failed');
  assert.ok(result.weg.nodes.some((node) => node.type === 'draft_recovery' && node.recoveryReason === 'execution_error'));
  assert.ok(!result.weg.nodes.some((node) => node.type === 'no_regression_fallback'));
});

const restartWorld = {
  id: 'restart-observation-fixture',
  initState: () => ({ queried: false }),
  restart: {
    totalItems: 1,
    segmentSize: 1,
    initCarry: () => ({ value: 0 }),
    segmentTools: () => [
      {
        name: 'read_input',
        description: 'Read input.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        handler: () => ({ value: 7 }),
      },
      {
        name: 'submit_segment',
        description: 'Submit segment.',
        parameters: {
          type: 'object',
          properties: { value: { type: 'integer' } },
          required: ['value'],
          additionalProperties: false,
        },
        terminal: true,
        handler: (args) => args,
      },
    ],
    segmentPrompt: () => 'Read input then submit.',
    foldCarry: (_carry, result) => result,
    finalSubmission: (carry) => carry,
    deriveValidationState: ({ baseState, weg }) => ({
      ...baseState,
      queried: weg.toolCalls.some((call) => call.name === 'read_input' && call.status === 'succeeded'),
    }),
  },
  validate: ({ terminal, state }) => {
    const outcome = Number(terminal.submission?.value === 7);
    const method = Number(state.queried);
    return { pass: Boolean(outcome && method), dimensions: { outcome, method } };
  },
};

test('restart method evidence comes from observed successful tool calls', async () => {
  const result = await runRestartEpisode({
    world: restartWorld,
    provider: 'fixture',
    model: 'fixture-model',
    episodeId: 'restart-without-read',
    chatFn: async () => toolCall('submit_segment', { value: 7 }),
  });

  assert.equal(result.terminalKind, 'submit');
  assert.equal(result.dimensions.outcome, 1);
  assert.equal(result.dimensions.method, 0);
  assert.equal(result.pass, false, 'correct output without observed required method must not pass');
  assert.equal(result.completedSegments, 1);
  assert.equal(result.expectedSegments, 1);
});

test('incomplete restart never fabricates a final submission', async () => {
  const result = await runRestartEpisode({
    world: restartWorld,
    provider: 'fixture',
    model: 'fixture-model',
    episodeId: 'restart-error',
    chatFn: async () => { throw new Error('provider unavailable'); },
  });

  assert.equal(result.terminalKind, 'execution_error');
  assert.equal(result.submission, null);
  assert.equal(result.failed, true);
  assert.equal(result.resourceTelemetryComplete, false);
  assert.equal(result.completedSegments, 0);
});
