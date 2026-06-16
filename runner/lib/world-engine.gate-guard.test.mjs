// Forced-failure test for the Gate v2.0 no-regression guard.
//
// The benchmark's headline claim is that the gate is "incapable of lowering a
// result the agent already produced" — but in the v2 run that guard PASSED BY
// VARIANCE, never by the guard actually firing. This test forces the failure
// mode the guard exists for: the agent submits a correct draft, then the
// re-derivation pass never converges (blows the step budget). It asserts:
//   1. orgx2 (guard ON)  -> the validated draft is recovered; pass is preserved.
//   2. orgx  (guard OFF) -> the draft is lost to a timeout; pass collapses.
// The contrast proves the guard is both firing AND load-bearing.
//
// Fully deterministic: injects a scripted chatFn, so no provider key / LLM call.
// Run: node --test runner/lib/world-engine.gate-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from './world-engine.mjs';

// Minimal world: submit { value }, pass iff value === 42.
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
    return { pass: value === 42, dimensions: { outcome: value === 42 ? 1 : 0 }, detail: { value } };
  },
};

// Scripted model: turn 1 submits the correct draft (value 42); every later
// turn "stalls" (answers in prose with no tool call) so the verification pass
// never produces a second submit and the step budget is exhausted.
function makeStallAfterSubmitChat() {
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
                { id: 'c1', function: { name: 'submit', arguments: JSON.stringify({ value: 42 }) } },
              ],
            },
          },
        ],
      };
    }
    // Stall: no tool call → the loop nudges and burns budget without a terminal.
    return { usage: {}, choices: [{ message: { content: 'still thinking...', tool_calls: [] } }] };
  };
}

test('orgx2: no-regression guard recovers the validated draft when verification never converges', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx2',
    provider: 'test',
    model: 'test',
    episodeId: 'guard-on',
    maxSteps: 4,
    chatFn: makeStallAfterSubmitChat(),
  });

  assert.equal(result.terminalKind, 'submit');
  assert.equal(result.submission.value, 42);
  assert.equal(result.pass, true);
  assert.ok(
    result.weg.nodes.some((n) => n.type === 'no_regression_fallback'),
    'expected the no_regression_fallback node to be recorded'
  );
});

test('orgx (v1, guard OFF): the same forced failure loses the draft to a timeout', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx',
    provider: 'test',
    model: 'test',
    episodeId: 'guard-off',
    maxSteps: 4,
    chatFn: makeStallAfterSubmitChat(),
  });

  assert.equal(result.terminalKind, 'timeout');
  assert.equal(result.pass, false);
  assert.ok(
    result.weg.nodes.some((n) => n.type === 'budget_exhausted'),
    'expected budget_exhausted (no guard to recover the draft)'
  );
});

test('the guard does not fire when the agent never submitted (no draft to recover)', async () => {
  // Never submits at all → even orgx2 must time out, not fabricate a draft.
  const result = await runEpisode({
    world,
    arm: 'orgx2',
    provider: 'test',
    model: 'test',
    episodeId: 'no-draft',
    maxSteps: 3,
    chatFn: async () => ({ usage: {}, choices: [{ message: { content: 'thinking', tool_calls: [] } }] }),
  });

  assert.equal(result.terminalKind, 'timeout');
  assert.equal(result.pass, false);
});
