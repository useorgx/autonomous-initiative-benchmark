#!/usr/bin/env node
// Long-cook probe v2: bypass undici's ~5min HeadersTimeout (the real limiter)
// by using node:https with a 30-min socket timeout, so we see whether Fugu
// actually converges on the full design-tokens-production package or self-times
// out at maxSteps. Per-turn logging. Usage: SAKANA_API_KEY=... node runner/probe-design-longcook.mjs [fugu|fugu-ultra]
import https from 'node:https';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { world, consumeTokens } from '../worlds/instrumented/design-tokens-production-in-use.mjs';
import { runEpisode } from './lib/world-engine.mjs';
import { getProvider, requireProviderKey, normalizeChatUsage } from './lib/providers.mjs';

const model = process.argv[2] || 'fugu';
const SOCKET_MS = 1_800_000; // 30 min/turn — really let it cook
const T0 = performance.now();
const log = (m) => process.stdout.write(`[t+${((performance.now() - T0) / 1000).toFixed(0)}s] ${m}\n`);

let turn = 0;
function nodeHttpsChat({ provider, messages, tools, maxOutputTokens }) {
  turn += 1;
  const cfg = getProvider(provider);
  const apiKey = requireProviderKey(provider);
  const payload = JSON.stringify({ model, messages, tools, tool_choice: 'auto', reasoning: { effort: cfg.reasoningEffort ?? 'high' }, max_tokens: maxOutputTokens });
  const u = new URL(cfg.url);
  const t = performance.now();
  log(`turn ${turn}: POST (msgs=${messages.length})...`);
  return new Promise((resolve, reject) => {
    const req = https.request({ method: 'POST', hostname: u.hostname, path: u.pathname, headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        const dt = ((performance.now() - t) / 1000).toFixed(1);
        if (res.statusCode < 200 || res.statusCode >= 300) { log(`turn ${turn}: ${res.statusCode} after ${dt}s :: ${body.slice(0, 160)}`); return reject(new Error(`${res.statusCode}`)); }
        try {
          const json = JSON.parse(body);
          const us = normalizeChatUsage(json.usage ?? {});
          const calls = json.choices?.[0]?.message?.tool_calls?.map((c) => c.function?.name) ?? [];
          log(`turn ${turn}: OK in ${dt}s | total_tokens=${us.total_tokens} | tool_calls=[${calls.join(',')}]`);
          resolve(json);
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(SOCKET_MS, () => { log(`turn ${turn}: socket timeout @${SOCKET_MS / 1000}s`); req.destroy(new Error('socket-timeout')); });
    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

log(`START design-tokens-production on ${model} (node:https, 30min/turn socket, maxSteps=18)`);
try {
  const r = await runEpisode({ world, arm: 'raw', provider: 'fugu', model, episodeId: 'longcook', maxSteps: 18, maxOutputTokens: 9000, timeoutMs: SOCKET_MS, chatFn: nodeHttpsChat });
  const d = r.detail || {};
  log(`DONE terminalKind=${r.terminalKind} shipped=${d.shipped} weightedScore=${d.weightedScore} turns=${r.weg.modelTurns} totalTokens=${r.weg.totalTokens} cost_c=${r.weg.costCents} latency_s=${r.durationSeconds}`);
  log(`blockersFailed=${JSON.stringify(d.blockersFailed)} failed=${JSON.stringify((d.failed || []).map((f) => f.id))}`);
  // Persist the actual submission + per-check detail so we can tell REAL quality
  // failure from schema-shape mismatch (construct validity).
  const full = consumeTokens(r.submission ?? {});
  writeFileSync('/tmp/longcook-submission.json', JSON.stringify({ submission: r.submission, checks: full.checks }, null, 2));
  log('submission shape: ' + JSON.stringify(Object.keys(r.submission ?? {})));
  log('textColors shape: ' + JSON.stringify(r.submission?.textColors && Object.keys(r.submission.textColors)));
} catch (e) {
  log(`EPISODE ERROR: ${e.message}`);
}
