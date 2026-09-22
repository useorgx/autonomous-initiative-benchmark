# Continuity benchmark development implementation — September 22, 2026

This implementation is a public development experiment, not a frontier leaderboard or evidence that production OrgX reduces human labor.

## Implemented

- Strict numeric evidence, non-weakenable quality thresholds, exact expected cell and episode coverage, raw-outcome-derived precision, and integration into strict release validation.
- Separate authenticated runtime qualification from source-code inventory. Trusted auditor keys are an external release-owner input; none are fabricated here.
- Three deterministic, stateful scenario generators: changed dependencies/approval invalidation, replacement workers/lost acknowledgements, and increased portfolios.
- Actor-only business tools. The remote model cannot read the evaluator, invoke local code, or access real business services. Approval digests, idempotency and transient violations are checked from observed state/history. Equivalent artifacts may contain additional metadata.
- Frozen model catalogs, tools and generator hashes; config-only model selection; observed model checks; no silent model/provider fallback.
- Full planned execution ledger. Missing/blocked/lost runs are retained. Failed-call measured cost is retained; unknown cost is not zero and blocks subsequent paid calls.
- Fixed human-session roster and interval-union accounting. Simulated users are rejected. Consent and observed timed sessions are prerequisites, not generated records.
- An optional explicitly labeled OrgX runtime **component** arm. It does not replace the full-production arm or qualify a product claim.

## Run

```sh
npm test
npm run validate:worlds:preview
node runner/continuity-benchmark.mjs self-test --out artifacts/continuity/self-test.json
node runner/continuity-benchmark.mjs plan --out artifacts/continuity/plan.json
node runner/continuity-benchmark.mjs freeze --out artifacts/continuity/frozen --max-usd 40
# Archive frozen inputs before running. Supply credentials via your secret store.
node runner/continuity-benchmark.mjs run --frozen artifacts/continuity/frozen --out artifacts/continuity/run
node runner/continuity-benchmark.mjs report --plan artifacts/continuity/run/plan.json --ledger artifacts/continuity/run/ledger.json --out artifacts/continuity/recomputed.json
```

Strict precision validation now additionally takes the preregistered expected cells and raw outcome ledger:

```sh
node runner/validate-benchmark-quality-evidence.mjs --kind precision --strict --file report.json --expected-cells expected-cells.json --outcome-ledger outcome-ledger.json
```

`orgx_full` is deliberately recorded as blocked until a production adapter's isolation, exact model routing, workspace state, normal execution path and acceptance parity are established. A generic prompt or imported review-policy function cannot satisfy that gate. The optional component arm has a different identifier and an additional denominator.

## Evidence limitations

These three generators are compact synthetic fixtures, not the complete private Initiative Worlds corpus. Their JSON consumers exercise coordination and authorization mechanics, not professional artifact quality. Approvals are simulated. This development release has no timed human study, independent reproduction, authenticated outside reviewers, or private-holdout claims. The existing stricter release requirements are retained. Model identity is bound to the provider's catalog and response, not a cryptographic attestation of weights. Conservative cost reservations are a guard, not a universal billing guarantee.

The next qualification work is executable production-adapter parity, fresh independently authored worlds, and consented counterbalanced human sessions. The code does not mark those activities completed simply because a document exists.

## September 22 harness audit follow-up

The follow-up audit reproduced eight failures beyond the initial passing suite: cost-overrun double settlement, pending reservations reported as complete, negative price acceptance, invalid episode caps, relabelled planned jobs, acceptance without replay, unresolved calls omitted from cost completeness, and orphan successful receipts treated as pre-call denials. Regression coverage now checks these boundaries and the full CLI credit-blocked path.

Provider attempts receive identities before reservation. A rejected reservation has a separate zero-dispatch event; it cannot reuse the preceding paid call's identity. Both budgets retain a measured overrun before the original failure is returned. Per-turn history and transcripts survive subsequent ledger updates, and interruption stops dispatch at the next turn boundary. Frozen inputs now bind the runner, transport, replay and analysis sources as well as the generator and tool schema.

The report checks planned identities and regenerates evaluator state from actions. It includes conservative paired cluster differences; repeated variants do not become independent organizations. CLI report generation includes the ledger audit and returns nonzero on inconsistent accounting. This is an internal consistency check, not provider attestation or independent replication.

The earlier run `35694499427` contains $11.15573678541798 of recorded provider cost and one unresolved HTTP 402 call. Independent replay detected two reused call identities and a cost reconciliation error. Preserve the original evidence; do not reinterpret that run as a clean comparison. The fresh account credit preflight found exhausted credits. The rerun retains all 288 planned jobs, blocks before dispatch, and spends zero model dollars.

Still required before the full plan can produce confirmatory findings: qualified full OrgX execution in isolated workspaces, professional downstream consumers, independently authored sealed organizations, observed human attention sessions, an old/new model intervention cohort, independent review and reproduction, and a funded complete execution. The component arm and deterministic fixtures do not satisfy those requirements. The methods post remains a draft.
