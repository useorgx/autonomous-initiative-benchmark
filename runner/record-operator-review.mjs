#!/usr/bin/env node
// Record a BLIND, role-qualified operator's review of a produced work product —
// the one input no run produces. Operators are blind to which system made the
// artifact. Feeds grader calibration (record real acceptance vs the automated
// grader's verdict). Mirrors record-human-baseline.mjs.
//
// Usage:
//   node runner/record-operator-review.mjs --artifact <id> --operator <id> \
//     --accepted true|false --rework-minutes <n> --clarifications <n> --defects <n> \
//     --grader-accepted true|false
//   node runner/record-operator-review.mjs --summary
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { validateOperatorReview, calibrateGraderVsOperators, operatorMetrics } from './lib/operator-calibration.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const store = path.join(repoRoot, 'results', 'operator-reviews.jsonl');

function parseArgs(argv) {
  const p = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--artifact') p.artifact_id = argv[++i];
    else if (a === '--operator') p.operator_id = argv[++i];
    else if (a === '--accepted') p.accepted = argv[++i] === 'true';
    else if (a === '--rework-minutes') p.rework_minutes = Number(argv[++i]);
    else if (a === '--clarifications') p.clarifications = Number(argv[++i]);
    else if (a === '--defects') p.defects = Number(argv[++i]);
    else if (a === '--grader-accepted') p.grader_accepted = argv[++i] === 'true';
    else if (a === '--summary') p.summaryOnly = true;
  }
  return p;
}

async function loadAll() {
  try {
    return (await readFile(store, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const args = parseArgs(process.argv.slice(2));

if (!args.summaryOnly) {
  const err = validateOperatorReview(args);
  if (err) {
    console.error(`Invalid review: ${err}`);
    process.exit(2);
  }
  await appendFile(store, `${JSON.stringify(args)}\n`, 'utf8');
  console.log(`Recorded: ${args.operator_id} ${args.accepted ? 'ACCEPTED' : 'REJECTED'} ${args.artifact_id}`);
}

const all = await loadAll();
const metrics = operatorMetrics(all);
const pairs = all.filter((r) => typeof r.grader_accepted === 'boolean').map((r) => ({ automated: r.grader_accepted, human: r.accepted }));
const calibration = calibrateGraderVsOperators(pairs);
const out = { metrics, calibration };
await writeFile(path.join(repoRoot, 'results', 'operator-calibration-summary.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
if (calibration.n && !calibration.calibrated) {
  console.log(`\n⚠️  Grader NOT calibrated: overstates acceptance by ${calibration.overstatementPp}pp (agreement ${calibration.agreement}). Acceptance claims are not yet defensible.`);
}
