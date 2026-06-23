#!/usr/bin/env node
// Print the product <-> benchmark loop running over 2 iterations on the real
// design Acceptance Schema. Usage: node runner/loop-demo.mjs
import { runLoopDemo } from './lib/loop-scenario.mjs';

const { trail, changelog, mintedCases } = runLoopDemo();

console.log('\nProduct <-> Benchmark loop — design Acceptance Schema\n');
console.log('phase'.padEnd(42), 'ver'.padEnd(8), 'checks', 'agree', 'falseAcc', 'falseRej');
for (const t of trail) {
  console.log(t.phase.padEnd(42), t.version.padEnd(8), String(t.checks).padEnd(6), String(t.agreement).padEnd(6), String(t.falseAcceptRate).padEnd(9), String(t.falseRejectRate));
}
console.log('\nChangelog (every change sourced + versioned):');
for (const c of changelog) console.log(`  ${c.version}  ${c.change}  [${c.source}]${c.reason ? ' — ' + c.reason : ''}`);
console.log(`\nMinted benchmark fixtures from production overrides: ${mintedCases.length} (${mintedCases.map((m) => m.label).join(', ')})`);
console.log('\nThe loop: real human overrides re-derived a check (product->benchmark);');
console.log('a benchmark-discovered gap added a gate (benchmark->product). Agreement 0.33 -> 1.00.\n');
