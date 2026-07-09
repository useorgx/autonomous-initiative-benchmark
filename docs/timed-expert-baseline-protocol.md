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

- `protocol_version: timed_expert_baseline_v2`
- `startedAt` and `completedAt`
- `artifact_hash`, `receipt_hash`, and `operator_profile_hash`
- visible files inspected
- decisions created or requested
- artifacts produced
- tests or checks run
- launch/readiness state at the end
- citations used
- confidence and ambiguity notes
- `blind_review_recorded_at` and `grader_verdict_revealed_at`

The same deterministic validators should score human receipts where possible.
If a validator cannot apply to a human run, document why before the world enters
holdout.

Record a baseline with:

```bash
node runner/record-human-baseline.mjs \
  --world holdout-2026q3-01-revenue_leakage \
  --human expert_hash_1 \
  --seconds 4440 \
  --success true \
  --started-at 2026-07-08T10:00:00.000Z \
  --completed-at 2026-07-08T11:14:00.000Z \
  --artifact-hash sha256:<64-hex> \
  --receipt-hash sha256:<64-hex> \
  --operator-profile-hash sha256:<64-hex> \
  --blind-review-recorded-at 2026-07-08T11:30:00.000Z \
  --grader-verdict-revealed-at 2026-07-08T11:45:00.000Z
```

The recorder refuses records missing these fields. Three names without artifact
and review provenance do not qualify as headline human-baseline evidence.

Plan the required holdout sessions before recruiting:

```bash
npm run plan:human-baselines
npm run validate:human-expert-roster -- --roster results/human-expert-roster.json --strict
npm run plan:human-baselines -- --experts results/human-expert-roster.json --out results/human-baseline-plan.json
npm run plan:human-baselines -- --strict --experts results/human-expert-roster.json
```

The expert roster must use `human_expert_roster_v1`. It records hashed expert
identity, domain coverage, max session load, compensation disclosure,
recruitment channel, conflict attestation, and `private_validator_access:false`.
Roster validation is scheduling hygiene only; it is not baseline evidence.

The plan contains 3 required slots for every committed private holdout world.
`assigned` sessions are scheduling work only; they are not evidence. A slot
becomes headline evidence only after a protocol-valid `record-human-baseline`
receipt with artifact, receipt, operator-profile, and blind-review hashes.

Validate the complete holdout coverage with:

```bash
npm run validate:human-baselines -- --allow-incomplete
```

Remove `--allow-incomplete` for release gating. Release gating requires every
committed private holdout world in `worlds/corpus-splits.json` to have at least
three distinct protocol-valid human baselines.

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
## Session Packets

Generate reviewer-safe session packets from the current baseline plan before
recruiting or scheduling experts:

```bash
npm run export:human-baseline-packets -- --plan results/<human-baseline-plan>.json --out results/<human-baseline-session-packets>.json
```

Packets contain only operational session details, assignment/profile hashes,
blind-review requirements, and the `record:human-baseline` command template.
They must not contain hidden validators, answer keys, or grader output.

Materialize participant/recruiting kits from the same plan when you are ready
to hand work to operators or recruiting channels:

```bash
npm run materialize:human-baseline-kits -- \
  --plan results/<human-baseline-plan>.json \
  --out results/<human-baseline-session-kits>.json \
  --out-dir results/<human-baseline-kits>
```

The kit manifest stores a content hash for every Markdown handoff. Unassigned
slots are explicitly labeled recruiting kits; they become executable sessions
only after a roster entry assigns a qualified expert and the plan is rebuilt.
