// Run: node --test runner/lib/claims.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaims } from './claims.mjs';

test('judge claim names the ACTUAL panel, never "OpenAI" by default', () => {
  const claims = buildClaims({
    generationMethod: { provider: 'orgx', model: 'claude-fable-5' },
    judgePanel: [
      { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
      { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' },
      { provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' },
    ],
    hasJudges: true,
  });
  const joined = claims.join(' ');
  assert.match(joined, /deepseek/i);
  assert.match(joined, /OpenRouter/);
  assert.doesNotMatch(joined, /OpenAI judge/i);
});

test('generation claim reflects the real surface', () => {
  const claims = buildClaims({
    generationMethod: { provider: 'orgx', model: 'claude-fable-5' },
    judgePanel: [],
    hasJudges: false,
  });
  assert.match(claims[0], /claude-fable-5/);
  assert.match(claims[0], /OrgX agent surface/);
});

test('cost-not-comparable warning is appended when telemetry is incomplete', () => {
  const claims = buildClaims({
    generationMethod: { provider: 'orgx', model: 'claude-fable-5' },
    judgePanel: [{ provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' }],
    hasJudges: true,
    costComparable: false,
  });
  assert.match(claims.join(' '), /COST NOT COMPARABLE/);
});

test('no spurious warning when cost IS comparable', () => {
  const claims = buildClaims({
    generationMethod: { provider: 'openai', model: 'gpt-5-nano' },
    judgePanel: [{ provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' }],
    hasJudges: true,
    costComparable: true,
  });
  assert.doesNotMatch(claims.join(' '), /COST NOT COMPARABLE/);
});
