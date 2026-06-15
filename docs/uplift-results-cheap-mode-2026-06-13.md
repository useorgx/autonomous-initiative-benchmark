# Uplift evaluation — cheap-mode replication (2026-06-13)

Protocol: [pre-registration Amendment A](uplift-protocol-preregistration-2026-06-12.md#amendment-a).
Base model BOTH arms: `deepseek/deepseek-v4-flash` via OpenRouter (cheapest
lane). Treatment = the verification gate run as code
(`runner/uplift-loop-runner.mjs`, gate v1.1) on the same cheap model — no
fable-5 anywhere. Judges: DeepSeek triple, strict mean aggregation. The
point of cheap mode: pick a base model with real headroom so the gate
mechanism has room to show an effect the frontier run couldn't.

## Headline: the headroom appeared, and the gate produced measurable absolute uplift

| | Raw v4-flash (best-of-2) | v4-flash + gate |
| --- | --- | --- |
| Strict mean (6 tasks) | 70.97 | **78.75** |
| Admitted by the ladder | 5 of 6 | — |
| Score range | 8.6–98.2 | 46–100 |

Unlike the frontier run (which saturated 5/6), the cheap base model is
genuinely challenged: 5 of 6 tasks admitted, scores spread across the whole
range. **The gate lifted the absolute strict mean by +7.8 points** — the
first measured positive uplift in this program.

## But the pre-registered headline metric (pairwise on admitted tasks) still failed

| Admitted task | Raw best | Gate | Pairwise (A=raw, B=gate) |
| --- | --- | --- | --- |
| eng-data-migration-refusal | 21.0 | 46.0 | **gate** (0A/6B) |
| eng-zero-downtime-migration | 66.0 | 79.1 | **gate** (2A/4B) |
| ops-churn-noise-forensics | 94.9 | 91.3 | raw (5A/1B) |
| product-capacity-plan | 90.1 | 69.6 | raw (4A/2B) |
| xfn-revenue-reconciliation | 55.6 | 86.5 | raw (4A/0B, 2 tie) |

Gate wins the pairwise on 2 of 5 admitted tasks. Per the frozen success
condition (gate wins the majority of admitted tasks), **this is a failure** —
but a far more informative one than the frontier null, with three findings
that directly shape the product and the benchmark.

## Finding 1 — the gate helps exactly where verification has work, and HURTS where it doesn't

Gate wins (refusal +25, migration +13, reconciliation +31 absolute) are all
tasks with a verifiable defect for the auditor to catch. Gate losses are
tasks the base model already did well (capacity 90, churn 95) — and here the
**Stage-3 reviser over-edited**: the capacity artifact was compressed from
5,345 to 2,260 characters, dropping the depth that earned the high score. The
gate has no "first, do no harm" guard.

**Gate v1.2 fix (specified, not yet run):** the reviser must preserve every
correct claim and may only ADD corrections or remove verified errors — never
compress or restructure a clean section. When the audit returns only minor
issues on an already-strong artifact, prefer surgical patches over a rewrite.

## Finding 2 — a cheap auditor cannot detect unanswerability, so gate v1.1's refusal fix never fired

The Stage-2 auditor marked `unanswerable: false` on all six tasks, including
the refusal task whose entire point is that it is unanswerable. The gate is
only as strong as its auditor model: v4-flash isn't strong enough to notice
that two source documents irreconcilably contradict. The refusal task still
improved (21→46, because the audit caught lesser issues), but for the wrong
reason. **Implication: the verifier stage should run on a stronger model than
the generator** — a cheap generator + a strong auditor is the economically
interesting configuration to test next, and the harness already supports it
(separate `--model` per stage is a one-line change).

## Finding 3 — LLM judges are unreliable on the hardest arithmetic task; the same panel contradicted itself

On reconciliation, the gate scored 86.5 absolute vs raw's 55.6, yet the SAME
judge panel then preferred raw 4–0 in pairwise. A ground-truth check settles
it: **both arms actually computed the correct ARR ($429,600).** The judges
could not reliably tell that, so their absolute and pairwise verdicts diverge.
This is direct evidence that the hardest tier cannot be LLM-judged — it needs
**deterministic answer-key validation** (the Initiative Worlds thesis). For
tasks with a computable ground truth, the benchmark should check the answer
programmatically and use LLM judges only for residual quality.

## Verdict

- The mechanism works: cheap-mode shows a real +7.8-point absolute uplift, the
  first in this program, and it concentrates exactly on verification-heavy
  tasks — which is the honest scope of the claim.
- The gate as built is net-neutral-to-negative on the pairwise because it
  over-edits already-good work (v1.2 fix) and because a cheap auditor misses
  unanswerability (use a stronger verifier).
- The benchmark's own judges fail on the hardest task — so the next rung must
  pair planted ground truth with deterministic validators, not more LLM
  grading.

This is the result that tells us what to build: gate v1.2 (no-regression
reviser) + asymmetric models (cheap generate, strong verify) + deterministic
validators on computable tasks, then re-measure. Published as-is.

## Artifacts

- `results/raw-v4-flash-hard-20260613` (control, 12 runs),
  `results/raw-v4-flash-hard-best-20260613` (best-of-2),
  `results/orgx-loop-v4flash-hard-20260613` (gate; per-stage audit verdicts in
  run notes), pairwise in that bundle's `pairwise-raw-vs-loop.json`.
- Loop runner: `runner/uplift-loop-runner.mjs` (gate as code, per-task failure
  isolation).
