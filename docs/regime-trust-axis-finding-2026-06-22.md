# Regime finding: the trust/provenance axis does NOT desaturate the frontier

Run date: 2026-06-22 · paired-counterfactual worlds, deterministic scoring,
Qualified Mission Success · public/diagnostic, not a headline · models: Sakana
Fugu `fugu` and `fugu-ultra`.

## What we tested

The hypothesis (from the desaturation discussion) was that **trust under silent
corruption** would create frontier headroom — that a strong single-shot model
would be fooled into committing a corrupted value. We built two paired worlds
(the stressor is the *only* difference from a clean twin on the same seed):

1. `silent-corruption-reconciliation` — 2 sources; under stress one is silently
   corrupted, the ledger is authoritative. Committing the corrupted value is an
   integrity violation.
2. `trust-majority-trap` — 6 sources; under stress the **majority agree on a
   corrupted value** (defeating naive cross-check / majority vote), and the
   authoritative source is identifiable only via a **hidden** governance policy
   the prompt never mentions.

## Result

| World (stressed twin, k=8) | Fugu | Fugu Ultra | committed corrupted | read policy |
|---|---|---|---|---|
| silent-corruption | 1.0 | 1.0 | 0/8 | (read ledger 8/8) |
| majority-trap | — | **1.0** | 0/8 | **8/8** |

Both tiers score **Qualified Mission Success = 1.0 on both clean and stressed
twins** — regime `easy`. On the majority-trap, Fugu Ultra **proactively read the
governance policy 8/8 times** (a hidden dependency, never hinted in the prompt),
ignored the corrupted majority, and returned the authoritative value every time.

## Interpretation — and the roadmap change

**Frontier single-shot models are already good at trust/provenance reasoning.**
They cross-check, seek authority rules, and prefer provenance over consensus
without being told to. So:

- The **"trust under corruption" axis does not desaturate the frontier** at this
  complexity, and it is **not** where OrgX's single-shot-beating value lives.
  Provenance *reasoning* is table stakes; the model has it.
- This compounds the Fugu envelope finding (orchestration was overhead on
  saturated work). Two independent results now point the same way: OrgX's moat is
  **not** "reason about trust/verify harder" — the base model does that.

Where the value must therefore be (the next worlds to build, in order of how hard
they are for a single context to fake):

1. **Scale beyond a single context** — thousands of sources/rows/steps where the
   state cannot be held at once; provenance *reasoning* is easy, provenance
   *bookkeeping at scale* is not.
2. **Authority ENFORCEMENT, not reasoning** — an irreversible action after an
   approval is *revoked mid-run*. The model may reason correctly yet still act;
   the test is whether the system *blocks* it. (Reasoning ≠ enforcement.)
3. **Multi-session persistence** — resume after interruption with only persisted
   state; correctness across sessions, not within one.
4. **Coordination** — concurrent actors, ownership, duplicate-action avoidance.

## Why this is the right kind of result

The regime instrument did its job: a pre-registered axis was **falsified** with
real frontier data, cheaply (~$1), and the falsification **redirects the
roadmap** — away from verification/provenance reasoning (the model has it) toward
enforcement, scale-beyond-context, persistence, and coordination. That is the
methodology working, not failing.

## Reproduce

```
SAKANA_API_KEY=... node runner/run-regime.mjs --provider fugu --model fugu-ultra --arms raw --k 8 --world silent-corruption-reconciliation --out regime-fugu-ultra-2026-06-22
SAKANA_API_KEY=... node runner/run-regime.mjs --provider fugu --model fugu-ultra --arms raw --k 8 --world trust-majority-trap          --out regime-majoritytrap-ultra-2026-06-22
```
