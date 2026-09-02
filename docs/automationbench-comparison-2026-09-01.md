# AutomationBench × Autonomous Initiative Benchmark

Status: source audit + locally tested public-export comparison layer. No live OrgX AutomationBench evaluation was executed for this change. No official score, new model result, production-runtime parity, or SOTA claim is established.

## Recommendation

Use AutomationBench unchanged as an external business-workflow test. Keep Initiative Worlds as a separate test of persistent organizational execution. Do not blend the scores or fork upstream tasks until OrgX looks better. Make the current benchmark executable and independently reproducible before adding more release-contract machinery.

## Source pins

Reviewed September 1, 2026:

- OrgX public benchmark: `2fb159f62b0a79bb9ba15fea793d31a7b939f83c`.
- AutomationBench: `4a8e1061254004d9dac807054eed33fad7d1ff14`.
- Anthropic announcement: https://www.anthropic.com/claude-fable-and-mythos-5-1
- Zapier leaderboard: https://zapier.com/benchmarks (observed version 1.0.6; this is not automatically the public repository's package version).
- AutomationBench README: https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/README.md
- Native export contract: https://github.com/zapier/AutomationBench/blob/4a8e1061254004d9dac807054eed33fad7d1ff14/automationbench/export.py
- OrgX architecture: https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/docs/initiative-worlds.md
- Current evidence boundary: https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/README.md
- Historical run: https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/results/worlds-real-2026-06-16/report.json
- Engine audit: https://github.com/useorgx/autonomous-initiative-benchmark/blob/2fb159f62b0a79bb9ba15fea793d31a7b939f83c/runner/lib/world-engine.mjs

## What the announcement actually establishes

Anthropic reports 31.4% for Fable 5.1 on AutomationBench. Zapier labels that entry Fable 5.1 with Opus 5 fallback: the fallback handled 260 of 657 tasks, and displayed cost excludes fallback tokens. Attribute the result to that declared system configuration, not to an isolated model. This is a reproducibility requirement, not a criticism of using fallbacks.

The public set contains 600 scored tasks across six domains and 200 separate simple checks. Official leaderboard tasks are private and deliberately harder. A public OrgX score cannot be compared numerically to 31.4% to establish superiority. Anthropic's comparison table and Zapier's live leaderboard also show different GPT-5.6 Sol figures; do not splice those rows into one purported controlled comparison.

## Comparison and decision

| Dimension | AutomationBench | OrgX AIB today | Decision |
| --- | --- | --- | --- |
| Core work | Cross-app workflows in simulated business systems | Artifact catalog plus deterministic instrumented Initiative Worlds | External workflow score and organizational-world score remain distinct |
| Completion | Strict all-scored-assertions pass; partial reward is diagnostic | World-success gates plus dimension scores; legacy artifact metrics persist | Put strict outcome success first; never average away a forbidden action |
| Tool discovery | API search/execute; app-schema discovery is part of the task | Instrumented engine provides world-specific tool schemas | Add a discovery condition, but preserve stock upstream mode for comparisons |
| Task coverage | Broad public domain set and separate private leaderboard | Public methodology and results; headline holdout remains unpopulated per current README | Executable coverage and outside reruns are more urgent than more schemas |
| Trust | Positive and negative final-state assertions | Explicit approval, evidence, provenance and transition contracts | Retain those strengths; add transient forbidden-action/event checks in separate AIB tracks |
| Runtime identity | Pin the runner, toolset, model, effort and fallback recipe | Public engine's orgx/orgx2/orgx3 arms are experimental control policies | Do not label a prompt wrapper as the complete production OrgX stack |
| Reproducibility | Public local environment and result visualizer | Public validators; product benchmark launcher opens the hosted product | Provide a clean local paired adapter with exact source/runtime pins |
| Saturation | Versions and harder private tasks | Existing parametric-world, canary and saturation policies | Implement the existing policies; retain frozen anchor sets and make harder sets new versions |

## Internal evidence worth publishing carefully

