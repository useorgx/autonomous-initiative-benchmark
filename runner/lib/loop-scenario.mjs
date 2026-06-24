// The product <-> benchmark loop, run end-to-end on the real design gate.
// Two iterations, each a sourced schema delta, with grader<->human agreement
// (the north-star) measured at every step.
//
//   v1.0.0  initial 12-gate design Acceptance Schema
//   iter 1  PRODUCT -> BENCHMARK: blind humans keep ACCEPTING palettes the CVD
//           gate rejects *when non-color cues are present*. The override re-derives
//           the check (cvd now passes if cues disambiguate) -> v1.0.1, + minted
//           benchmark fixtures.
//   iter 2  BENCHMARK -> PRODUCT: a benchmark run surfaces a gap the gate misses —
//           button states that DIFFER but ramp incoherently (hover lighter, active
//           darker). A new deterministic gate is added -> v1.1.0.

import { GATE, GOLD } from '../../worlds/instrumented/design-tokens-production-in-use.mjs';
import { createSchema, evolveSchema, gateChecks } from './acceptance-schema.mjs';
import { runGate } from './production-gate.mjs';
import { agreement, reconcileFromOverrides, reconcileFromBenchmark } from './loop-reconciler.mjs';
import { relLuminance } from './production-checks.mjs';

const clone = (o) => JSON.parse(JSON.stringify(o));
const runById = (id) => GATE.find((c) => c.id === id).run;

// The LLM-DERIVED refinement for iter 1: CVD distinguishability is satisfied
// either by distinguishable colors OR by present non-color cues (SC 1.4.1) —
// folding the cue into the check is what the override evidence implies.
function cvdOrCuesRun(a) {
  const cues = runById('use-of-color-cues')(a);
  return cues.pass ? { pass: true, value: 1 } : runById('status-cvd-distinguishable')(a);
}

// The iter-2 benchmark finding: interaction states must ramp monotonically in
// lightness (a coherent hover/active model), not merely differ.
function stateRampMonotonicRun(a) {
  const b = a?.buttonStates ?? {};
  const L = ['default', 'hover', 'active'].map((k) => relLuminance(b[k]));
  if (L.some((x) => x == null)) return { pass: false, value: 0 };
  const dec = L[0] >= L[1] && L[1] >= L[2];
  const inc = L[0] <= L[1] && L[1] <= L[2];
  return { pass: dec || inc, value: dec || inc ? 1 : 0, detail: L };
}

export function buildLabeledSet() {
  // (a) gold — ships, humans accept
  const gold = clone(GOLD);
  // (b) CVD-colliding statuses BUT with distinct non-color cues -> humans ACCEPT
  const cvdCuesPresent = clone(GOLD);
  cvdCuesPresent.statuses.success.color = '#2e9b2e';
  cvdCuesPresent.statuses.danger.color = '#d83030'; // collides with success under CVD
  // (icons/labels remain distinct -> SC 1.4.1 satisfied)
  // (c) button states that DIFFER but ramp incoherently -> humans REJECT
  const incoherentStates = clone(GOLD);
  incoherentStates.buttonStates = { default: '#14B8A6', hover: '#5EEAD4', active: '#0B7468', focus: '#1A2030', disabled: '#9CA3AF' };
  return [
    { id: 'gold', artifact: gold, humanAccept: true },
    { id: 'cvd-cues', artifact: cvdCuesPresent, humanAccept: true },
    { id: 'incoherent-states', artifact: incoherentStates, humanAccept: false },
  ];
}

export function runLoopDemo() {
  const labeled = buildLabeledSet();
  const gateFn = (schema) => (art) => runGate(gateChecks(schema), art, {}, { shipThreshold: schema.shipThreshold }).shipped;

  let schema = createSchema('design', GATE, { shipThreshold: 0.95 });
  const trail = [];
  const snapshot = (phase) => {
    const a = agreement(gateFn(schema), labeled);
    trail.push({ phase, version: schema.version, checks: schema.checks.length, ...a, lastChange: schema.changelog.at(-1).change });
    return a;
  };
  snapshot('v1.0.0 initial');

  // ITER 1 — product -> benchmark: humans override the CVD rejection (cues present)
  const overrides = labeled
    .filter((l) => l.id === 'cvd-cues')
    .flatMap((l) => [0, 1].map((i) => ({ artifactId: `${l.id}-${i}`, artifact: l.artifact, gateShipped: false, humanAccept: true, attributedCheckId: 'status-cvd-distinguishable', derived: { kind: 'retune', run: cvdOrCuesRun } })));
  const r1 = reconcileFromOverrides(schema, overrides, { minSupport: 2 });
  schema = r1.schema;
  snapshot('iter1 product->benchmark (cvd retuned)');

  // ITER 2 — benchmark -> product: discovered incoherent-state-ramp gap
  const r2 = reconcileFromBenchmark(schema, { failureClass: 'incoherent-state-ramp', proposedCheck: { id: 'state-ramp-monotonic', dimension: 'consistency', severity: 'blocker', run: stateRampMonotonicRun }, evidence: 'benchmark run shipped a palette whose hover was lighter but active darker than default' });
  schema = r2.schema;
  snapshot('iter2 benchmark->product (state-ramp gate added)');

  return { trail, finalSchema: schema, mintedCases: r1.mintedCases, changelog: schema.changelog };
}
