# Post-Fugu Benchmark Plan of Record

**Date:** 2026-06-22 · **Status:** Phase 1 (integrity repair) implemented; phases 2–6 sequenced.

Sakana shipped Fugu / Fugu Ultra on 2026-06-22 — a learned multi-agent
orchestrator exposed through a model-shaped, OpenAI-compatible endpoint. This is
the plan for how OrgX-Bench responds: not with a reactive dunk, but by setting a
neutral measurement contract and conforming to it first — including fixing our
own house.

## Locked decisions

1. **Primary headline metric** — World Success Rate (deterministic) is primary,
   Trust-Adjusted Score is the gate, cost-per-verified-outcome is the efficiency
   axis. **Flow Multiplier is retired as "the headline number"** and suppressed
   entirely unless a `timed_human_run` baseline exists.
2. **Publication / loss policy** — every scheduled run's *existence* is
   registered publicly with a status label (`publish-ready` / `with-caveats` /
   `do-not-publish` / `invalid-for-cost`). Headline claims only on wins; the
   registry never hides that a run happened or why it wasn't headlined. This
   kills survivorship bias while keeping the "beat single_agent" bar.

## Verified defects that gated everything (now fixed in Phase 1)

| Defect | Was | Now |
| --- | --- | --- |
| Zero-cost generation | OrgX/Fable-5 surface published `0 tokens / 0¢` (looked free vs a $4.13 raw baseline) | `null` + `coverage:0` + `costComparable:false` + `invalidForCost:true` |
| Judge mis-attribution | "independent **OpenAI** judge calls" hardcoded across 10+ bundles | claims derived from the real panel (3× DeepSeek via OpenRouter) |
| Metric contradiction | mdx called Flow Multiplier "the headline number" | demoted in writer + methodology |
| Headline split empty | 0/10 holdout, 0 human baselines, k=2 | unchanged — this is the Phase 5 work; everything is labeled mechanism/regime, not headline |

## Framing guardrails (every public word)

- **Not** "Fugu hides everything" → "Fugu exposes per-request runtime telemetry;
  OrgX owns the durable, replayable execution record across the whole initiative."
- **Not** "OrgX beats Fugu" → "Fugu is a backend; OrgX is the trust/control layer
  that makes backends interchangeable."
- **Sovereignty operationally only** (provider control, cost/compute constraint,
  visible route, portable state, BYOK) — never open-vs-closed while closed.
- **Lead with predictability, not price.** Fugu bills at the highest-tier rate in
  its pool, not the sum of inner calls; a dollar dunk boomerangs. Report the
  envelope (latency, orchestration tokens, quota burn, retries) and let
  predictability be the trust axis.

## The sequence

1. **Integrity repair** — *done.* `runner/lib/claims.mjs` (manifest-derived
   claims), `runner/lib/telemetry.mjs` (null-not-zero + coverage + comparability),
   `runner/reissue-bundles.mjs` (corrected all 15 bundles + regenerated
   `results/index.json`), validator updated to the new semantics.
2. **Pre-register** the run matrix (`schemas/evaluation-manifest.schema.json` +
   example) *before* any Fugu run — pre-empts "you chose tests after seeing
   results."
3. **Contract post** — *"An Orchestrator Is Not a Model: The Benchmark Contract
   Agent Systems Need."* Standard-setting, built on existing regime-map data; no
   new runs required. The piece that rides the news cycle honestly.
4. **3-arm demo** — single frontier / Fugu+Ultra / OrgX gate, on public worlds,
   labeled non-headline. Report the envelope: field-based
   `provenance_completeness`, `recovery_score`, `budget_adherence`, latency,
   orchestration-token + quota burn.
5. **v0.3 validity program** — populate the 0/10 private holdout, collect ≥3
   timed human baselines, add **best-of-N** and **self-reflection** null arms
   (the "is it just more sampling?" controls), and build the failure-injection
   resilience worlds (model substitution, provider outage, context poisoning,
   seam drift, permission mismatch) — which also restores headroom the
   raw-saturated public worlds lost.
6. **Then** contrast with Fugu under the contract — including losses.

## New measurement primitives (scaffolded in Phase 1, wired in Phase 4)

- `runner/lib/provenance.mjs` — `provenance_completeness` (field-based; a
  black-box endpoint earns credit for what it *does* expose, so the rubric isn't
  rigged) and `decisionReplayability`.
- `runner/lib/resilience-metrics.mjs` — `recovery_score`, `budget_adherence`,
  `uncertainty_honesty`. A model endpoint can answer; a control plane should
  recover, stay in budget, and admit uncertainty.

## The honest risk, stated loudly

The headline machinery exists; the headline *data* does not (empty holdout, zero
timed human baselines, k=2). Until Phase 5 lands, **everything is explicitly a
mechanism/regime measurement, not a headline** — and saying so is the
credibility move, not the weakness.
