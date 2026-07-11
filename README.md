# OrgX Autonomous Initiative Benchmark

Most agent benchmarks ask whether a model can produce a convincing answer. This
benchmark asks whether an AI system can complete multi-domain organizational
work, change the right state, respect approval boundaries, and leave enough
evidence for another person to verify what happened.

This repository is the public, inspectable proof surface for that work. It
contains the task catalog, Initiative Worlds contracts, methodology, validators,
and publication bundles used to evaluate OrgX without turning internal product
telemetry into marketing claims.

## Reviewer path

1. Read the [Initiative Worlds architecture](docs/initiative-worlds.md).
2. Inspect the public task and world definitions in [`catalog/`](catalog/) and
   [`worlds/`](worlds/).
3. Review the publication boundary in **Published result bundles** below.
4. Run `npm run validate:worlds:preview` to validate the public preview worlds.

> **Current evidence boundary:** the public preview proves the methodology and
> validation machinery. It does not yet support a frontier-model or
> customer-performance headline; the private holdout, timed human baselines,
> and outside reproduction gates remain intentionally fail-closed.

## Initiative Worlds preview

**OrgX-Bench v0.2: Initiative Worlds** is the current trust-hardening preview.

The current task catalog remains the public validation set. It is useful for
runner smoke tests, methodology transparency, and contamination-visible examples.
It is not the headline frontier suite.

Initiative Worlds are seeded OrgX workspaces with visible state, hidden evaluator
truth, deterministic validators, approval boundaries, artifact provenance, and
timed human baselines. The benchmark goal shifts from "can an AI write a good
artifact?" to "can an AI system complete multi-domain organizational work while
preserving trust?"

Start here:

- Architecture: [docs/initiative-worlds.md](docs/initiative-worlds.md)
- Methodology amendment: [docs/methodology-amendment-initiative-worlds.md](docs/methodology-amendment-initiative-worlds.md)
- SOTA comparability contract: [docs/orgx-bench-v1-contract.md](docs/orgx-bench-v1-contract.md)
- Corpus split registry: [worlds/corpus-splits.json](worlds/corpus-splits.json)
- Preview worlds: [worlds/README.md](worlds/README.md)

Validate the runnable preview worlds:

```bash
npm run validate:worlds:preview
```

The easiest way to evaluate OrgX is to **run the benchmark inside OrgX itself**:

1. Sign up for OrgX
2. Open Benchmark Lab
3. Run the starter or full benchmark
4. Compare your run to the public benchmark corpus published here

If you cloned this repo locally, the fastest repo-native launcher is:

```bash
node runner/orgx-benchmark.mjs
```

## What actually happens when you run it in OrgX

OrgX does not spin up a benchmark-only execution path for the real product run.

- Each benchmark task becomes a normal OrgX initiative with benchmark metadata attached.
- Single-domain tasks launch domain-specific initiatives. Cross-functional tasks launch multi-domain initiatives.
- The same execution contract is reused across Agent, API, CLI, and E2B surfaces so completion, artifact, blocker, and approval rules do not drift by runtime.
- Benchmark workspaces default to the highest autonomy level the platform policy allows.
- If OrgX can self-heal a non-human issue through normal auto-continue and dispatch behavior, it should.
- If a human approval or decision is required, the run is recorded as non-autonomous instead of being counted as a clean autonomous completion.

## Fastest path

- Run this benchmark in OrgX: https://useorgx.com/benchmark
- Sign up directly: https://useorgx.com/sign-up?redirect_url=/benchmark/runs
- Open Benchmark Lab: https://useorgx.com/benchmark/runs
- Launch Benchmark Lab from this repo: `node runner/orgx-benchmark.mjs start starter`
- Read the methodology: https://useorgx.com/blog/orgx-autonomous-initiative-benchmark-methodology
- Browse the public benchmark hub: https://useorgx.com/benchmarks

It contains:

- versioned public benchmark task definitions in `catalog/`
- Initiative Worlds schemas, split registry, preview worlds, and validator runner in `worlds/`, `schemas/`, and `runner/`
- preregistration, run-manifest, model-manifest, private-validator, and public-bundle contracts in `schemas/`
- the benchmark methodology in `methodology/`
- a small reproducibility layer in `runner/`
- public weekly result bundles in `results/<week>/`
- a simple schema for the published bundle format in `schemas/`
- a self-serve setup guide in `RUN_IN_ORGX.md`

## Published result bundles

The repository contains dated result bundles under `results/<week>/`, indexed in
[`results/index.json`](results/index.json) (generated from validated manifests by
`node runner/reissue-bundles.mjs`, not hand-maintained).

**None of the current bundles are headline-eligible.** They are mechanism /
regime measurements on public, contamination-visible worlds and catalog tasks —
useful for inspecting methodology, attribution, and cost telemetry, but not
private-holdout headlines. Headline numbers require the private holdout (hidden
state, isolated validators, at least 3 timed human baselines, model manifest
pinning, a loss registry, and k >= 8), which is not yet populated. Bundles whose resource telemetry is incomplete are marked
`costComparable: false` / `invalidForCost: true` and must not be used for
cross-bundle cost comparison.

## SOTA comparability contract

Any new preregistration manifest must pass:

```bash
npm run validate:manifest -- results/evaluation-manifest.example.json
```

Any change to world-visible prompts or shared runner prompt text must also pass:

```bash
npm run validate:prompts
```

Any change that affects score dimensions must also pass:

```bash
npm run validate:dimensions
```

The quarterly future-model config drill is:

