// Deterministic test for Gate v3.0 (orgx3) verify-on-the-edge in the runner.
//
// Proves the core claim: the expensive re-derivation pass is spent only on
// BORDERLINE submits, not reflexively. A confident submit is accepted directly
// (saving the verification pass), a borderline one is verified. Uses the
// injected chatFn seam — no provider key / LLM call.
//
// Run: node --test runner/lib/verify-on-the-edge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from './world-engine.mjs';
import { decideVerification } from './verify-on-the-edge.mjs';

const world = {
  id: 'voe-test-world',
  domain: 'trust',
  prompt: 'Submit value 42 with a calibrated _confidence.',
  initState() {
    return {};
  },
  tools: [
    {
      name: 'submit',
      description: 'Submit the answer.',
      parameters: {
        type: 'object',
        properties: { value: { type: 'integer' }, _confidence: { type: 'number' } },
        required: ['value'],
        additionalProperties: true,
      },
      terminal: true,
      handler: (args) => args,
    },
  ],
  verificationPrompt() {
    return 're-derive value';
  },
  validate({ terminal }) {
    return { pass: Number(terminal.submission?.value) === 42, dimensions: {}, detail: {} };
  },
};

// A model that submits once with a given confidence, then (if bounced) submits
// again unchanged.
function submitWithConfidence(confidence) {
  let turn = 0;
  return async function chatFn() {
    turn += 1;
    return {
      usage: {},
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: `c${turn}`,
                function: { name: 'submit', arguments: JSON.stringify({ value: 42, _confidence: confidence }) },
              },
            ],
          },
        },
      ],
    };
  };
}

test('decideVerification: reliable skips, borderline verifies, hopeless skips', () => {
  assert.equal(decideVerification({ confidence: 0.95 }).verify, false);
  assert.equal(decideVerification({ confidence: 0.5 }).verify, true);
  assert.equal(decideVerification({ confidence: 0.05 }).verify, false);
  assert.equal(decideVerification({ confidence: 0.95, highRisk: true }).verify, true);
});

test('orgx3: a CONFIDENT submit is accepted directly — no verification pass', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx3',
    provider: 'test',
    model: 'test',
    episodeId: 'voe-confident',
    maxSteps: 4,
    chatFn: submitWithConfidence(0.97),
  });

  assert.equal(result.terminalKind, 'submit');
  assert.equal(result.submission.value, 42);
  assert.equal(result.pass, true);
  // the submission must NOT carry the meta field
  assert.equal(result.submission._confidence, undefined);
  const gate = result.weg.nodes.find((n) => n.type === 'verification_gate');
  assert.ok(gate, 'gate decision should be recorded');
  assert.equal(gate.band, 'reliable');
  assert.equal(gate.verified, false);
  // accepted on turn 1 → only one model turn (no re-derivation round trip)
  assert.equal(result.weg.modelTurns, 1);
});

test('orgx3: a BORDERLINE submit triggers the verification pass', async () => {
  const result = await runEpisode({
    world,
    arm: 'orgx3',
    provider: 'test',
    model: 'test',
    episodeId: 'voe-borderline',
    maxSteps: 4,
    chatFn: submitWithConfidence(0.5),
  });

  const gate = result.weg.nodes.find((n) => n.type === 'verification_gate');
  assert.equal(gate.band, 'borderline');
  assert.equal(gate.verified, true);
  // bounced then re-submitted → more than one model turn
  assert.ok(result.weg.modelTurns >= 2, 'borderline should cost a re-derivation turn');
  assert.equal(result.pass, true);
});

test('orgx3: high-risk world verifies even a confident submit (safety floor)', async () => {
  const result = await runEpisode({
    world: { ...world, highRisk: true },
    arm: 'orgx3',
    provider: 'test',
    model: 'test',
    episodeId: 'voe-highrisk',
    maxSteps: 4,
    chatFn: submitWithConfidence(0.99),
  });
  const gate = result.weg.nodes.find((n) => n.type === 'verification_gate');
  assert.equal(gate.verified, true);
});
