# Fugu through the benchmark: the envelope, not the score

Run date: 2026-06-22 · Provider: Sakana Fugu (`fugu`, `fugu-ultra`) via the
OpenAI-compatible `/v1/chat/completions` endpoint · Deterministic Initiative
Worlds, no LLM judge · **Public / contamination-visible worlds — NOT a
headline; a mechanism + regime measurement.**

We ran Sakana's two Fugu tiers through our deterministic worlds and recorded the
resource envelope Sakana's launch doesn't publish: pass^k reliability,
orchestration-overhead ratio, tokens, latency, and exact cost. Total spend to
produce everything below: **$2.30**.

## What Fugu exposes (credit where due)

Fugu Ultra returns orchestration tokens in `usage.*_details`
(`orchestration_input_tokens`, `orchestration_output_tokens`), billed at the
same rate and counted in the total. That is real runtime transparency, and we
score it as such. Two asymmetries, though:

- **Regular `fugu` reports `0` orchestration tokens on every world** — its
  coordination is invisible from the usage payload.
- **Neither tier discloses which models were selected.** Regular `fugu` is
  billed at "the top-tier underlying model's rate," so its dollar cost is
  route-dependent and not computable from the response. Only Ultra's fixed
  pricing ($5/M in, $30/M out, $0.50 cached) lets us compute exact cost.

## Breadth: 9 worlds, k=3

| Tier | pass@k | pass^k | mean tok/ep | orchestration | cost |
|---|---|---|---|---|---|
| Fugu | 0.85 | 0.78 | 3,423 | 0% (not exposed) | route-dependent |
| Fugu Ultra | 0.93 | 0.89 | 6,099 | **45%** | $1.11 total (~4.4¢/verified) |

On a trivial probe ("140 + 10 → 150"), Ultra spent **995 tokens, 900 of them
orchestration (~90%)** vs regular Fugu's 128 — the same answer, 7.8× the tokens,
3.4× the latency.

## Depth: the two non-saturated worlds, k=8 (the reliability bar)

The k=3 breadth pass *hinted* Ultra "recovered" the hard 12-step world. At k=8
that evaporated — it was a small-sample (pass@1-style) illusion:

| World (k=8) | Fugu pass^k | Ultra pass^k | Ultra orchestration | Ultra cost |
|---|---|---|---|---|
| `order-pipeline-horizon` (12-step sequential) | **8/8 (1.0)** | **8/8 (1.0)** | 30% | $0.77 / 8 runs |
| `revenue-refund-reconciliation` (both struggle) | 1/8 (0.125) | **0/8 (0.0)** | 40% | $0.40 / 8 runs |

- On the hard sequential world, **base Fugu is already perfectly reliable at
  k=8**; Ultra's orchestration adds 30% overhead and $0.77 for **zero** extra
  passes.
- On the world both tiers struggle with, Ultra was **slightly worse** (0/8 vs
  1/8), at 40% overhead and real cost.

## The finding

Across 9 deterministic worlds, **Fugu Ultra's orchestration bought zero
additional reliable passes over base Fugu — at 45% orchestration overhead and
~2× the tokens.** Everywhere the base tier was already reliable (7/9 worlds),
the extra orchestration was pure, measured, exactly-priced cost. The one spot
where preliminary k=3 data suggested a win was an artifact of measuring at low k;
pass^k at k=8 dissolved it.

This is the regime map on a real shipped frontier orchestrator: orchestration is
overhead on tasks a strong base tier already handles. It would pay in the
borderline band — a task the tier *almost* gets — but our public worlds mostly
aren't calibrated to that band, and we say so. The honest, reproducible result
is the envelope, and the envelope says: **here, the coordination didn't earn its
tokens.**

## Reproduce

```
SAKANA_API_KEY=... node runner/run-worlds.mjs --provider fugu --model fugu        --arms raw --k 3 --out worlds-fugu-2026-06-22
SAKANA_API_KEY=... node runner/run-worlds.mjs --provider fugu --model fugu-ultra  --arms raw --k 3 --out worlds-fugu-ultra-2026-06-22
# depth on the two non-saturated worlds:
SAKANA_API_KEY=... node runner/run-worlds.mjs --provider fugu --model fugu-ultra  --arms raw --k 8 --world order-pipeline-horizon --out worlds-fugu-ultra-order-pipeline-horizon-k8
node runner/fugu-envelope-report.mjs
```

Bundles: `results/worlds-fugu-2026-06-22/`, `results/worlds-fugu-ultra-2026-06-22/`,
`results/worlds-fugu-{,ultra-}{order-pipeline-horizon,revenue-refund-reconciliation}-k8/`.
