# OrgX Autonomous Initiative Benchmark

This repository is the public proof surface for the OrgX Autonomous Initiative Benchmark.

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
- the benchmark methodology in `methodology/`
- a small reproducibility layer in `runner/`
- public weekly result bundles in `results/<week>/`
- a simple schema for the published bundle format in `schemas/`
- a self-serve setup guide in `RUN_IN_ORGX.md`

## Latest published week

No public weekly benchmark bundle has been synced yet. The repository currently contains the methodology, catalog, and bundle schema so outside readers can inspect the benchmark before the first publish-ready week lands.


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
