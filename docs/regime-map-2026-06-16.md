# Regime map — real-model runs, 2026-06-16

Two real-model runs of the upgraded harness across the model ladder, on the
instrumented worlds (k=2). This is the **regime map** the strategy predicts:
orchestration uplift is large where the raw model is weak and shrinks/inverts as
the model saturates — and **verify-on-the-edge (Gate v3.0) is the policy that is
robust across both ends**.

> Public / contamination-visible worlds (`public_validation` split) — a real-model
> *mechanism + regime* measurement, not a private-holdout headline. The runner's
> corpus guard flagged both runs accordingly.

## The two rungs

### Rung 1 — weak model (`meta-llama/llama-3.1-8b-instruct`): raw is weak → orchestration helps
Admission: **8 admitted / 0 saturated** (raw has headroom on every world).

| arm | pass@k (raw → arm) | pass^k (raw → arm) | quality/Ktoken |
|---|---|---|---|
| orgx2 (reflexive gate) | 0.125 → **0.25** (+0.125) | 0 → **0.125** | 0.110 → 0.101 |
| orgx3 (Gate v3.0) | 0.125 → **0.25** (+0.125) | 0 → **0.125** | 0.110 → **0.114** |

- Orchestration **doubled pass@k** (0.125 → 0.25) and took **pass^k from 0 → 0.125** —
  recovering tasks the raw 8B model fails outright.
- Concrete recoveries: `deploy-approval-trust` raw 0.5 → **orgx3 1.0** (the trust
  world — Gate v3.0 caught false-completions the raw model committed);
  `migration-contradiction-refusal` raw 0 → 0.5; `incident-triage-dependency`
  raw 0.5 → orgx2 1.0.
- **orgx3 ≥ orgx2 on quality-per-token** (0.114 vs 0.101): same pass uplift,
  cheaper — verify-on-the-edge spends the re-derivation pass only where it pays.

### Rung 2 — stronger model (`deepseek-v4-flash`): raw saturates → reflexive verify HURTS, v3.0 holds
Admission: **0 admitted / 8 saturated** (raw already at pass@k = 1.0).

| arm | pass@k (raw → arm) | mean tokens |
|---|---|---|
| orgx2 (reflexive gate) | 1.0 → **0.875** (−0.125) | 7.9k → 20.5k (2.6×) |
| orgx3 (Gate v3.0) | 1.0 → **1.0** (no regression) | 7.9k → 16.2k (2.0×) |

- Reflexive verification **regressed** pass@k and burned 2.6× tokens.
- Verify-on-the-edge **held** pass@k at 1.0 — no regression — at fewer tokens.

## The finding

| | raw weak (8B) | raw saturated (deepseek) |
|---|---|---|
| **orgx2** (reflexive) | helps (+0.125 pass@k) | **hurts** (−0.125 pass@k), 2.6× cost |
| **orgx3** (verify-on-the-edge) | helps (+0.125 pass@k), best quality/token | **holds** (no regression), 2.0× cost |

Reflexive verification is regime-dependent: it helps a weak model and harms a
saturated one. **Gate v3.0 (verify-on-the-edge) is robust across the ladder** —
it captures the uplift where raw is weak and avoids the harm where raw is strong.
This is exactly the design claim, now shown on real models.

The aggregate pass numbers are modest because these public worlds are not
calibrated holdouts; the **headline** is reserved for the private-holdout split
(hidden state, timed human baselines), where the same machinery runs unchanged.

## Reproduce

```
KEY=...  # OpenRouter
node runner/run-worlds.mjs --provider openrouter --model meta-llama/llama-3.1-8b-instruct --k 2 --arms raw,orgx2,orgx3 --out worlds-8b-2026-06-16
node runner/run-worlds.mjs --provider openrouter --model deepseek/deepseek-v4-flash      --k 2 --arms raw,orgx2,orgx3,restart --out worlds-real-2026-06-16
```

Artifacts: `results/worlds-8b-2026-06-16/report.json`,
`results/worlds-real-2026-06-16/report.json`.
