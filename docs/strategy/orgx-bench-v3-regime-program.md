# OrgX-Bench v3 — the regime program (not the ≤25% benchmark)

**Date:** 2026-06-22 · supersedes the "200-step / all-must-pass / tune k until SOTA <25%" sketch.

## The reframe (why we changed course)

A skeptic could dismantle "tune difficulty until SOTA <25%" in one sentence: you
tuned the benchmark to a desired failure rate, built a context-limit test that
favors OrgX, assumed independent step failures, then amplified them with pass^k.
Fair. The Fugu result already pointed at the better question:

> **At what levels of difficulty, risk, and uncertainty does OrgX become
> net-positive — and which OrgX mechanism produces the value?**

Fugu Ultra added ~45% orchestration overhead and ~2× tokens for **zero** extra
reliable passes on saturated work. So OrgX's product challenge is not "orchestrate
harder" — it is **correctly deciding when to solve directly, when to orchestrate,
and when to stop/escalate.** The benchmark must measure *that*, causally.

## Decisions

1. **≤25% is a calibration criterion for the dev Gym, not the public hypothesis.**
   Calibrate the hard tier to 10–30% during development; once a holdout is frozen,
   accept whatever frontier models score. Otherwise we measure our tuning, not them.

2. **Two linked systems, never one giant confounded operation.**
   - **OrgX Development Gym** — adaptive, transparent, tunable. Discover failure
     modes, turn difficulty knobs, improve the product.
   - **OrgX Operations Benchmark** — frozen, private, versioned; external claims
     only. Sealed before target models touch it.

3. **A benchmark pyramid.** (a) atomic *mechanism diagnostics* (the existing small
   worlds, preserved), (b) *composed operations* (integration), (c) *sanitized
   real-workflow replays*. Compose up; never start at the top.

4. **Paired counterfactuals on the same seed.** Every adversarial instance ships a
   matched clean twin (clean vs stale CRM; valid vs revoked approval; consistent vs
   poisoned checkpoint). All arms run the **same seed + event schedule** → paired
   comparison attributes differences to the *system*, not scenario luck.

5. **Fair causal ablation — hold the base model fixed.** Arms: raw+minimal tools ·
   same model+strong generic scaffold · full OrgX · OrgX−state · OrgX−verify ·
   OrgX−authority · OrgX−recovery · OrgX−routing. Two protocols: **budget-matched**
   (same token/tool/latency envelope) and **production-natural** (Pareto frontier).
   **Every arm gets the same persistence API** — else "exceeds context window"
   tests whether the baseline was denied storage, not whether OrgX manages state.
   (Fugu vs Fugu-Ultra stays a *market* comparison, not a clean ablation — the
   route/models are undisclosed.)

6. **Difficulty measured meaningfully, not as step count.** Skilled-human time,
   consequential state transitions, dependency depth/branching, latent blockers,
   stale-able state, value-at-risk, recovery distance, authority complexity.
   Estimate the success curve **empirically** — do not assume 0.99^N independence
   (errors are correlated, some steps recover, some failures are deterministic).

7. **Stressor × mechanism falsification matrix.** The value is the *interaction*:

   | Stressor | Mechanism | Falsification test |
   |---|---|---|
   | session interruption / divergent state | checkpoint + reconcile | advantage shrinks when interruption removed |
   | stale / conflicting tool output | provenance + selective verify | advantage shrinks with oracle-clean tools |
   | approval revocation | authority gate | no action after authority invalid |
   | missing dependency | escalation + waiting | no fabricated completion |
   | concurrent agents | ownership/coordination ledger | fewer duplicate/conflicting actions |
   | tight budget/deadline | selective routing | better success–cost frontier, not just more inference |
   | partial failure after progress | recovery/rollback | preserve valid work, don't restart |

   If state-persistence helps *equally* on clean tasks, it isn't solving the
   intended problem. Use fractional-factorial designs, not every-stressor-at-once.

## Metrics (answer product questions)

Primary endpoint: **Qualified Mission Success** — the valuable outcome was
achieved **AND** no critical authority/integrity/safety violation. Then:
per-run success probability · critical-incident rate · state divergence ·
recovery rate · escalation precision/recall · provenance completeness · human
interventions · cost/latency · **orchestration rescue rate · harm rate ·
unnecessary-orchestration rate**. `pass^k` is *derived from the observed per-run
distribution*, never a knob to inflate difficulty. Report both p and implied
repeated-operation reliability.

## Statistics

8–10 rollouts is a **diagnostic, not inference**. Detecting 25%→40% at 80% power
≈ 150 trials/arm unpaired; same-seed pairing reduces it but requires a real power
analysis. Episodes are nested in seeds × operation families × configs → use
**hierarchical** uncertainty (resample across scenarios, configs, rollouts), not
rollout-only bootstrap (which understates uncertainty).

## Pre-registered hypotheses (replace "SOTA ≤25%")

- **H1 Frontier extension:** at fixed base model + tools, OrgX raises the
  human-equivalent difficulty at which qualified success hits 50% by ≥1.5×.
- **H2 Risk reduction:** at matched completion, OrgX cuts irreversible/critical
  violations ≥50%.
- **H3 Selectivity:** easy → ≤10% median cost added; borderline → positive
  risk-adjusted utility; blocked → escalates, never fabricates.
- **H4 Mechanism attribution:** removing the matching component eliminates most of
  the gain under its stressor.
- **H5 Generalization:** a substantial share of uplift persists on an unseen
  operation family + private generator templates.

Each can fail honestly, and each failure changes the roadmap.

## Development priority (implied by the Fugu result)

1. Instrumentation + counterfactual replay (without it you can't attribute gains).
2. Selective routing/gating (kill the Fugu-Ultra tax on easy tasks).
3. Event-sourced state + checkpoint + reconcile.
4. Provenance-aware selective verification.
5. Authority / approval / irreversible-action controls.
6. Recovery + rollback.
7. Waiting / escalation / human handoff (blocked is a legitimate system state).
8. Multi-agent delegation (only after shared-state + authority work).

## What ships in the first slice (this branch)

The cheapest pieces that prove the methodology, not the giant operation:
- `runner/lib/mission-metrics.mjs` — qualified success, rescue/harm/unnecessary-
  orchestration, regime classification, escalation precision/recall.
- `worlds/instrumented/silent-corruption-reconciliation.mjs` — a **paired
  counterfactual** stressor world (clean twin vs silent corruption on the same
  seed) that isolates the provenance/verify mechanism.
- `runner/run-regime.mjs` — runs arms × stress(on/off) on matched seeds and
  computes the **differential** (mechanism attribution + regime map).
- Verified deterministically, then one real Fugu clean-vs-stressed run to test
  whether the trust stressor actually desaturates the frontier.
