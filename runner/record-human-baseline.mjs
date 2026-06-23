#!/usr/bin/env node
// Record a TIMED human baseline for a world. This is the one input no run
// produces — it needs a real human timing themselves on a world. The summary
// machinery (human-baselines.mjs) is complete and tested; this CLI is the
// recording entry point that gates headline-eligibility on >= 3 distinct humans.
//
// Usage:
//   node runner/record-human-baseline.mjs --world <id> --human <id> --seconds <n> --success true|false
//   node runner/record-human-baseline.mjs --summary
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { validateBaselineRecord, summarizeHumanBaselines } from './lib/human-baselines.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const store = path.join(repoRoot, 'results', 'human-baselines.jsonl');

async function loadAll() {
  try {
    const text = await readFile(store, 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--world') p.world = argv[++i];
    else if (a === '--human') p.human = argv[++i];
    else if (a === '--seconds') p.seconds = Number(argv[++i]);
    else if (a === '--success') p.success = argv[++i] === 'true';
    else if (a === '--summary') p.summaryOnly = true;
  }
  return p;
}

const args = parseArgs(process.argv.slice(2));

if (!args.summaryOnly) {
  const record = {
    world_id: args.world,
    human_id: args.human,
    elapsed_seconds: args.seconds,
    success: args.success,
  };
  const err = validateBaselineRecord(record);
  if (err) {
    console.error(`Invalid baseline: ${err}`);
    process.exit(2);
  }
  await appendFile(store, `${JSON.stringify(record)}\n`, 'utf8');
  console.log(`Recorded baseline: ${record.human_id} on ${record.world_id} (${record.elapsed_seconds}s, success=${record.success}).`);
}

const all = await loadAll();
const summary = summarizeHumanBaselines(all);
await writeFile(path.join(repoRoot, 'results', 'human-baseline-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(
  summary.headline_eligible
    ? `\n✅ headline-eligible: ${summary.humans} distinct humans (>= ${summary.minimum_humans}).`
    : `\n⏳ NOT headline-eligible yet: ${summary.humans}/${summary.minimum_humans} distinct humans. Headline speed claims remain suppressed.`
);
