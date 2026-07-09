// Run: node --test runner/lib/providers.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chatReasoningFields,
  getProvider,
  normalizeAnthropicUsage,
  providerHeaders,
} from './providers.mjs';

test('provider registry includes first-party Anthropic and Google entries', () => {
  assert.equal(getProvider('anthropic').api, 'anthropic_messages');
  assert.equal(getProvider('anthropic').url, 'https://api.anthropic.com/v1/messages');
  assert.equal(getProvider('google').api, 'chat');
  assert.equal(
    getProvider('google').url,
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
  );
});

test('providerHeaders uses Anthropic Messages API authentication headers', () => {
  assert.deepEqual(providerHeaders(getProvider('anthropic'), 'ak-test'), {
    'x-api-key': 'ak-test',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  });
});

test('providerHeaders uses bearer auth for OpenAI-compatible providers', () => {
  assert.deepEqual(providerHeaders(getProvider('google'), 'g-test'), {
    Authorization: 'Bearer g-test',
    'Content-Type': 'application/json',
  });
});

test('chatReasoningFields maps Gemini to OpenAI-compatible reasoning_effort', () => {
  assert.deepEqual(chatReasoningFields(getProvider('google'), 'high'), {
    reasoning_effort: 'high',
  });
  assert.deepEqual(chatReasoningFields(getProvider('openrouter'), 'high'), {
    reasoning: { effort: 'high' },
  });
});

test('normalizeAnthropicUsage maps Messages API usage into benchmark accounting shape', () => {
  assert.deepEqual(
    normalizeAnthropicUsage({
      input_tokens: 100,
      cache_read_input_tokens: 20,
      output_tokens: 40,
    }),
    {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens: 40,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 140,
    }
  );
});
