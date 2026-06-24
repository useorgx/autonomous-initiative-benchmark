# Grounding quality: LLMs derive, code judges, the loop learns taste

**Date:** 2026-06-23. The epistemic stance behind the Acceptance Schema and the
product↔benchmark loop — and an honest answer to "taste can't be described in
pure code."

## The division of labor

> **LLMs are measurement/derivation tools. Deterministic code is the runtime
> oracle. Humans arbitrate the residue. The loop reconciles all three.**

- **LLM (derive/measure):** extract structured features from an artifact and an
  exemplar set; *propose* the deterministic checks and thresholds that separate
  good from bad; classify and summarize. It never renders the final pass/fail.
- **Code (judge):** the gate runs pure, deterministic checks. Same code in the
  benchmark and the product. No black-box score decides shipping.
- **Humans (arbitrate):** blind operators accept/reject. Their overrides are the
  ground truth that calibrates and corrects the gate.
- **Loop (reconcile):** overrides re-derive checks (product→benchmark); benchmark
  findings add gates (benchmark→product). Every change is versioned + sourced.

Why this split: an LLM-as-oracle imports a documented bias stack (position,
verbosity, self-preference, drift, gameability) and is *opaque* — which destroys
the exact thing OrgX sells (a visible, controllable definition of done). A
deterministic gate is auditable, ungameable-by-prose, and exposable as a receipt.
But pure code can't author the criteria for messy, taste-laden work — so the LLM
does that *offline*, as derivation, and the output is frozen into checkable code.

## "Beauty has mathematical coherence, even when asymmetric"

This is right, and it's why taste is partially codifiable. Coherence is a
*relationship*, not a symmetry:

- **Visual hierarchy is ordered.** Heading ≥ body ≥ caption in contrast. An
  inverted hierarchy is *measurably* wrong (`hierarchyMonotonic`).
- **Color harmony is angular.** Accent hues that relate by recognizable intervals
  (analogous / complementary / triadic) cohere; random scatter doesn't — a
  residual-to-nearest-harmonic-angle measures it (`hueHarmonyResidual`). Analogous
  palettes are deeply asymmetric yet coherent — the math captures that.
- **Order per element.** Birkhoff's M = O/C (harmonic relationships ÷ distinct
  hues) formalizes "coherent without being busy."

These are **necessary, not sufficient.** Their *violation* is reliably bad taste;
their *satisfaction* doesn't certify beauty. So we gate on them as falsifiers of
ugliness, and we are explicit that passing them is the floor, not the ceiling.

## The brittleness residue — handled, not denied

You're right that taste can't be *fully* reduced to code, and a gate that
pretended otherwise would be brittle (false-reject genuinely good work, false-
accept polished-but-empty work). We handle the residue with three layers:

1. **Deterministic floor.** The quantified gates above. Catch the definite
   failures; never the final word on excellence.
2. **Derived, calibrated measures.** When a quality dimension resists a clean
   rule, the LLM derives a *candidate* deterministic measure + threshold from
   rated exemplars, and we publish its agreement with human raters per task
   family. If it can't beat a stated agreement bar, it stays advisory (reported,
   non-gating) — never a silent blocker.
3. **Human override as ground truth.** The residue that no measure yet captures
   is resolved by a blind human, and that override is the highest-signal event in
   the system.

## The loop is how the gate chases taste it can't yet name

Taste reveals itself through use. The loop turns each revelation into a versioned
schema change:

- **product → benchmark:** repeated human overrides of a check re-derive it
  (e.g. "CVD distinguishability is satisfied when non-color cues are present")
  and mint the overridden artifacts as new benchmark fixtures.
- **benchmark → product:** a failure the gate missed becomes a new gate
  (e.g. "interaction states must ramp monotonically in lightness").

Demonstrated on the real design gate (`node runner/loop-demo.mjs`):

| phase | version | checks | grader↔human agreement |
|---|---|---|---|
| initial | 1.0.0 | 12 | 0.33 |
| iter 1 — product→benchmark (CVD retuned) | 1.0.1 | 12 | 0.67 |
| iter 2 — benchmark→product (state-ramp gate added) | 1.1.0 | 13 | 1.00 |

Each step is sourced in the changelog; the overrides became benchmark fixtures.
Agreement with humans rises because the schema *learned the residue* — not because
a judge got smarter. The deterministic core stayed pure the whole way.

## The one-line stance

Don't ask code to *have* taste. Ask it to **hold the line on coherence it can
measure**, ask the LLM to **derive new measures from what humans reward**, and let
the **loop** keep re-deriving as taste shows itself — so the gate's agreement with
real judgement climbs over time without ever becoming a black box.
