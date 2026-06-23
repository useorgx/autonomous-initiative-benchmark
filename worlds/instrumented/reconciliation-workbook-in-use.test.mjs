// Run: node --test worlds/instrumented/reconciliation-workbook-in-use.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { runEpisode } from '../../runner/lib/world-engine.mjs';
import { world, GOLD_WORKBOOK } from './reconciliation-workbook-in-use.mjs';
import { TERMINAL, classifyTerminalState } from '../../runner/lib/terminal-states.mjs';

const step = (name, args) => ({ usage: { output_tokens: 5, total_tokens: 5 }, choices: [{ message: { content: '', tool_calls: [{ id: 'c', function: { name, arguments: JSON.stringify(args) } }] } }] });

function scriptedAgent(workbook) {
  let i = 0;
  return async () => {
    i += 1;
    if (i === 1) return step('query_invoices', {});
    if (i === 2) return step('get_arr_rules', {});
    return step('submit', workbook);
  };
}

test('an agent that submits the gold workbook achieves QUALIFIED_COMPLETION (downstream accepts)', async () => {
  const r = await runEpisode({ world, arm: 'raw', provider: 't', model: 't', episodeId: 'gold', maxSteps: 6, chatFn: scriptedAgent(GOLD_WORKBOOK) });
  assert.equal(r.pass, true);
  assert.equal(r.dimensions.downstream, 1);
  assert.equal(classifyTerminalState(r), TERMINAL.QUALIFIED_COMPLETION);
  assert.equal(r.detail.normalizedArtifactUtility.candidate, 1);
});

test('a right-total/wrong-lines workbook does NOT complete (downstream rejects)', async () => {
  const wb = JSON.parse(JSON.stringify(GOLD_WORKBOOK));
  wb.lines.find((l) => l.customer === 'eta').annual_recognized -= 2000;
  wb.lines.find((l) => l.customer === 'kappa').annual_recognized += 2000;
  const r = await runEpisode({ world, arm: 'raw', provider: 't', model: 't', episodeId: 'wrong', maxSteps: 6, chatFn: scriptedAgent(wb) });
  assert.equal(r.pass, false);
  assert.equal(r.dimensions.outcome, 1, 'total is right');
  assert.equal(r.dimensions.evidence, 0, 'but not auditable');
  assert.equal(classifyTerminalState(r), TERMINAL.INCORRECT_FAILURE);
});
