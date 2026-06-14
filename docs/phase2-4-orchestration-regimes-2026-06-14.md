# Phases 2–4 — when orchestration helps, hurts, or is wasted (2026-06-14)

Phase 1 showed the reflexive verification loop was net-harmful on a strong
cheap model. Phases 2–4 build the fixes and map the full regime: three
orchestration interventions × two model strengths, all deterministically
scored, agent isolated from grader, pass^k, token-normalized. The headline:
**there is no free lunch — every orchestration intervention is conditionally
valuable at best and harmful at worst, and the value band is narrow.**

## Phase 2 — the three interventions on the long-horizon world (v4-flash, k=8)

The 12-step stateful pipeline (shared inventory depletes order-by-order).

| Arm | pass@k | pass^k | mean tokens | verdict |
| --- | --- | --- | --- | --- |
| raw tool agent | **1.00** | **1** | 23,438 | the model already nails it |
| OrgX gate v1 (reflexive verify) | 0.75 | 0 | 70,254 | **harmful** — induced 2/8 failures, 3× cost |
| OrgX gate v2.0 (no-regression) | **1.00** | **1** | 56,597 | harm removed; +0 value, 2.4× cost |
| restart-at-boundary | 0.125 | 0 | 29,342 | **harmful** — new failure mode (below) |

**Gate v2.0 works as designed.** The no-regression guard (keep the validated
draft if the verification pass blows its budget) restored pass^k from 0 → 1.0:
the loop can no longer lower a result the agent already had. But on a task the
base model already saturates, v2.0 adds zero quality at 2.4× the tokens — it
makes the loop *safe*, not *valuable*.

**Restart-at-boundary is the most instructive failure.** Decomposing the batch
into 3 segments, each run in a fresh context carrying only verified state,
**solved the hard part perfectly** — every one of the 8 runs produced the exact
revenue ($9,945) and the exact backordered set [O7,O9,O10], i.e. the sequential
inventory-depletion reasoning that is the actual difficulty. But it **introduced
a new failure at the seams**: the running fulfilled-count, carried across
segment boundaries, drifted (10 instead of 9; once 33), failing 7/8. The
decomposition traded the state-drift failure mode for a boundary-aggregation
failure mode. This is the contrarian "dispersed context / coordination
overhead" result (Cognition, multi-agent failure taxonomies) reproduced in a
controlled, deterministic setting: splitting work creates seams, and seams leak.

## Phase 4 — model sweep: the same gate on a weak model (llama-3.1-8b, k=6)

Run the honest control vs gate v2.0 across all five worlds on a much weaker base
model, to find where headroom exists.

| World | raw pass@k | orgx2 pass@k | regime |
| --- | --- | --- | --- |
| incident-triage | 1.00 | 1.00 | model reliable → no change |
| migration-refusal | 0.17 | **0.33** | **borderline → gate recovers (doubled)** |
| order-pipeline-horizon | 0.00 | 0.00 | model hopeless → nothing to recover |
| revenue-hard-6-trap | 0.00 | 0.00 | model hopeless → nothing to recover |
| revenue-refund | 0.00 | 0.00 | model hopeless → nothing to recover |

This is the program's first **positive** uplift cell: on the one world where the
weak model is *borderline* (gets it right ~1 in 6), the grounded verification
gate doubled the pass rate (0.17 → 0.33) at modest cost (1.2k → 2.8k tokens).
Where the model is reliable, the gate does nothing; where the model is hopeless,
the gate cannot manufacture a capability the model lacks (it even burned 8× the
tokens flailing on the horizon world it could never pass).

## The synthesis: orchestration value is a narrow band, gated by the
## model-task difficulty regime

Combining Phases 1, 2, and 4 across model strength:

```
                 task the model is...
                 reliable on      borderline on      hopeless on
strong model     gate = COST      (none — strong     (none)
(v4-flash)       (v2.0 safe,       models saturate
                  v1 harmful)      single jobs)
weak model       gate = no-op     gate = HELPS       gate = waste
(llama-8b)                        (0.17->0.33)        (0->0, 8x cost)
```

Verification-loop orchestration adds value in exactly one cell: a **borderline**
model on a task it *almost* gets right. Everywhere else it is cost, no-op, or
harm. And decomposition (restart) is not a universal win either — it fixes
state drift but introduces seam-aggregation errors.

## What this forces for OrgX (capability / trust / performance)

1. **Orchestration must be regime-aware, not reflexive.** The loop should
   estimate whether the model is reliable / borderline / hopeless on a step and
   only spend verification budget in the borderline band. A flat "always verify"
   policy is, by this evidence, usually wrong.
2. **Gate v2.0 (no-regression) is mandatory and shipped here** — it is the
   minimum bar for the loop to be *safe* (never lowers a validated result). It
   is necessary but not sufficient for value.
3. **Decomposition needs seam discipline.** If OrgX splits work across
   boundaries/sub-agents, the carried state must be minimal and derived, not
   redundantly re-aggregated — the count failure was a redundant-state seam
   leak. (A better restart carries only the irreducible state and derives
   aggregates once at the end.)
4. **The product claim narrows and sharpens:** OrgX does not make a strong
   model better at a single job (it can't — the model saturates) and does not
   rescue a model that can't do the task. Its measurable execution-quality value
   is helping borderline capability over the line, plus the dimensions these
   single-shot worlds still can't see (multi-session state, governed
   coordination, trust). Honesty about the narrow band is what makes the claim
   credible.

## Honest limits

- Two base models, one provider, 5 worlds, k=6–8. Directional.
- The "borderline band" is shown on one world (migration-refusal); confirming it
  is the band (not noise) needs more borderline (model, task) pairs — the next
  pre-registered sweep: a ladder of models from 8B to frontier on a ladder of
  task difficulties, measuring where the gate's uplift peaks.
- Restart's seam bug is the agent's carry arithmetic, fixable with a
  minimal-state segment contract; the finding is that naive decomposition is not
  free, not that decomposition can't work.

## Artifacts
- `results/worlds-horizon-gatev2-20260614` (gate v2.0), `worlds-horizon-restart-20260614` (restart),
  `worlds-llama8b-20260614` (weak-model sweep). Engine arms `orgx2` + `restart` in
  `runner/lib/world-engine.mjs`; segment contract in `worlds/instrumented/order-pipeline-horizon.mjs`.
