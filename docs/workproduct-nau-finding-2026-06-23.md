# First live Normalized Artifact Utility — reconciliation workbook-in-use

Run date: 2026-06-23 · world `reconciliation-workbook-in-use` · deterministic
downstream consumer (no LLM judge) · Sakana Fugu, k=5 · public/diagnostic.

The deliverable is a reconciliation WORKBOOK a deterministic downstream consumer
("controller posts the quarter close") applies; accepted only if the total is
correct AND internally consistent AND auditable (every real-revenue line traces
to the true recognized amount). NAU = (candidate − no-artifact) / (gold − no-artifact),
with no-artifact = 0 (naive all-rows sum is wrong) and gold = 1.

| Tier | correct total (scalar) | accepted workbook (downstream) | NAU | cost |
|---|---|---|---|---|
| Fugu Ultra | 4/5 | 4/5 | **0.80** | $0.49 |
| Fugu (regular) | 5/5 | 5/5 | **1.00** | route-dependent (cheaper tier) |

## Findings

1. **Real NAU from a live model, deterministically.** First end-to-end
   work-product-in-use measurement: an LLM's deliverable scored by a downstream
   consumer applying it, not by an opinion of its text. NAU 0.80 / 1.00.
2. **Regular Fugu beat Ultra** on producing a *usable* reconciliation (5/5 vs
   4/5) at a fraction of the cost — the orchestration-overhead pattern again
   (more machinery, more variance, no gain here).
3. **The instrument caught a grader bug, not just a model behavior.** The
   calibration run: Fugu Ultra produced the EXACT correct total ($186,000) but
   the workbook was first scored unusable — because it added a harmless,
   documented `$0` line for the `lambda` free trial and the grader demanded an
   exact set match. That is a grader false-negative (a controller would accept a
   $0 documentation line). Fixed: auditability now requires every real-revenue
   line present and correct, no nonzero line that doesn't trace to data, dedup —
   and ignores harmless $0 lines. The compensating-error and missing-customer
   catches are preserved (regression-tested). This is the grader-mutation-suite
   discipline working: a grader must fail submissions for the RIGHT reason.
4. **On this world, scalar and work-product scores mostly agree** post-fix —
   when the total is right the workbook is usually usable. The "right number,
   unusable artifact" gap is real (the lambda case proved the instrument sees it)
   but small here; it will widen on artifact types where looks-right ≠ usable
   diverges more (decks that render, code that runs, plans with feasible
   dependencies, multi-section handoffs). Those are the next Artifact-in-Use
   worlds (see the v4 per-world endpoint table).

## Reproduce

```
SAKANA_API_KEY=... node runner/run-worlds.mjs --provider fugu --model fugu-ultra \
  --arms raw --k 5 --world reconciliation-workbook-in-use --out wb-ultra-2026-06-23
```
Per-episode `detail.normalizedArtifactUtility` = { noArtifact, candidate, gold }.
