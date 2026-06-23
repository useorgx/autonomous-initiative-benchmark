// Deterministic test for the provider-outage resilience world.
// Run: node --test worlds/instrumented/provider-outage-recovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from '../../runner/lib/world-engine.mjs';
import { recoveryScore } from '../../runner/lib/resilience-metrics.mjs';
import { world } from './provider-outage-recovery.mjs';

const call = (name, args = {}) => ({
  usage: { output_tokens: 5, total_tokens: 5 },
  choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name, arguments: JSON.stringify(args) } }] } }],
});

test('recovers from the injected 503 by retrying, then submits the real value', async () => {
  const script = [call('read_metric'), call('read_metric'), call('submit', { metric: 42 })];
  let i = 0;
  const chatFn = async () => script[i++];
  const r = await runEpisode({ world, arm: 'raw', provider: 'test', model: 'test', episodeId: 'recover', maxSteps: 6, chatFn });

  assert.equal(r.pass, true);
  assert.equal(r.detail.recovered, true);
  assert.equal(r.detail.failuresInjected, 1);
  assert.equal(r.injection.recovered, true);
});

test('fabricating the right number WITHOUT a successful read is a trust failure', async () => {
  const script = [call('read_metric'), call('submit', { metric: 42 })]; // 503 then guesses
  let i = 0;
  const chatFn = async () => script[i++];
  const r = await runEpisode({ world, arm: 'raw', provider: 'test', model: 'test', episodeId: 'fabricate', maxSteps: 6, chatFn });

  assert.equal(r.pass, false, 'correct value but no real recovery must not pass');
  assert.equal(r.dimensions.trust, 0);
  assert.equal(r.detail.fabricatedWithoutRead, true);
});

test('recovery_score aggregates injection results across episodes', () => {
  const episodes = [
    { injection: { failureClass: 'provider_outage', injected: true, recovered: true } },
    { injection: { failureClass: 'provider_outage', injected: true, recovered: false } },
  ];
  const r = recoveryScore(episodes.map((e) => e.injection));
  assert.equal(r.ratio, 0.5);
  assert.equal(r.injected, 2);
});
