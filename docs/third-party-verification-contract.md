# Third-Party Verification Contract

This contract defines the minimum package an external evaluator needs to verify
an OrgX-Bench Initiative Worlds run without seeing private answers.

## Public Inputs

Provide:

- benchmark version
- world ids and domain mix
- public methodology URL
- score dimensions and weights
- hard fail flag taxonomy
- signed run receipt hash
- aggregate deterministic validator pass/fail summary
- aggregate human baseline summary

Do not provide:

- private validator code
- reference answers
- hidden data labels
- raw private workspace state
- secrets, tokens, cookies, or customer data

## Run Receipt Requirements

Every scored run must include a signed receipt containing:

- model and provider
- tool/runtime surface
- started/completed timestamps
- tool call count and cost
- artifacts created
- state transitions requested
- decisions created or requested
- citations and verifier proof references
- audit log hash
- extraction hash for the graded artifact bundle

## Evaluator Isolation

The evaluator must run outside the environment the agent can modify:

- hidden validator metadata is never mounted into the agent workspace
- reference answers are stored off-path
- validators run from a read-only host or read-only checkout
- post-run artifact extraction uses controlled channels
- evaluator output is signed or hashed
- LLM judges never receive unsanitized raw agent content as the only grading path

## Result Summary

External reports should include:

```yaml
world_id: orgx_launch_gate_002
status: failed
world_success: 0
trust_adjusted_score: 0.38
critical_failures:
  - launch_ready set before QA decision approved
  - analyst quote artifact referenced but not attached
passed:
  - dependency graph created
  - engineering PR tests passed
  - sales enablement artifact created
```

The report should read like an operational verification record, not a vanity
leaderboard card.

## Third-Party Replication Row

Published replication evidence must be machine-checkable. Each external row in
`metadata.externalReplication.rows` or `metadata.thirdPartyReplication.rows`
must use:

```json
{
  "protocol_version": "third_party_replication_v1",
  "party_id": "external-lab-1",
  "party_name": "External Lab 1",
  "world_id": "holdout-2026q3-01-revenue_leakage",
  "submission_id": "submission-1",
  "model_manifest_id": "models-frontier-2026q3",
  "run_manifest_id": "run-private-holdout-2026q3",
  "seed_commitment_hash": "sha256:<64-hex>",
  "signed_receipt_hash": "sha256:<64-hex>",
  "scorecard_hash": "sha256:<64-hex>",
  "replication_protocol_hash": "sha256:<64-hex>",
  "discrepancy_log_hash": "sha256:<64-hex>",
  "submitted_at": "2026-07-08T10:00:00.000Z",
  "scored_at": "2026-07-08T10:05:00.000Z",
  "agreement_within_ci": true,
  "discrepancies": []
}
```

Validate rows with:

```bash
npm run validate:replication
npm run validate:replication -- --file results/<third-party-replication-evidence>.json
npm run validate:replication -- --strict
npm run validate:replication -- --strict --file results/<third-party-replication-evidence>.json
```

The non-strict command allows zero rows while the benchmark is pre-release, but
fails if any present row is malformed. Strict mode requires at least one valid
row and is the release gate for third-party replication claims. Standalone
evidence files use `schemas/third-party-replication-evidence.schema.json` and
carry `protocol_version:"third_party_replication_evidence_v1"` plus `rows`.
Release manifests can reference the standalone file with
`evidence.externalReplicationEvidencePath`; release validation merges those rows
with bundle metadata rows and fails if either source is malformed.

## Stranger Reproduction Receipt

Every headline release also needs one outside reviewer to recompute the public
release from public files only. The release manifest points to this receipt via
`evidence.strangerReproductionReceiptPath`.

Validate the receipt with:

```bash
npm run validate:reproduction -- --receipt results/<stranger-reproduction-receipt>.json
npm run validate:reproduction -- --strict --receipt results/<stranger-reproduction-receipt>.json
```

The receipt schema is `schemas/stranger-reproduction-receipt.schema.json`. It
records the reviewer id/affiliation, command, public input hashes, result hash,
bundle hash, release-manifest hash, reproduction-log hash, deviations, execution
environment, and the two release-gating booleans: `completed` and
`matched_to_digit`.
