# OrgX-Bench V1.2 Contract

This contract is the minimum bar for a benchmark result that can be compared
against frontier models and future model generations without collapsing into a
demo claim.

## Result Classes

`public_validation` and `initiative_worlds_preview` runs are useful for smoke
tests, reproducibility, and methodology inspection. They are contamination
visible, so they are never headline eligible.

`private_holdout` runs are the only headline-eligible class. A headline run must
use hidden state, isolated validators, preregistered loss accounting, model
pinning, and timed human baselines.

## Required Public Artifacts

- `evaluation-manifest`: preregistered hypothesis, arms, split, metrics, model
  manifest, loss policy, loss registry, and headline eligibility.
- `model-manifest`: provider, exact model id, access date, capability tags, and
  pricing provenance where available.
- `benchmark-run-manifest`: executed split, k, arms, manifest ids, seed
  commitments, evaluator id, and artifact hashes.
- `private-validator-bundle`: hidden validators and evaluator isolation
  contract. The bundle may stay sealed, but its schema and hash must be public.
- `public-benchmark-bundle`: sanitized summary, scorecard, examples, task
  assumptions, and observed mode metadata.
- `stranger-reproduction-receipt`: outside-reviewer receipt binding public
  input hashes, reproduction command, result hash, deviations, and
  `matched_to_digit` status for the release.
- `world-quality-audit`: per-generator evidence that multiple valid solutions
  pass, plausible shortcuts fail, and the task survives counterfactual,
  metamorphic, and delayed-consequence tests.
- `contamination-audit`: per-world leakage probes, canary coverage, access-log
  evidence, provider-retention controls, and burn status.
- `statistical-precision-report`: paired-seed cell counts, confidence intervals,
  and proof that each headline cell met the preregistered precision target.
- `benchmark-correction-ledger`: public defect reports, severity, resolution,
  disclosure, and score-recomputation status.

## Headline Gate

A run may set `headlineEligible:true` only when all of the following are true:

- `tasks` is `private_holdout`.
- `k >= 8`.
- Every arm is named and pinned to `modelManifest.models`.
- `lossPolicy.publishAllAttempts`,
  `lossPolicy.singleAgentWinsAreLosses`, and
  `lossPolicy.invalidRunsCountAsLosses` are true.
- `lossRegistry` includes at least `single_agent_quality_win`,
  `invalid_output`, `timeout`, `cost_loss`, and `unmeasured`.
- `humanBaselinePolicy.minimumDistinctHumans >= 3`.
- `humanBaselinePolicy.timedRuns`, `blindReview`, and `publishAggregate` are
  true.
- The published bundle includes a protocol-v2 `human_baseline_summary` whose
  per-world rows cover every headline world with at least three distinct
  protocol-valid humans.
- The published bundle includes at least one valid third-party replication row
  with `agreement_within_ci:true`.
- The release manifest points at a valid `stranger_reproduction_v1` receipt
  from an outside reviewer who recomputed the public release to the digit.
- `metrics` includes `pass_at_k`, `pass_pow_k`, `horizon_50`, and
  `horizon_80`.
- `generatorPolicy` requires at least 20 parametric generators, difficulty
  knobs, deterministic state hashes, and monotonicity evidence.
- Every headline generator has a complete world-quality audit with at least
  five independent reviewers, at least two valid and three invalid solutions,
  false-accept and false-reject rates no greater than 2%, no severe defects,
  and passing counterfactual-twin, metamorphic, and delayed-consequence suites.
- Every headline world has a complete contamination audit with just-in-time
  seeds, a sealed vault, a signed access log, provider-retention controls, and
  no unburned strong leak signal.
- Every headline cell meets a preregistered confidence-interval width target;
  `n >= 8` is a floor, not sufficient evidence by itself. Ranks are suppressed
  when intervals materially overlap.
- The active correction ledger contains no open severe or critical defect
  affecting the release. Resolved severe defects require score recomputation.

`npm run validate:bundle:strict -- results/<week>` enforces the machine-checkable
headline subset of this gate whenever `metadata.publicationLabel` is
`headline`.

## Parametric World Contract

Headline holdout worlds are generated instances, not fixed tasks. Each
headline-capable world must publish generator metadata with:

- `type:parametric`.
- Named difficulty knobs with ranges, defaults, and monotonic direction.
- A seed commitment before execution.
- A run-manifest `difficultySchedule` listing the exact levels, knobs, and
  seeds executed.
- Deterministic instance identity: same world id, seed, and knobs must produce
  the same state hash.
- Reliability horizons at 50% and 80% pass rate when difficulty curves are
  reported.

Difficulty is not assumed from metadata alone. A published difficulty knob must
show non-increasing pass rate as difficulty increases, or the knob is marked
unproven and cannot support a horizon headline.

## Validator Vocabulary

Private holdout worlds should include deterministic and acceptance validators
that check the actual work product, not only transcript shape:

- artifact parse, render, execute, and schema validation
- citation resolution and claim entailment
- calculation replay, simulation outcome, downstream task completion
- blind acceptance review
- perturbation survival and delayed-state checks
- approval order, receipt replay, budget adherence, and forbidden actions

## Benchmark-Error Budget

The benchmark must measure its own errors. Every headline generator is tested
against a solution zoo containing independently authored valid approaches,
human solutions, frontier-model solutions, partial solutions, plausible
shortcuts, and policy-violating submissions. The validator must accept the
valid equivalence class and reject the invalid class.

A headline release has these maximum error budgets:

- false acceptance rate: 2%
- false rejection rate: 2%
- ambiguity rate: 5%
- severe task or grader defects: 0
- counterfactual, metamorphic, and delayed-consequence pass rate: at least 95%
- reviewer agreement: at least 0.67

The task-issue taxonomy includes overly strict tests, underspecified prompts,
low-coverage tests, and misleading prompts. A world with a severe issue is
blocked until repaired and re-audited.

## Contamination And Burn Policy

Private does not mean uncontaminated. Each world/model release pair receives
adaptive leakage probes and planted canaries before scoring. Strong evidence
that a model can recover hidden task-specific information burns that world for
the affected release. Burned worlds remain in the correction and access ledgers
but cannot contribute to headline metrics.

The release records all access events and whether provider data-retention
controls were active. Seeds are committed before execution and materialized as
late as practical. Public/private and counterfactual-twin gaps are reported as
diagnostics, not silently interpreted as capability.

## Corrections And Appeals

Defect reports are public and append-only. Severe and critical defects block a
release while open. When resolved, affected bundles are recomputed or clearly
withdrawn; historical files are not silently replaced. Task authors may not be
the sole approver of their own graders.

## OrgX Export Contract

OrgX benchmark runs should preserve the same manifest ids in execution metadata:

- `modelManifestId`
- `runManifestId`
- `lossRegistryId`

Publication gates may require those fields before an exported weekly benchmark
bundle can be marked publish-ready. Missing fields are allowed for internal
smoke tests, but not for SOTA-comparable headline claims.
