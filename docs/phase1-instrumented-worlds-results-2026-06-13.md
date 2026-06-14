# Phase 1 results — instrumented worlds, deterministic uplift (2026-06-13)

The first run of the v2 architecture: environment-grounded Initiative Worlds,
scored by **deterministic validators (no LLM judge)**, with **agent↔grader
isolation**, an **honest tool-using baseline**, and **pass^k** reliability +
**token-normalized** economy — exactly the stack the 2025–26 research says to
build (`docs/v2-program-plan-research-grounded.md`). Base model both arms:
`deepseek/deepseek-v4-flash` via OpenRouter. The only variable is the loop
architecture (raw tool agent vs the OrgX verification loop), so any difference
is orchestration, not model.

## The instrument (what's new and why it's credible)

- **Worlds, not documents.** Each world is a sandboxed job: the agent reaches
  state ONLY through tools and never sees fixtures or validators (isolation
  audited — no ground truth in any prompt). It must use tools, chain dependent
  steps, and decide deliver/escalate under a budget.
- **Deterministic Oracle.** Outcomes are checked by code against hidden ground
  truth (arithmetic, state, exact sets) — no LLM judge, so none of the judge
  unreliability we documented earlier, and none of the 2026 judge-injection
  exploits.
- **pass^k, not pass@1.** Each arm runs k times; pass^k (all k succeed) is the
  reliability metric the field has converged on (τ-bench).
- **Token-normalized.** Every episode logs tokens/cost off the execution graph;
  quality is reported per-1k-tokens, because ~80% of agent performance variance
  is token spend.

## Result: the instrument caught the OrgX loop being net-harmful

Five worlds, two arms. **The OrgX verification loop delivered zero quality
uplift on four worlds and negative reliability uplift on the fifth, at
2.25–4× the token cost.**

| World (k) | Raw pass^k | OrgX pass^k | Raw tok | OrgX tok | Verdict |
| --- | --- | --- | --- | --- | --- |
| revenue-refund (5) | 1.0 | 1.0 | — | — | tie, OrgX 2.25× cost |
| incident-triage (5) | 1.0 | 1.0 | — | — | tie, OrgX 2.25× cost |
| migration-refusal (5) | 1.0 | 1.0 | — | — | tie, OrgX 2.25× cost |
| revenue-hard-6-trap (8) | 1.0 | 1.0 | 8.6k | 34.4k | tie, OrgX **4×** cost |
| order-pipeline-horizon (8) | **1.0** | **0** | 23.4k | 70.3k | **OrgX worse**, 3× cost |

On the three single-job worlds (k=5): both arms pass^k = 1.0 across every
dimension (outcome, method, coordination, judgment, trust), and the OrgX loop
cost 2.25× the tokens for quality-per-1k-token of 0.158 vs raw 0.259 — pure
cost. The 6-trap hard arithmetic world: raw nailed $186,000 all 8 times; the
verification re-derivation had nothing to recover and cost 4×.

**The long-horizon world is the headline.** A 12-step pipeline where shared
inventory depletes order-by-order, so order N depends on orders 1..N-1. The raw
tool agent tracked it perfectly — **8/8, exact backordered set [O7,O9,O10]
every time.** The OrgX loop scored **6/8: the verification gate induced two
failures on runs the raw model got right.** Both failures hit the step budget
(18 turns, `timeout`) mid-re-derivation and never re-submitted — the gate
converted a reliable success into an empty failure. pass^k: 1.0 → 0.

## Why this is the most important result in the program

Three named phenomena from the research, all confirmed with a clean instrument:

1. **"LLMs cannot self-correct reasoning yet" — confirmed at the loop level.**
   Intrinsic re-derivation on an already-correct answer degrades it. Our own
   cheap-mode over-edit finding was not a fluke; here it flipped a 100%-reliable
   task to 75%.
2. **2026 cheap reasoning models + tools already saturate single jobs.** Given a
   calculator and clear rules, v4-flash is reliable on exactly the tasks we
   built to be hard. There is no single-job execution-quality headroom for an
   orchestration layer to capture — only cost to add.
3. **Reflexive orchestration is a regression; it must be selective and
   budget-safe.** A gate that re-derives on every submit, unbounded, is strictly
   worse than no gate on tasks the model handles. This is a hard product
   directive, not a tuning note.

The benchmark did its job: it caught OrgX's own orchestration making a reliable
model worse, deterministically, isolated from gaming. A benchmark that can do
that to its owner is one a skeptic can believe.

## Product directives this forces (OrgX capability / trust / performance)

- **Gate v2.0 — selective + hard no-regression + budget-bounded.** Verification
  fires ONLY on a *detected* tool-grounded inconsistency, never reflexively;
  re-derivation may never exceed a step/token budget; and a re-derivation that
  does not produce a tool-confirmed correction must keep the original answer.
  The loop must be incapable of lowering a validated result.
- **Stop selling single-job execution quality.** The evidence says the base
  model already owns it. OrgX's value proposition must move to what these
  single-shot worlds cannot reach.
- **Where uplift must actually live (next instruments):** genuine multi-session
  state beyond one context window; cross-initiative coordination; trust/
  governance where receipts must be *true* and approvals enforced; and economy
  at portfolio scale. These are the non-saturating dimensions; single-job
  pass^k structurally cannot see them.

## Honest limits

- One cheap base model, one provider, 5 worlds, k=5–8. Directional, not a
  published leaderboard.
- The OrgX arm here is the verification-gate loop only (no decomposition +
  restart-at-boundary across separate contexts, which the reliability research
  rates the #1 intervention). It is plausible that a *restart* harness — not a
  *re-derive-in-place* gate — would help on the horizon world; the gate as built
  demonstrably does not. That is the next pre-registered experiment.
- pass^k=0 for OrgX on one world reflects 2/8 induced failures; with the v2.0
  budget guard those two would have kept the raw-correct answer. The fix is
  known and specified.

## Artifacts
- `results/worlds-v4flash-passk-20260613` (3 single-job worlds, k=5)
- `results/worlds-hard-passk-20260613` (6-trap arithmetic, k=8)
- `results/worlds-horizon-passk-20260613` (12-step pipeline, k=8)
- Engine `runner/lib/world-engine.mjs`; driver `runner/run-worlds.mjs`; worlds
  `worlds/instrumented/*.mjs`; deterministic validators embedded per world.
