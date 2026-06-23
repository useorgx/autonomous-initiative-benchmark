#!/usr/bin/env node
// Probe the real Fugu /v1/chat/completions response: latency, tool-call support,
// and the exact usage shape (esp. orchestration token fields) so the engine can
// capture + price them. Cheap (one short call). Usage:
//   SAKANA_API_KEY=... node runner/probe-fugu.mjs [fugu|fugu-ultra]
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const model = process.argv[2] || 'fugu';
const key = process.env.SAKANA_API_KEY;
if (!key) throw new Error('SAKANA_API_KEY required');

const body = {
  model,
  messages: [
    { role: 'system', content: 'You are a precise assistant. Use the submit tool to answer.' },
    { role: 'user', content: 'What is 140 + 10? Call submit with the number.' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'submit',
        description: 'Submit the final number.',
        parameters: { type: 'object', properties: { value: { type: 'number' } }, required: ['value'], additionalProperties: false },
      },
    },
  ],
  tool_choice: 'auto',
  reasoning: { effort: 'high' },
  max_tokens: 2000,
};

const t0 = performance.now();
const res = await fetch('https://api.sakana.ai/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
const ms = Math.round(performance.now() - t0);
console.log(`status=${res.status} latency=${ms}ms model=${model}`);
if (!res.ok) {
  console.log(text.slice(0, 500));
  process.exit(1);
}
const json = JSON.parse(text);
const msg = json.choices?.[0]?.message ?? {};
console.log('tool_calls:', JSON.stringify(msg.tool_calls ?? msg.content ?? null).slice(0, 200));
console.log('USAGE:', JSON.stringify(json.usage, null, 2));
