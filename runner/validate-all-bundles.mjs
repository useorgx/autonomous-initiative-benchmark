#!/usr/bin/env node
// Validate every COMPLETE result bundle (those with a scorecard.csv) against
// the bundle contract. Partial/derived bundles (no scorecard) are listed and
// skipped, not silently passed. Exits non-zero if any complete bundle fails.
// Usage: node runner/validate-all-bundles.mjs
import { readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const resultsDir = path.join(repoRoot, 'results');
const validator = path.join(repoRoot, 'runner', 'validate-bundle.mjs');

const entries = await readdir(resultsDir);
let pass = 0;
let fail = 0;
const skipped = [];

for (const name of entries.sort()) {
  const dir = path.join(resultsDir, name);
  if (!(await stat(dir)).isDirectory()) continue;
  try {
    await access(path.join(dir, 'scorecard.csv'));
  } catch {
    skipped.push(name);
    continue;
  }
  try {
    const out = execFileSync('node', [validator, dir], { encoding: 'utf8' });
    if (/"ok":\s*true/.test(out)) {
      pass += 1;
    } else {
      fail += 1;
      console.error(`FAIL ${name}`);
    }
  } catch (err) {
    fail += 1;
    console.error(`FAIL ${name}: ${err.stdout || err.message}`);
  }
}

console.log(`\ncomplete bundles: ${pass} passed, ${fail} failed.`);
if (skipped.length) {
  console.log(`skipped (no scorecard.csv — partial/derived): ${skipped.join(', ')}`);
}
process.exit(fail > 0 ? 1 : 0);