```bash
npm run drill:future-model
```

The SOTA readiness audit maps the full plan to executable evidence:

```bash
npm run audit:sota
```

It is expected to fail until the private holdout, human baselines, OrgX pinning
lane, sealed submission API, third-party replication, outside reproduction, and
frontier headline bundles exist. For progress reporting without a nonzero exit
code:

```bash
node runner/audit-sota-readiness.mjs --allow-incomplete
```

The release-candidate manifest binds preregistration, frontier sweep design,
human baselines, strict headline bundle evidence, external replication, and
outside reproduction into one release gate:

```bash
npm run validate:release
npm run validate:world-quality -- --file results/<world-quality-audit>.json --strict
npm run validate:contamination -- --file results/<contamination-audit>.json --strict
npm run validate:precision -- --file results/<statistical-precision-report>.json --strict
npm run validate:corrections -- --file results/benchmark-correction-ledger.json --release-id <release-id> --strict
npm run plan:release-sweep
npm run validate:release-ledger -- --init-out results/<release-execution-ledger>.json
npm run record:release-ledger-job -- --ledger results/<release-execution-ledger>.json --manifest results/<release-manifest>.json --job-id <job-id> --status scored --out results/<release-execution-ledger>.json
npm run validate:replication -- --file results/<third-party-replication-evidence>.json
npm run validate:reproduction -- --receipt results/<stranger-reproduction-receipt>.json
npm run validate:release -- --strict --manifest results/<release-manifest>.json
```

Plan the required timed-human sessions before recruiting:

```bash
npm run validate:outreach-plan -- --strict --plan results/sota-outreach-plan.example.json
npm run plan:human-baselines
npm run validate:human-expert-roster -- --strict --roster results/<human-expert-roster>.json
npm run export:human-baseline-packets -- --plan results/<human-baseline-plan>.json --out results/<human-baseline-session-packets>.json
npm run validate:human-baselines -- --allow-incomplete
```

See [docs/sota-release-runbook.md](docs/sota-release-runbook.md). The current
example manifest is a draft preflight and is expected to fail strict mode until
the execution ledger is terminal, human-baseline sessions are assigned and
recorded, real human baselines exist, a strict headline bundle exists, external
replication is attached, and outside reproduction is recorded.

The validator now fails closed on weak benchmark claims:

- every arm must be named and pinned to `modelManifest.models`
- every run must preregister `lossPolicy` and `lossRegistry`
- world and shared prompts must avoid method/control signposts such as
  "verify every number", "re-derive", "cross-check", or source-authority hints
- score dimensions must pass a correlation audit so completion, safety, trust,
  judgment, evidence, coordination, and efficiency are not silently collapsed
  into one proxy metric
- future frontier models must pass the config-only drill as model-manifest rows,
  without adding model-specific runner branches
- headline claims are only valid on `private_holdout` tasks
- headline claims require `k >= 8`
- headline claims must preregister `pass_at_k`, `pass_pow_k`, `horizon_50`,
  and `horizon_80`
- headline claims require a parametric `generatorPolicy` with at least 20
  generators, deterministic state hashes, and monotonicity evidence
- headline claims require an execution ledger proving every planned sweep job is scored, lost, or blocked
- headline claims require a human baseline policy with at least 3 distinct timed human runs and blind review
- headline claims require an outside reproduction receipt whose public-input hashes and recomputed result hash validate
- headline claims require a five-reviewer world-quality audit proving alternative valid solutions pass and shortcuts fail
- headline claims require counterfactual-twin, metamorphic, and delayed-consequence evidence
- headline claims require a complete contamination audit and burn every world with a strong leak signal
- `n >= 8` is only a floor; every headline cell must also meet the preregistered CI-width target
- headline claims are blocked by open severe or critical entries in the public correction ledger
- public/preview/corpus-visible worlds remain non-headline, even if useful for smoke tests or methodology inspection


## How to use this repository

Use this repo if you want to:

- inspect the benchmark methodology
- review the public task catalog
- validate a published benchmark week
- cite the public benchmark results
- launch the real Benchmark Lab flow from a local clone of this repo

Do **not** start here if your goal is simply to run the benchmark. The fastest path is to sign up for OrgX and run it from Benchmark Lab.

## Trust boundaries

- This is a controlled public benchmark, not customer-average telemetry.
- The private OrgX repo runs the benchmark.
- This public repo proves the benchmark.
- The site publishes the benchmark.
- Public result bundles are built by whitelist. Raw private transcripts, internal file paths, workspace IDs, and non-public run metadata are intentionally excluded.
- Weekly results are generated in the private OrgX repo, reviewed by a human, and then synced here for public inspection.
- The `runner/` directory is intentionally narrow: it helps outside readers validate bundle shape and understand how to recompute the public scorecard from published files without exposing private control-plane internals.
- The launcher in `runner/orgx-benchmark.mjs` does not execute the benchmark locally. It opens the real OrgX Benchmark Lab flow and deep-links into the normal product experience.
- The benchmark should mirror normal OrgX UX and integration points. Public-repo launcher links are a convenience layer, not a separate benchmark runtime.

## Primary URLs

- Run this benchmark in OrgX: https://useorgx.com/benchmark
- Benchmark methodology: https://useorgx.com/blog/orgx-autonomous-initiative-benchmark-methodology
- Benchmark hub: https://useorgx.com/benchmarks
- Weekly blog posts: https://useorgx.com/blog
- Public repo: https://github.com/useorgx/autonomous-initiative-benchmark
