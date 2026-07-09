# SOTA Release Runbook

This runbook binds the last evidence-dependent steps into one machine-checkable
release manifest. It exists to prevent a headline claim from being assembled out
of partial artifacts.

## Release Manifest

The release manifest lives at `results/sota-release-manifest.example.json` until
there is a real release candidate. A release candidate must bind:

- preregistered protocol path, hash, commit time, and first-run launch time
- full frontier sweep matrix: models, arms, minimum `k`, minimum episodes per
  cell, and headline metrics
- execution ledger path
- holdout registry path
- human-baseline assignment plan
- protocol-v2 human-baseline summary path
- strict headline bundle path
- third-party replication source
- optional standalone third-party replication evidence path
- outside reviewer reproduction receipt path

Run the preflight validator:

```bash
npm run validate:release
```

The preflight command is allowed to pass while evidence gates are missing, but it
prints warnings for every missing gate.

Generate the concrete frontier sweep matrix:

```bash
npm run plan:release-sweep
npm run plan:release-sweep -- --out results/<release-sweep-plan>.json
npm run validate:release-ledger -- --init-out results/<release-execution-ledger>.json
```

The planner expands the release manifest into `frontierModels × non-human arms ×
private_holdout worlds × minEpisodesPerCell`, plus the timed-human baseline
slots. The current draft preflight expands to 8,960 model jobs and 60 human
baseline slots. That is the execution ledger for the future headline bundle:
launched jobs can be scored, lost into the loss registry, or blocked before
launch; they must not disappear.

Validate the ledger as the run progresses:

```bash
npm run validate:release-ledger -- --ledger results/<release-execution-ledger>.json
npm run validate:release-ledger -- --strict --ledger results/<release-execution-ledger>.json
```

Non-strict mode accepts a prelaunch ledger whose jobs are still `planned` or
`launched`, but warns about unresolved jobs. Strict mode requires every planned
execution unit to be terminal: `scored`, `lost`, or `blocked`.

Record individual job outcomes through the guarded updater rather than
hand-editing the JSON:

```bash
npm run record:release-ledger-job -- \
  --ledger results/<release-execution-ledger>.json \
  --out results/<release-execution-ledger>.json \
  --manifest results/<release-manifest>.json \
  --job-id <job-id> \
  --status scored \
  --launched-at 2026-07-09T01:00:00.000Z \
  --completed-at 2026-07-09T01:05:00.000Z \
  --bundle-run-id <bundle-run-id> \
  --receipt-hash sha256:<64-hex>

npm run record:release-ledger-job -- \
  --ledger results/<release-execution-ledger>.json \
  --out results/<release-execution-ledger>.json \
  --manifest results/<release-manifest>.json \
  --job-id <job-id> \
  --status lost \
  --launched-at 2026-07-09T01:00:00.000Z \
  --completed-at 2026-07-09T01:04:00.000Z \
  --loss-type timeout

npm run record:release-ledger-job -- \
  --ledger results/<release-execution-ledger>.json \
  --out results/<release-execution-ledger>.json \
  --manifest results/<release-manifest>.json \
  --job-id <job-id> \
  --status blocked \
  --reason "provider unavailable before launch"
```

The updater rewrites the accounting block after each change and, when a manifest
is supplied, validates the updated ledger before writing. This preserves the
release identity `launched/scored/lost/blocked = accounted`, not aspirational.

Plan and track the timed-human sessions:

```bash
npm run validate:outreach-plan -- --strict --plan results/sota-outreach-plan.example.json
npm run plan:human-baselines -- --out results/<human-baseline-plan>.json
npm run validate:human-expert-roster -- --strict --roster results/<human-expert-roster>.json
npm run plan:human-baselines -- --strict --experts results/<human-expert-roster>.json
npm run export:human-baseline-packets -- --plan results/<human-baseline-plan>.json --out results/<human-baseline-session-packets>.json
```

Strict outreach validation keeps target lane, ask, timing, contact method,
status, and message template auditable before any sends. Strict roster
validation requires hashed identity, compensation disclosure, conflict
attestation, no private-validator access, and enough domain-matched capacity for
every private holdout world. Strict planning mode then requires every required
session to be assigned to a distinct expert for that world. None of these
satisfy the evidence gate; only protocol-valid recorded baselines do.

The packet export is reviewer-safe: it contains session ids, required expertise,
assignment hashes, blind-review requirements, and `record:human-baseline`
command templates, but it does not contain private validators, hidden answers,
or grader output. Use it for recruiting and session operations, then record
finished sessions with `npm run record:human-baseline`.

Validate the outside reproduction receipt once an actual outside reviewer has
recomputed the public release:

```bash
npm run validate:reproduction -- --receipt results/<stranger-reproduction-receipt>.json
```

The receipt must use `stranger_reproduction_v1`, list the public input files and
hashes used, include the command that recomputed the release, and set both
`completed:true` and `matched_to_digit:true`.

Validate standalone third-party replication evidence before embedding it into a
headline bundle:

```bash
npm run validate:replication -- --file results/<third-party-replication-evidence>.json
npm run validate:replication -- --strict --file results/<third-party-replication-evidence>.json
```

Set `evidence.externalReplicationEvidencePath` in the release manifest when the
external row is delivered as a standalone file. The release gate merges those
rows with any `metadata.externalReplication.rows` in the headline bundle and
fails closed if the standalone evidence document is malformed.

Run the release gate:

```bash
npm run validate:release -- --strict --manifest results/<release-manifest>.json
```

Strict mode must fail until all of these are true:

- `status` is `candidate` or `released`
- preregistration hash matches the protocol file and predates the first sweep run
- sweep matrix includes the required frontier models, arms, `n >= 8`, and `k >= 8`
- the execution ledger accounts for every planned model and human-baseline job
- every human-baseline session has been planned, assigned, recorded, and validated
- every private holdout world has at least three protocol-valid human baselines
- the headline bundle passes `validate:bundle:strict`
- the headline bundle carries at least one valid third-party replication row with
  `agreement_within_ci:true`, or the release manifest points at a valid
  standalone replication evidence file with an agreeing row
- an outside reviewer has recomputed the release from public files and recorded
  the command, timestamp, reviewer id, public input hashes, result hash, and
  `matched_to_digit:true` receipt

## Honest Current State

The current example manifest is `draft_preflight`. It includes a planned
execution ledger and a human-baseline assignment plan, but both are pre-evidence:
all 9,020 ledger jobs are unresolved and all 60 human-baseline sessions are
unassigned. It intentionally has no headline bundle path, no external
replication row, no stranger reproduction receipt, and the generated
human-baseline summary reports zero human sessions. That is not a release
candidate. It is the executable checklist for becoming one.
