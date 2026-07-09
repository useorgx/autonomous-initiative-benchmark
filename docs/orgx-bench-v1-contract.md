# OrgX-Bench V1.1 Contract

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

## OrgX Export Contract

OrgX benchmark runs should preserve the same manifest ids in execution metadata:

- `modelManifestId`
- `runManifestId`
- `lossRegistryId`

Publication gates may require those fields before an exported weekly benchmark
bundle can be marked publish-ready. Missing fields are allowed for internal
smoke tests, but not for SOTA-comparable headline claims.
