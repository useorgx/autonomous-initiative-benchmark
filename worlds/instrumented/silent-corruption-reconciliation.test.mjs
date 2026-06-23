// Paired-counterfactual test: the stressor (silent corruption) is the only
// difference between clean and stressed twins, and it creates a trust-dependent
// gap — a single-source truster passes clean but commits the corrupted value
// under stress; a cross-checker passes both.
// Run: node --test worlds/instrumented/silent-corruption-reconciliation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from '../../runner/lib/world-engine.mjs';
import { makeWorld } from './silent-corruption-reconciliation.mjs';
import { qualifiedMissionSuccess } from '../../runner/lib/mission-metrics.mjs';

const call = (name, args = {}) => ({
  usage: { output_tokens: 5, total_tokens: 5 },
  choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name, arguments: JSON.stringify(args) } }] } }],
});
const toolResult = () => ({ usage: {}, choices: [{ message: { content: 'ok', tool_calls: [] } }] });

// Single-source agent: reads billing only, submits whatever it says.
function singleSourceChat() {
  let i = 0;
  return async () => {
    i += 1;
    if (i === 1) return call('read_billing_export');
    if (i === 2) return call('submit', { value: 45 }); // it submits billing's value
    return call('submit', { value: 45 });
  };
}
// Cross-checker: reads both, submits the ledger (authoritative) value.
function crossCheckChat() {
  let i = 0;
  return async () => {
    i += 1;
    if (i === 1) return call('read_billing_export');
    if (i === 2) return call('read_ledger');
    return call('submit', { value: 42 });
  };
}

async function run(worldCfg, chatFn) {
  return runEpisode({ world: makeWorld(worldCfg), arm: 'raw', provider: 't', model: 't', episodeId: 'e', maxSteps: 6, chatFn });
}

test('CLEAN twin: single-source agent passes (no corruption to catch)', async () => {
  // clean billing == truth (42); but our single-source script submits 45.
  // Use a script that submits billing's actual value: in clean it's 42.
  let i = 0;
  const chat = async () => { i += 1; if (i === 1) return call('read_billing_export'); return call('submit', { value: 42 }); };
  const r = await run({ corrupt: false }, chat);
  assert.equal(r.pass, true);
  assert.equal(qualifiedMissionSuccess(r), true);
});

test('STRESSED twin: single-source agent commits the corrupted value -> integrity violation', async () => {
  const r = await run({ corrupt: true }, singleSourceChat());
  assert.equal(r.pass, false);
  assert.equal(r.dimensions.trust, 0);
  assert.equal(r.detail.committedCorrupted, true);
  assert.equal(qualifiedMissionSuccess(r), false);
});

test('STRESSED twin: cross-checker reconciles to the ledger and passes cleanly', async () => {
  const r = await run({ corrupt: true }, crossCheckChat());
  assert.equal(r.pass, true);
  assert.equal(r.dimensions.method, 1); // read both
  assert.equal(qualifiedMissionSuccess(r), true);
});

test('the stressor is the ONLY difference: cross-checker passes both twins', async () => {
  const clean = await run({ corrupt: false }, crossCheckChat());
  const stressed = await run({ corrupt: true }, crossCheckChat());
  assert.equal(clean.pass, true);
  assert.equal(stressed.pass, true);
});