Historical public instrumented run, June 16, 2026: DeepSeek V4 Flash, eight worlds, two repetitions per arm. These are experimental harness-policy results, not an AutomationBench run or a production-product comparison.

| Arm | Worlds passing both repetitions | Mean tokens per episode |
| --- | ---: | ---: |
| raw | 8/8 | 7,915 |
| orgx2, reflexive verification | 7/8 | 20,484 |
| orgx3, adaptive verification | 8/8 | 16,195 |

Adaptive verification matched observed reliability while using approximately 2.05× raw tokens; reflexive verification used 2.59× and lost a world. This is evidence to investigate verification allocation, not proof that adaptive verification improves efficiency. Two repetitions and public tasks do not establish population-level reliability. Retain the original labels and publish uncertainty; do not compare all-repetitions world success to AutomationBench's per-task pass rate.

Additional source-code concerns, not fixed by this change:

1. `world-engine.mjs` calls the retained draft "validated" and claims a no-regression guarantee, but invokes the world validator after choosing the terminal result. Draft fallback prevents one empty-timeout failure mode; it cannot generally certify that verification never changes a correct answer to an incorrect one. Prove only a bounded invariant with independent checkpoints, not by exposing the hidden grader to the agent.
2. `runRestartEpisode` constructs queried/compute flags as true. These flags must come from observed actions rather than a method label. Test absent/failed segments and dishonest method claims.
3. The historical report's admission diagnostic calls a world saturated when raw pass@k reaches one. A world solved at least once can still be unreliable. Do not use that rule to retire worlds; use the stronger published multi-system, repeated-success, confidence and canary criteria.
4. `run-worlds.mjs` records zero tokens/cost in its exception path. Preserve accrued usage and classify unknown cost as unknown; otherwise interrupted experiments can appear artificially cheap.

## Changes implemented here

`runner/lib/automationbench-report.mjs` and `runner/compare-automationbench.mjs` consume native upstream JSON exports under a separately pinned public comparison manifest. Tests are picked up by the repository's existing `runner/lib/*.test.mjs` test glob.

Implemented checks: cohort and per-task contract pins; schema/step/toolset/model/effort equality; explicit assertion exclusions; Boolean assertion results; strict pass recomputation from recorded assertion outcomes; final-state presence; duplicate and unexpected task rejection; full planned task × repetition × arm denominator; missing/unscored run accounting; fallback declaration; separate system comparisons versus same-model harness ablations; explicit all-in cost receipts; byte hashes for export and optional cost-receipt files.

Unknown cost remains null. A missing run is not dropped. A difference between incomplete-arm success lower bounds is not presented as a measured treatment effect. Partial credit and any-success/all-repetitions metrics have distinct labels. Every report is marked public, non-official and non-headline.

This is an export consistency checker, NOT an independent regrade or provenance verifier. It trusts the upstream evaluator's recorded assertion results, checks their internal consistency, and binds exported bytes. It does not prove where a file came from, that a preregistration predates execution, or that a cost receipt contains every call. Independent replay, a sealed run manifest, and ledger review remain required. Confidence intervals are intentionally not invented; the output is descriptive until the preregistered task-cluster analysis is implemented.

### Run the implemented checks

```bash
node --test runner/lib/automationbench-report.test.mjs
node runner/compare-automationbench.mjs path/to/manifest.json path/to/report.json
```

The manifest uses `schema: orgx.automationbench-comparison/v1`, a 40-character `upstream_commit`, `benchmark_version`, `split: public`, `toolset`, `max_steps`, `repetitions`, `comparison_kind`, `baseline_arm`, and:

- `tasks`: `{name, domain, contract_schema, contract_sha256, assertions_total, excluded_indices?}`. Domain must be one of the six scored domains. `assertions_total` here counts all assertion rows, including explicitly excluded ones.
- `arms`: `{id, model, reasoning_effort, runtime_commit, fallback_models}`. Use `not_applicable` for absent effort and `[]` for no fallback.
- `runs`: `{arm, repetition, file, sha256, costs_file?, costs_sha256?}`. Paths resolve relative to the manifest. A missing export can be omitted; its planned episodes remain missing in the report. Never omit a task from the preregistered cohort because it failed.

