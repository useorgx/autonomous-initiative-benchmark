// Deterministic tests for the two compute-matched null arms added for the
// post-Fugu "is the gain policy or just more sampling?" controls:
//   - reflect (self-reflection): one generic self-critique pass
//   - bon (best-of-N): N independent samples selected by majority vote
// Fully scripted chatFn — no provider key / LLM call.
// Run: node --test runner/lib/world-engine.arms.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode, runBestOfNEpisode } from './world-engine.mjs';

// Minimal world: submit { value }, pass iff value === 42.
const world = {
  id: 'arms-test-world',
  domain: 'outcome',
  prompt: 'Submit value 42.',
  initState: () => ({}),
  tools: [
    {
      name: 'submit',
      description: 'Submit the answer.',
      parameters: { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'], additionalProperties: false },
      terminal: true,
      handler: (args) => args,
    },
  ],
  verificationPrompt: (draft) => JSON.stringify({ draft }),
  validate: ({ terminal }) => {
    const value = Number(terminal.submission?.value);
    return { pass: value === 42, dimensions: { outcome: value === 42 ? 1 : 0 }, detail: { value } };
  },
};

const submitCall = (value) => ({
  usage: { output_tokens: 10, total_tokens: 10 },
  choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name: 'submit', arguments: JSON.stringify({ value }) } }] } }],
});

test('reflect: a wrong first submit is corrected by the self-critique pass', async () => {
  let turn = 0;
  const chatFn = async () => {
    turn += 1;
    return submitCall(turn === 1 ? 1 : 42); // wrong, then corrected on reflection
  };
  const r = await runEpisode({ world, arm: 'reflect', provider: 'test', model: 'test', episodeId: 'reflect', maxSteps: 4, chatFn });
  assert.equal(r.pass, true);
  assert.equal(r.submission.value, 42);
  assert.ok(r.weg.nodes.some((n) => n.type === 'self_reflection_pass'), 'expected a self_reflection_pass node');
});

test('reflect: naive reflection has NO no-regression guard (can time out)', async () => {
  let turn = 0;
  const chatFn = async () => {
    turn += 1;
    if (turn === 1) return submitCall(42);
    return { usage: {}, choices: [{ message: { content: 'rethinking', tool_calls: [] } }] }; // stall forever
  };
  const r = await runEpisode({ world, arm: 'reflect', provider: 'test', model: 'test', episodeId: 'reflect-stall', maxSteps: 4, chatFn });
  assert.equal(r.terminalKind, 'timeout'); // unlike orgx2, no draft is recovered
  assert.equal(r.pass, false);
});

test('bon: majority vote selects the modal answer; compute is summed across N', async () => {
  const values = [42, 42, 7];
  let i = 0;
  const chatFn = async () => submitCall(values[i++]); // each raw run submits on turn 1
  const r = await runBestOfNEpisode({ world, provider: 'test', model: 'test', episodeId: 'bon', n: 3, chatFn });
  assert.equal(r.submission.value, 42, 'consensus is the 2-vote answer');
  assert.equal(r.pass, true);
  assert.equal(r.detail.bestOfN.n, 3);
  assert.equal(r.detail.bestOfN.votes, 2);
  assert.equal(r.weg.totalTokens, 30, 'tokens summed across all 3 samples (10 each)');
});

test('bon: a wrong majority honestly fails (no oracle rescue)', async () => {
  const values = [7, 7, 42];
  let i = 0;
  const chatFn = async () => submitCall(values[i++]);
  const r = await runBestOfNEpisode({ world, provider: 'test', model: 'test', episodeId: 'bon-wrong', n: 3, chatFn });
  assert.equal(r.submission.value, 7, 'consensus follows the votes, not the validator');
  assert.equal(r.pass, false);
});
