// Forced-failure tests for bounded draft recovery.
//
// The recovery behavior preserves a first submission when a requested second
// pass cannot finish. That is an availability property, not a correctness or
// semantic no-regression guarantee: the independent world validator still
// decides whether the recovered draft is right.
//
// Fully deterministic: injects a scripted chatFn, so no provider key / LLM call.
// Run: node --test runner/lib/world-engine.gate-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from './world-engine.mjs';

const world = {
  id: 'guard-test-world',
  domain: 'trust',
  prompt: 'Submit value 42.',
  initState() {
    return {};
  },
  tools: [
    {
      name: 'submit',
      description: 'Submit the answer.',
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
  verificationPrompt(draft) {
    return JSON.stringify({ draft, instruction: 're-derive value' });
  },
  validate({ terminal }) {
    const value = Number(terminal.submission?.value);
    return {
      pass: value === 42,
      dimensions: { outcome: value === 42 ? 1 : 0 },
      detail: { value },
    };
  },
};

function makeStallAfterSubmitChat(value = 42) {
  let turn = 0;
  return async function chatFn() {
    turn += 1;
    if (turn === 1) {
      return {
        usage: {},
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'c1',
                  function: {
                    name: 'submit',
                    arguments: JSON.stringify({ value }),
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return {
      usage: {},
      choices: [{ message: { content: 'still thinking...', tool_calls: [] } }],
    };
  };
}

test('orgx2 recovers the first draft when verification exhausts the step budget', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx2',
    provider: 'test',
    model: 'test',
    episodeId: 'recovery-on',
    maxSteps: 4,
    chatFn: makeStallAfterSubmitChat(),
  });

  assert.equal(result.terminalKind, 'submit');
  assert.equal(result.submission.value, 42);
  assert.equal(result.pass, true);
  assert.ok(
    result.weg.nodes.some(
      (node) =>
        node.type === 'draft_recovery' &&
        node.recoveryReason === 'step_budget_exhausted'
    ),
    'expected bounded draft recovery to be recorded'
  );
});

test('draft recovery does not certify a wrong draft', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx2',
    provider: 'test',
    model: 'test',
    episodeId: 'wrong-recovery',
    maxSteps: 4,
    chatFn: makeStallAfterSubmitChat(41),
  });

  assert.equal(result.terminalKind, 'submit');
  assert.equal(result.submission.value, 41);
  assert.equal(result.pass, false, 'the independent validator must reject a recovered wrong draft');
  assert.ok(result.weg.nodes.some((node) => node.type === 'draft_recovery'));
});

test('orgx v1 loses the same unfinished draft because recovery is disabled', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx',
    provider: 'test',
    model: 'test',
    episodeId: 'recovery-off',
    maxSteps: 4,
    chatFn: makeStallAfterSubmitChat(),
  });

  assert.equal(result.terminalKind, 'timeout');
  assert.equal(result.pass, false);
  assert.ok(
    result.weg.nodes.some((node) => node.type === 'budget_exhausted'),
    'expected budget exhaustion when no draft recovery policy is enabled'
  );
});

test('recovery cannot fire when the agent never submitted a draft', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx2',
    provider: 'test',
    model: 'test',
    episodeId: 'no-draft',
    maxSteps: 3,
    chatFn: async () => ({
      usage: {},
      choices: [{ message: { content: 'thinking', tool_calls: [] } }],
    }),
  });

  assert.equal(result.terminalKind, 'timeout');
  assert.equal(result.pass, false);
  assert.ok(!result.weg.nodes.some((node) => node.type === 'draft_recovery'));
});
