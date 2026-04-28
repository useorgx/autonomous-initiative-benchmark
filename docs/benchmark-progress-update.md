# First-pass autonomous initiative benchmark progress update

We now have complete local OpenAI benchmark runs that execute the public task catalog and write reproducible result bundles. The verified smoke run used `gpt-5-nano`, completed 12 of 12 tasks, passed the bundle validator, passed scorecard recomputation, and produced a complete set of summary, metadata, examples, task, and CSV files.

This is progress, not a final methodology claim.

The important finding is operational: the public catalog runner can now produce a complete low-cost benchmark bundle end to end. The smoke result is useful as a test of task execution, artifact generation, result packaging, and scorecard recomputation.

The current result should not be oversold as an externally rigorous benchmark yet. The model that generated the artifacts also self-reported the rubric scores. In the latest smoke run, that model was `gpt-5-nano`. The metadata correctly labels these scores as self-reported and intended for smoke testing.

We have now added the next methodology upgrade to the runner: independent multi-model judging can score an existing bundle or run immediately after generation. The public-grade path writes `judgments.json`, median judge scores, disagreement statistics, human-review flags, and actual judge token/cost usage. The already-published smoke bundle remains smoke-quality, but the runner now supports the higher bar.

## First judged candidate run

We ran the expanded 15-task catalog with 3 repeats per task and 3 independent judges per artifact:

- Generator: `gpt-5-nano`
- Judges: `gpt-5.4-nano` with low reasoning, `gpt-5.4-mini` with medium reasoning, and `gpt-5.4` with high reasoning
- Runs: 45 generated artifacts and 135 independent judge calls
- Result bundle: `results/local-openai-gpt-5-nano-full-public-judge-20260411`
- Normal validation: passed
- Scorecard recomputation: passed
- Strict validation: failed on 10 quality-bar misses

This is the right failure mode for a first public-methodology candidate. The benchmark completed, recorded judge usage, and exposed where outputs fell below the higher bar instead of burying that under a clean headline.

Actual usage and cost:

- Generation: 81,132 total tokens, 2.4623 cents
- Judging: 319,233 total tokens, including 60,716 reasoning tokens, 122.0173 cents
- Total: 400,365 total tokens, 124.4796 cents
- Judge failures: 0 of 135 calls
- `gpt-5.4` high-reasoning judge cost: 102.0777 cents across 45 calls

The strict misses were concentrated in design:

- `design-live-room-critique-r1`: `high-taste` criterion scored 0.75
- `design-modal-mobile-interaction-spec-r1`: completeness 0.82, quality score 80, and `engineering-ready` criterion scored 0.75
- `design-modal-mobile-interaction-spec-r2`: completeness 0.82 and quality score 84.17
- `design-modal-mobile-interaction-spec-r3`: quality score 84.44
- `design-live-room-responsive-system-r1`: completeness 0.84
- `design-live-room-responsive-system-r2`: quality score 81.39 and `artifact-and-blocker-flows` criterion scored 0.7

The disagreement flag was intentionally sensitive: 45 of 45 runs were marked for human review because at least one judge showed material criterion-level disagreement. That does not mean 45 runs failed; it means the judging panel is doing its job as a triage layer. The next methodology improvement is to calibrate disagreement thresholds with human adjudication and separate "needs human review" from "below quality bar" in public summaries.

## What worked

- Full catalog execution completed without task failures.
- The result bundle contains `summary.json`, `metadata.json`, `tasks.json`, `examples.json`, and `scorecard.csv`.
- Judged bundles also contain `judgments.json`.
- Scorecard recomputation agrees with the published headline metrics.
- The cheapest smoke-run model was able to produce complete artifacts across product, design, engineering, marketing, sales, operations, and cross-functional tasks.
- The judged results expose useful failure modes instead of hiding them. Design tasks are the first concrete quality-improvement target.

## What internet reviewers will challenge

- Self-grading: smoke runs still use self-reported scores and must stay clearly separated from judged runs.
- Judge calibration: independent judges are implemented, but disagreement thresholds need human calibration.
- Human baselines: baseline estimates need stronger provenance, larger samples, and clearer collection methodology.
- Task coverage: design coverage improved from 1 task to 4 tasks, but the design benchmark should keep expanding toward practical SOTA human workflows.
- Rubric strictness: the strict validator now catches below-bar judged outputs, but public claims still need human adjudication and baseline evidence.
- Artifact quality: some outputs are plausible but not yet at the standard a strong human operator would publish internally without revision.

## What we are changing next

### 1. Separate smoke tests from publishable benchmark runs

Smoke runs answer: can the runner complete the catalog cheaply and write a valid bundle?

Publishable runs must answer: would independent reviewers trust the scoring, task design, human baseline, and artifact quality?

The benchmark tooling should keep those bars separate. A complete bundle is necessary, but no longer sufficient.

### 2. Use independent multi-model judging

The scoring protocol now supports independent judge models that did not generate the artifact. The generation model remains cheap by default. The judging panel is separate.

Initial public judge panel:

- `gpt-5.4-nano` with low reasoning for low-cost rubric coverage.
- `gpt-5.4-mini` for a stronger middle judge.
- `gpt-5.4` with high reasoning for harder qualitative calls.
- Domain-specific deterministic validators where possible.

The public score should report median judge score, judge disagreement, and criterion-level variance. If judges disagree materially, the task should be flagged for human review rather than averaged into a clean headline number.

### 3. Raise the data quality bar

Future public bundles should include:

- generation model and judge model names
- token usage by task and by judge
- retry count and retry reasons
- criterion-level scores from every judge
- judge disagreement statistics
- minimum criterion thresholds
- task provenance and contamination-risk notes
- human baseline sample size, source type, and confidence
- artifact length and structured sections
- validation warnings and failures

### 4. Increase task realism

The catalog needs more work that looks like what strong human operators actually do. For design, that means fewer abstract critiques and more practical tasks:

- mobile artifact viewer remediation
- mobile modal interaction specifications
- responsive live-room system specification
- accessibility review with concrete component handoff
- design QA on loading, empty, error, and long-content states
- product hierarchy repairs grounded in existing design-system constraints

The first catalog expansion adds three practical design tasks so design is no longer represented by only one critique prompt.

### 5. Report uncertainty instead of only headline wins

The next public update should include:

- best, median, and worst task outcomes
- task-level failure analysis
- domain-level coverage gaps
- judge agreement rates
- confidence bands across repeated runs
- a list of methodology changes planned before any stronger public claim

## How we improve result quality

The next benchmark should optimize for useful artifacts, not just completed outputs.

Quality improvements:

- Require every task to include an implementation-ready artifact, not only prose.
- Add role-specific rubrics derived from senior human workflows.
- Add practical negative examples and known failure modes to each task.
- Penalize vague recommendations, missing owners, missing sequencing, missing states, and unsupported claims.
- Require tier-2 tasks to pass criterion-level minimums, not just average quality.
- Run at least three repeats per task and report variance.
- Use independent judges and flag disagreement.

The near-term goal is not to claim the benchmark is definitive. The near-term goal is to make the benchmark hard to dismiss because its limitations, raw artifacts, scoring protocol, and next improvements are visible.

## Current status

Current status: first judged methodology candidate run completed.

Next status target: calibrate judge disagreement with human review, improve the below-bar design tasks, strengthen human baselines, then rerun until the strict public-grade gate passes.
