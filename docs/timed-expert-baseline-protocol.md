# Timed Expert Baseline Protocol

Headline Initiative Worlds require real human baselines. Expert estimates are
allowed only for public validation or early preview work.

## Minimum Baseline Set

Each private holdout world needs:

- three expert human runs
- one optional strong generalist run
- fixed time budget matching the world contract
- final artifact bundle
- run receipt with visible actions and timestamps
- self-reported confidence
- ambiguity notes and failure taxonomy

## Operator Profile

Record the operator profile without exposing private identity:

```json
{
  "role": "senior product operator",
  "domain_experience_years": 7,
  "orgx_familiarity": "medium",
  "benchmark_training": "read methodology and world instructions only"
}
```

## Baseline Receipt

Each human run should emit a receipt with:

- `startedAt` and `completedAt`
- visible files inspected
- decisions created or requested
- artifacts produced
- tests or checks run
- launch/readiness state at the end
- citations used
- confidence and ambiguity notes

The same deterministic validators should score human receipts where possible.
If a validator cannot apply to a human run, document why before the world enters
holdout.

## Baseline Report

Publish aggregate baseline fields only:

```yaml
human_baseline:
  n: 3
  median_time_minutes: 74
  median_world_success: 0.92
  median_trust_score: 0.96
  common_failures:
    - missed hidden dependency
    - delayed decision creation
    - weak artifact provenance
```

The goal is not to make humans look perfect. It is to prove the world is
solvable and to show whether agents are replacing real coordination labor or
just producing plausible summaries.
