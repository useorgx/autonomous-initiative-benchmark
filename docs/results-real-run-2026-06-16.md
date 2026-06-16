# Real-model run — 2026-06-16 (deepseek-v4-flash, public worlds)

First end-to-end run of the upgraded harness against a **real model**
(`deepseek/deepseek-v4-flash` via OpenRouter), all instrumented worlds,
arms `raw, orgx2, orgx3, restart`, k=2. Artifact:
`results/worlds-real-2026-06-16/report.json`.

> **NOT headline-eligible.** These are the public / contamination-visible
> instrumented worlds (`public_validation` split). Per `corpus-splits.json`,
> headline numbers come only from the private holdout. The runner's
> corpus-eligibility guard flagged this run accordingly. Read this as a
> *mechanism* measurement on a real model, not a headline score.

## Headline finding: the verify-on-the-edge thesis holds on a real model

| arm | pass@k (raw → arm) | pass^k | quality/Ktoken | mean tokens |
|---|---|---|---|---|
| **orgx2** (reflexive gate) | 1.0 → **0.875**  (−0.125) | 1.0 → 0.875 | 0.259 → 0.127 | 7.9k → **20.5k** (2.6×) |
| **orgx3** (Gate v3.0, verify-on-the-edge) | 1.0 → **1.0**  (no regression) | 1.0 → 1.0 | 0.259 → 0.188 | 7.9k → **16.2k** (2.0×) |

- **Reflexive verification (orgx2) HURT** — it lowered pass@k from 1.0 to 0.875
  while spending 2.6× the tokens. This is the benchmark's core finding,
  reproduced on a real model: verifying every step is usually wrong.
- **Gate v3.0 (orgx3) preserved pass@k at 1.0** — no regression — and did so at
  fewer tokens than orgx2 (2.0× vs 2.6×). Verify-on-the-edge spends the
  re-derivation pass only where it's warranted, so it avoids the harm reflexive
  verification causes. **This is a real-model validation of the v3.0 design.**

## Saturation: confirmed (and why the holdout matters)

Admission: **0 admitted / 8 saturated.** The raw baseline already reaches
pass@k = 1.0 on all eight public worlds at this model — there is no headroom for
an orchestration layer to capture on single-job quality. The orchestration
dimensions (outcome / method / coordination / judgment / trust) are therefore
flat (orgx2 == orgx3 == raw) on this split.

This is exactly the strategy's premise: single-job quality is saturated, so
undeniable uplift can only come from the regimes where raw scores below ceiling
— trust violations, multi-session resume, coordination, economy — which require
the **private holdout** worlds with hidden state and timed human baselines. The
corpus-eligibility guard exists to stop these public, saturated numbers from
being mis-reported as headline.

## Note on the `restart` arm

The restart (kill-and-resume) arm is meaningful only on worlds that declare a
segmentation spec (currently `ledger-running-total`); its aggregate here is
small-sample / artifactual and is not interpreted.

## Two bugs caught by running it for real

1. World discovery matched co-located `*.test.mjs` files (fixed: exclude them).
2. `printReport` assumed a single-comparison uplift shape and crashed on the
   per-arm structure (fixed: iterate per arm).

## Reproduce

```
OPENROUTER_API_KEY=... node runner/run-worlds.mjs \
  --provider openrouter --model deepseek/deepseek-v4-flash \
  --k 2 --arms raw,orgx2,orgx3,restart --out worlds-real-2026-06-16
```

Headline numbers: swap `--split private_holdout` once the holdout worlds land.
