# Run this benchmark in OrgX

The simplest way to evaluate the OrgX Autonomous Initiative Benchmark is to run it inside OrgX itself.

## Execution model

When you launch a benchmark run in OrgX:

- OrgX creates normal initiatives and workstreams with benchmark metadata attached.
- Single-domain tasks create domain-specific initiatives. Cross-functional tasks create multi-domain initiatives.
- The same execution contract is applied across Agent, API, CLI, and E2B-backed execution surfaces.
- The benchmark workspace defaults to the highest autonomy level the platform policy allows.
- If the platform resolves non-human blockers automatically, the run stays autonomous.
- If a human approval or decision is required, the run is still preserved, but its autonomy score is reduced accordingly.

## Fast path

1. Go to https://useorgx.com/benchmark
2. Sign up or sign in
3. Open Benchmark Lab
4. Choose **Starter benchmark** for a fast all-domain proof pass or **Full benchmark** for a publication-grade run
5. Open the benchmark run detail page to inspect:
   - scorecard metrics
   - surfaced artifacts
   - publication classification
   - comparison links to the public benchmark corpus

## Repo-native launcher

If you cloned this repo locally, you can use the included launcher instead of hunting for the right URLs:

```bash
node runner/orgx-benchmark.mjs
```

Quick commands:

```bash
node runner/orgx-benchmark.mjs start starter
node runner/orgx-benchmark.mjs start full
node runner/orgx-benchmark.mjs open
```

The launcher does **not** run the benchmark locally. It opens the real OrgX Benchmark Lab flow in your browser and deep-links into:

- sign-up / sign-in
- Benchmark Lab
- automatic starter/full benchmark queueing after auth

That means the benchmark repo stays seamless without becoming a second execution environment. The repo opens the real product path.

## What you get

- a benchmark run detail page in OrgX
- a scorecard with flow multiplier, quality delta, autonomy, and timing metrics
- surfaced benchmark artifacts and results
- links into the public benchmark hub so you can compare your run to published weeks

## What this repo is for

This public repo is for:

- methodology
- task catalog
- public benchmark bundles
- lightweight validation scripts

It is **not** the primary execution surface.

## Validate a published week

```bash
node runner/validate-bundle.mjs results/<week>
node runner/recompute-scorecard.mjs results/<week>
```