Optional cost files map task names to `{complete, scope: all_model_calls_and_orchestration, usage_ledger_sha256, components}`. Components have `{kind, usd}` and, for model costs, `{model, calls}`. Kinds are `primary`, `fallback`, `verification`, `retry`, `orchestration`. Components must be disjoint: count every call once, including failed calls. The ledger digest is a reference for audit, not independently verified by this importer. The native `cost` field alone is insufficient to establish an all-in comparison.

The test fixture is a complete synthetic example of this contract; its scores must never be quoted as model performance.

## Next execution tranche: one adapter, not another benchmark rewrite

Build a sandbox-only `AutomationBenchEnvironmentAdapter` in the actual OrgX runtime. It exposes the unchanged upstream search/execute interfaces and routes actions to the same simulator instance as the stock runner. Each attempt gets a new state, empty memory and disjoint credentials. The adapter must not expose the assertion list, expected answers, evaluator files or intermediate rewards to any agent or verifier. Real Gmail/Stripe/CRM tools stay unavailable.

Before model calls, prove identical tool schemas, identical initial-state/task hashes, identical action replay, identical final-state assertion outputs, negative-assertion preservation, and evaluator isolation. Inspect full native exports on successful and interrupted runs. Refusal recovery must not be disguised as a same-model run; never weaken safeguards to improve a score.

Preregister three arms on the same model: stock upstream runner, strong generic verification control, actual OrgX runtime. Keep model, effort, tools and task distribution identical. Count all internal calls, parallel agents, retries and verifiers in episode limits; a wrapper must not turn 50 visible steps into unbounded hidden compute. Separately run routed/fallback systems with explicit model combinations.

Use a fixed 60-task stratified development pilot, ten tasks per domain, to debug integration; do not promote it to a 600-task result. Freeze the policy afterward, then evaluate all 600 public tasks with three repetitions and randomized/interleaved arm order. Because the tasks are public, this is an external public-set result, not a sealed-holdout claim. Obtain an official private evaluation from Zapier for leaderboard comparability.

Primary metric: strict per-task success. Report per-domain rates, wins/losses/ties, all-in cost per success, latency, refusals, loss registry and model/fallback mix. Use task-cluster paired confidence intervals (stratified by domain); repetitions are not independent new tasks. Publish matched-budget curves and actual spend alongside fixed-step results. Do not stop after a favorable pilot or selectively retry failures.

## Capability roadmap

Maintain a small frozen anchor suite and a separately versioned frontier suite. Increase causal depth, delayed consequences, conflicting policies, partial observability, concurrent changes, context resets and authority scope—not just prompt length. Maintain acceptance tests for alternative valid solutions, no-op shortcuts, transient violations and compensated-but-unauthorized writes. Business utility is additional evidence, not a replacement for safety/authority constraints.

For each episode, preserve the work graph, model/runtime pins, visible observations, claims, state diffs, independent judgments and costs. Build training data from independently verified trajectories, failure/correction pairs and allocation decisions on a dedicated training split. Split by organization, scenario family and time; never train on the private holdout or use benchmark-specific answers as runtime memory.

The first learned policy should allocate verification and escalation, not blindly imitate every successful long trace. Prefer the smallest accepted trajectory that survives independent checking. Train confidence/calibration against observed correctness, not model self-confidence alone. Evaluate whether each new model reduces necessary scaffolding at equal outcome/authority constraints. Fine-tuning becomes justified only after the error taxonomy is stable, the non-training evaluation is credible, and the baseline shows a repeatable gap.

## Publication gate

The accompanying blog is a draft about historical observations and a forward test plan. It contains no new AutomationBench performance claim. A results follow-up requires pinned runs, reconciled losses and costs, a real production adapter, matched controls, reproducible exports and independent review. New results must be merged into the article only after those gates pass.
