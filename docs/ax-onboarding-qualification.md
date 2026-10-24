# Agent-experience qualification

OrgX's AX S-tier work has two separate paths: account-free portable receipts
and hosted continuity before human account claiming. The cross-repository
delivery plan is in `hopeatina/orgx`,
`orgx/docs/architecture/ax-s-tier-plan-2026-10-24.md`.

## Deterministic protocol smoke

Install or extract the candidate Wizard package, then point this runner at its
installed `dist/orgx.js`. It starts new CLI processes with no inherited OrgX
credentials, creates a synthetic artifact, emits a receipt, independently
checks the artifact digest, verifies the receipt and rejects a tampered copy.

```sh
node runner/ax-receipt-smoke.mjs --cli /path/to/wizard/dist/orgx.js
node --test runner/lib/ax-protocol.test.mjs
```

Add `--remote` to send only the synthetic smoke receipt to OrgX's public
validator and check the deployed access guide. No user receipt is accepted by
this runner. HTTP calls omit cookies and Authorization, refuse redirects,
bound response bodies and have a per-request deadline. Optional `--output`
writes a new JSON report and refuses to overwrite existing evidence.

The report records the CLI version and entrypoint digest. Retain the package
tarball integrity and complete source revision alongside it for a release;
the entrypoint digest alone does not cover imported chunks/dependencies.

The runner deliberately reports `tier: null`,
`autonomous_onboarding_evaluated: false` and
`hosted_continuity_evaluated: false`. It does not discover a product, install
it, run an LLM or measure a real agent's integration cost. Its zero model-call
and human-intervention counts apply only to this scripted smoke.

## Actual onboarding campaign

For each supported harness and access path, run at least 30 fresh trials.
Give the agent only the task and homepage URL. Separate directed integration
from discovery. Isolate credentials, client config, history and workspace;
use published artifacts with pinned versions. Start timing before discovery
and installation. Save all attempts, including failed and timed-out runs.

Task A: record an artifact, preserve its receipt across sessions and explain
the exact checks performed without claiming correctness or human acceptance.

Task B: provision a private trial, create work, attach evidence, resume it in
a fresh session, and offer an optional human claim. Block qualification until
this hosted path actually ships. Test quota, expiry, cross-tenant denial,
claim races, acknowledgement loss and old-credential revocation separately.

Report completion rates with sample counts/uncertainty, wall time, token cost,
errors and human interruptions per harness. Development runs pin
`gpt-6-luna`; a premium final comparison must be explicitly selected. No
agent campaign has been run by adding this protocol harness.
