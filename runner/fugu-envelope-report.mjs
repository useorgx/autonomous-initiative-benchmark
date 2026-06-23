#!/usr/bin/env node
// Build the blog-ready envelope table from Fugu / Fugu Ultra worlds runs (and,
// when present, a single-model baseline run for cross-system context). Reports
// the numbers Sakana doesn't: pass^k reliability, orchestration-overhead ratio,
// and cost-per-verified-outcome — per world and in aggregate.
// Usage: node runner/fugu-envelope-report.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');

async function loadReport(name) {
  try {
    return JSON.parse(await readFile(path.join(repoRoot, 'results', name, 'report.json'), 'utf8'));
  } catch {
    return null;
  }
}

function armOf(report) {
  // each run here is single-arm 'raw' (the model AS a black box)
  const byWorld = {};
  for (const w of report?.perWorld ?? []) {
    const a = w.arms?.raw;
    if (a) byWorld[w.worldId] = { ...a, admission: w.admission, domain: w.domain };
  }
  return byWorld;
}

function pct(x) {
  return x == null ? '—' : `${(x * 100).toFixed(0)}%`;
}
function cents(x) {
  return x == null || x === 0 ? '—' : `${x.toFixed(3)}¢`;
}

const fugu = await loadReport('worlds-fugu-2026-06-22');
const ultra = await loadReport('worlds-fugu-ultra-2026-06-22');
if (!fugu && !ultra) {
  console.error('No Fugu run bundles found.');
  process.exit(1);
}

const f = fugu ? armOf(fugu) : {};
const u = ultra ? armOf(ultra) : {};
const worlds = [...new Set([...Object.keys(f), ...Object.keys(u)])].sort();

const lines = [];
lines.push('## Fugu envelope — deterministic Initiative Worlds (public, non-headline)');
lines.push('');
lines.push(`Fugu k=${fugu?.k ?? '—'} · Fugu Ultra k=${ultra?.k ?? '—'} · deterministic validators, no LLM judge. Orchestration ratio = orchestration tokens / total tokens. Ultra cost is exact (fixed pricing); regular Fugu cost is route-dependent and not computable from tokens.`);
lines.push('');
lines.push('| World | Fugu pass@k | Fugu pass^k | Fugu tok | Fugu orch% | Ultra pass@k | Ultra pass^k | Ultra tok | Ultra orch% | Ultra ¢/ep |');
lines.push('|---|---|---|---|---|---|---|---|---|---|');
for (const w of worlds) {
  const a = f[w] ?? {};
  const b = u[w] ?? {};
  lines.push(
    `| ${w} | ${a.passAtK ?? '—'} | ${a.passPowK ?? '—'} | ${a.meanTokens ?? '—'} | ${pct(a.orchestrationRatio)} | ${b.passAtK ?? '—'} | ${b.passPowK ?? '—'} | ${b.meanTokens ?? '—'} | ${pct(b.orchestrationRatio)} | ${cents(b.meanCostCents)} |`
  );
}

// Aggregates
function agg(map) {
  const vals = Object.values(map);
  if (!vals.length) return null;
  const mean = (sel) => vals.reduce((s, v) => s + (sel(v) ?? 0), 0) / vals.length;
  const passEps = vals.filter((v) => (v.passAtK ?? 0) > 0).length;
  const totalCost = vals.reduce((s, v) => s + (v.meanCostCents ?? 0) * (v.n ?? 0), 0);
  const verified = vals.reduce((s, v) => s + (v.passAtK ?? 0) * (v.n ?? 0), 0);
  return {
    worlds: vals.length,
    meanPassAtK: Number(mean((v) => v.passAtK).toFixed(3)),
    meanPassPowK: Number(mean((v) => v.passPowK).toFixed(3)),
    meanOrch: Number(mean((v) => v.orchestrationRatio).toFixed(4)),
    meanTokens: Math.round(mean((v) => v.meanTokens)),
    costPerVerifiedCents: verified > 0 ? Number((totalCost / verified).toFixed(3)) : null,
  };
}

lines.push('');
lines.push('### Aggregate');
const fa = agg(f);
const ua = agg(u);
if (fa) lines.push(`- **Fugu**: mean pass@k ${fa.meanPassAtK}, pass^k ${fa.meanPassPowK}, mean ${fa.meanTokens} tok/ep, orchestration overhead ${pct(fa.meanOrch)}.`);
if (ua) lines.push(`- **Fugu Ultra**: mean pass@k ${ua.meanPassAtK}, pass^k ${ua.meanPassPowK}, mean ${ua.meanTokens} tok/ep, orchestration overhead ${pct(ua.meanOrch)}, ~${ua.costPerVerifiedCents}¢ per verified outcome.`);
if (fa && ua) {
  const tokMult = fa.meanTokens > 0 ? (ua.meanTokens / fa.meanTokens).toFixed(1) : '—';
  lines.push(`- **Ultra spends ${tokMult}× the tokens of regular Fugu** for ${ua.meanPassAtK >= fa.meanPassAtK ? '+' : ''}${(ua.meanPassAtK - fa.meanPassAtK).toFixed(3)} pass@k.`);
}

console.log(lines.join('\n'));
