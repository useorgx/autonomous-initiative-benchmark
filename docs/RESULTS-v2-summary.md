# OrgX-Bench v2 — consolidated results & status (through 2026-06-14)

Single source of truth for the v2 upgrade: what was built, what was run, what we
found, and the honest phase status. Detailed docs are linked per section.

## Phase status at a glance

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Cross-provider judging, pairwise, strict graders, hard tier, uplift harness | **Implemented + run** |
| 1 | Instrumented worlds: deterministic validators, isolation, pass^k, token-normalized | **Implemented + run** |
| 2 | Gate v2.0 (no-regression), restart-at-boundary | **Implemented + run** |
| 3 | ARC-style admission filter, holdout policy | **Implemented** (filter live; holdout split wired, not yet populated) |
| 4 | Multi-model sweep (weak/cheap) | **Implemented + run** (2 models; full ladder pending) |
| 5 | Continuous co-evolution (retire saturated worlds) | **Designed**, runs as worlds accrue |
| A–D | Three-surface program (OrgX product trust ledger, multi-session worlds, multi-client UX) | **Designed + sequenced**, NOT built — multi-week, much in the OrgX product repo |

Honesty note: Phases A–D ([strategy-execution-plan-three-surfaces.md](strategy-execution-plan-three-surfaces.md))
are a forward program, not completed work. They are not claimed as run.

## What we built (the v2 instrument)

- **Multi-provider harness** — provider registry (OpenAI Responses + OpenRouter/
  DeepSeek chat) for generation *and* judging; cross-provider judge presets;
  pairwise preference judging with dual-ordering position-bias control; strict
  graders with mean aggregation; hidden-criteria hard tier; live-run import.
- **Environment-grounded Initiative Worlds** — tool-using agent loop, WEG
  recorder, **deterministic validators (no LLM judge)**, **agent↔grader
  isolation** (audited), **pass^k** reliability, **token-normalized** economy,
  ARC-style admission. Arms: `raw` (honest tool baseline), `orgx` (gate v1),
  `orgx2` (gate v2.0 no-regression), `restart` (decomposition at boundary).
- Reproduce: `npm run run:worlds -- --k 8 --arms raw,orgx2,restart`,
  `npm run judge:bundle -- <bundle> --judge-preset deepseek`,
  `npm run compare:bundles`.

## Headline results (all deterministic or cross-provider judged; published as-is)

### Catalog era (artifact tasks)
- Cross-provider verification: an independent **DeepSeek** panel preferred the
  OrgX agent-surface artifacts **12/12** over a gpt-5-nano baseline (71/72
  votes) — but absolute rubric scores **saturated** (~100 both), which is what
  motivated the move off artifact scoring. [blog](blog/2026-06-12-deepseek-judged-our-benchmark.md)
- DeepSeek as generator: full catalog 100% autonomous; OrgX agent surface ≫
  DeepSeek v3.2 > gpt-5-nano pairwise — the margin is the orchestration layer,
  not the model.

### Instrumented-worlds era (the real measurement)
- **Single jobs saturate.** A cheap reasoning model (v4-flash) + tools passes
  pass^k = 1.0 on 4/5 worlds, including a 6-trap arithmetic world ($186k, 8/8).
  The OrgX verify loop adds **+0 quality at 2.25–4× tokens**.
- **Reflexive verification is net-harmful.** On a 12-step stateful pipeline the
  raw arm scored 8/8; gate v1 **induced 2/8 failures** (runaway re-derivation →
  budget timeout). pass^k 1.0 → 0. [phase 1 results](phase1-instrumented-worlds-results-2026-06-13.md)
- **Gate v2.0 removes the harm.** The no-regression draft-fallback restored
  pass^k 0 → 1.0 — the loop can no longer lower a validated answer — but adds no
  value at 2.4× cost on saturated tasks.
- **Decomposition is not free.** Restart-at-boundary aced the hard sequential
  reasoning (exact revenue + backorder set 8/8) but introduced seam-aggregation
  drift on the running count → 1/8. One failure mode traded for another.
- **First positive uplift = the borderline band.** On a weak 8B model, gate
  v2.0 **doubled** the pass rate (0.17 → 0.33) on the one task it was borderline
  on; no-op where the model is reliable, wasted where it's hopeless. [phases 2–4](phase2-4-orchestration-regimes-2026-06-14.md)

### The synthesis
```
                reliable task    borderline task    hopeless task
strong model    gate = COST      —                  —
weak model      gate = no-op     gate = HELPS       gate = waste
```
Orchestration helps in exactly one square: a model that's *almost* good enough on
a task it *almost* gets. Everywhere else it is cost, no-op, or harm.

## Updates to OrgX capability / trust / performance

- **Capability:** stop selling single-job execution quality (the base model owns
  it). The mandated next build is a **regime-aware loop (Gate v3.0)** that
  verifies only in the borderline band — the only square where the gate pays.
- **Trust:** Gate v2.0's hard no-regression guard is the minimum bar — the loop
  must be *incapable* of lowering a validated result. Shipped in the harness;
  the product equivalent (claimed-state == validator-state, receipts linked to
  checkable proof, enforced approvals) is the non-saturating moat and the
  headline of Phase B.
- **Performance:** every number is token-normalized. The honest accounting shows
  the loop's 2.25–4× token cost, so "quality-per-dollar" — not raw quality — is
  the metric that must improve. Economy/routing + code-as-action over the MCP
  surface are the levers.

## Known open items (committed but not closed)

- The v2.0 no-regression guard passed by variance in its run (the fallback never
  fired); a **forced-failure test** is needed to prove the guard deterministically.
- The restart **seam bug** (redundant carried state) is fixable with a
  minimal-state segment contract.
- Today's world bundles carry pre-edit report format (episodes.json is the source
  of truth; docs cite correct numbers) — regenerate for consistency.
- Holdout split registry exists but is unpopulated; the borderline band is shown
  on one world and needs the model-ladder × difficulty-ladder sweep to confirm.

## Artifacts
Docs: measurement-philosophy-v2, v2-program-plan-research-grounded, gap-analysis,
uplift pre-registration + results, phase1 + phase2-4 results, three-surface plan.
Bundles: `results/worlds-*-2026061{3,4}`, `results/*-deepseek-*`, plus the catalog
and agent-surface bundles. Blogs: the two finalized posts in `docs/blog/`.
