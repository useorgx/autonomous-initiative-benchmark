# Public runner notes

This directory contains the open subset of the benchmark harness needed to
verify a published benchmark bundle.

What this is for:

- validate that a weekly bundle contains the expected files
- inspect the scorecard CSV and summary JSON
- recompute the public headline metrics from published files

What this is not:

- the private OrgX control plane
- the private orchestration runtime
- a full local reproduction of the internal benchmark execution environment

What this also means:

- `orgx-benchmark.mjs` is a launcher into the real product flow, not a hidden benchmark-only runtime
- benchmark execution should mirror the same initiative and auto-continue behavior a real OrgX user sees
- the benchmark repo exists to make that path obvious and auditable

Use `node validate-bundle.mjs ../results/<week>` to verify a published bundle.
Use `node validate-bundle.mjs ../results/<week> --strict` to apply the higher
public-grade bar. Strict mode intentionally fails smoke bundles that still rely
on self-reported scoring, fewer than three repeats, too few design tasks, or
low criterion-level scores. It also enforces the publication contract: every
strict bundle must declare a `publicationLabel`, ship a `lossRegistry` even when
empty, and prove `launchedRunCount = scored task runs + loss registry entries`.
Strict bundles must also include `modelManifest.models`, provider-reported model
ids for non-human runs, and provider-backed accounting provenance with zero
normalized-cost fallback runs.

When `metadata.publicationLabel` is `headline`, strict mode also requires every
task to be `private_holdout`, a protocol-v2 `human_baseline_summary` covering
every headline world with at least three protocol-valid humans, and at least one
valid third-party replication row with `agreement_within_ci:true`.
External labs can validate a standalone replication handoff before bundle
publication with `npm run validate:replication -- --file results/<third-party-replication-evidence>.json`.
Release manifests can point at that file through
`evidence.externalReplicationEvidencePath`, and the release gate will merge those
rows with bundle metadata rows.

`run-worlds.mjs` is manifest-bound. It refuses to execute without both a
`--run-manifest` and the preregistered `--evaluation-manifest`, and it rejects
requested arms or models that are absent from those manifests. Future frontier
models therefore enter the runner as model-manifest rows, not code branches.

Use `npm run drill:future-model` to run the config-only future-model fire drill.
It inserts a synthetic `gpt-6-fire-drill-stub` model row into manifests, resolves
the normal run contract, and builds the world/arm/seed job matrix without a
provider API key or network call. This proves the next frontier model can enter
as manifest data before the real provider sweep is funded and executed.

Use `npm run audit:sota` to run the strict readiness audit for the full
SOTA/undeniable plan. The audit intentionally fails while the private holdout,
timed human baselines, OrgX pinning/Lab evidence, sealed submission API,
third-party replication, outside reproduction, and strict headline bundles are
missing. Use
`node runner/audit-sota-readiness.mjs --allow-incomplete` when you want the
current pass/fail report without failing the shell command.

Use `npm run validate:release` to validate the draft SOTA release manifest and
print pending release-evidence gates. Use `npm run validate:release -- --strict
--manifest results/<release-manifest>.json` for the actual release gate; strict
mode requires the preregistration timestamp/hash, execution ledger, human
baselines, strict headline bundle, third-party replication row, and outside
reproduction receipt.
Use `npm run validate:reproduction -- --receipt results/<stranger-reproduction-receipt>.json`
to validate the outside-reviewer receipt independently. Without `--receipt`,
the command reads `evidence.strangerReproductionReceiptPath` from the release
manifest; the current draft manifest intentionally leaves it unset.
Use `npm run plan:release-sweep` to expand that release manifest into the exact
frontier model × arm × private holdout × seed execution matrix.
Use `npm run validate:release-ledger -- --init-out results/<release-execution-ledger>.json`
to create the launch ledger from that matrix, then rerun
`npm run validate:release-ledger -- --strict --ledger results/<release-execution-ledger>.json`
before release. Strict ledger mode requires every planned job to be scored,
lost, or blocked so planned executions cannot disappear from the headline.
Use `npm run record:release-ledger-job -- --ledger results/<release-execution-ledger>.json --out results/<release-execution-ledger>.json --manifest results/<release-manifest>.json --job-id <job-id> --status scored|lost|blocked ...`
to update a single job and recompute ledger accounting without hand-editing
JSON.

Use `npm run validate:outreach-plan -- --strict --plan results/sota-outreach-plan.example.json`
before sending methodology, practitioner, replication, or outside-reproduction
outreach. The outreach plan is not evidence by itself; it keeps asks, timing,
contact method, status, and templates auditable before real people produce real
baseline or replication artifacts.
Use `npm run materialize:outreach-drafts -- --plan results/sota-outreach-plan.example.json --out results/sota-outreach-drafts.json --out-dir results/outreach-drafts`
to write reviewable draft bodies. The materializer marks drafts as blocked
unless the target has a direct email route and resolved personalization; contact
forms, warm intros, manual-research targets, and marketplace pools are not
treated as send-ready email. It also writes `results/outreach-drafts/_action-queue.md`
when `--out-dir` is provided. The queue separates `send_ready` copy from
`dispatch_ready_now`: a direct email can be copy-complete while still scheduled
for the next allowed high-response window. Contact forms, paid practitioner
pools, and warm-intro asks are recipient-facing actions in the queue, but they
remain manual execution tasks rather than Gmail sends.
Pass `--generated-at <iso>` when regenerating checked-in examples so the queue
timestamps are reproducible.
Use `npm run init:outreach-ledger -- --drafts results/sota-outreach-drafts.json --out results/sota-outreach-action-ledger.json`
to turn the queue into an auditable action ledger. Validate it with
`npm run validate:outreach-ledger -- --strict --ledger results/sota-outreach-action-ledger.json --now <iso>`.
When a recipient-facing action actually happens, record the receipt with:

```bash
npm run record:outreach-action -- \
  --ledger results/sota-outreach-action-ledger.json \
  --out results/sota-outreach-action-ledger.json \
  --action-id <action-id> \
  --completed-at <iso> \
  --operator <operator> \
  --receipt-channel gmail|contact_form|marketplace|intro \
  --receipt-ref <provider-or-local-receipt-id>
```

The recorder refuses to mark an action complete before its `recommended_at`
timestamp, requires receipt metadata for completed actions, and creates
follow-up due dates from `send_policy.follow_up_business_days`.

Use `npm run plan:human-baselines` to turn the private-holdout registry into
the 60 required timed-human session slots. Pass `-- --experts <json>` to assign
domain-matched experts from a local roster. Validate that roster first with
`npm run validate:human-expert-roster -- --strict --roster results/<human-expert-roster>.json`;
it must disclose compensation, hash expert identity, attest conflicts, deny
private-validator access, and cover every private holdout domain. The plan is
scheduling support only: headline eligibility still requires protocol-valid
records from `record-human-baseline.mjs` and a passing
`validate:human-baselines` run.
Use `npm run export:human-baseline-packets -- --plan results/<human-baseline-plan>.json --out results/<human-baseline-session-packets>.json`
to produce reviewer-safe session packets for recruiting and execution without
exposing private validators or hidden answers.
Use `npm run materialize:human-baseline-kits -- --plan results/<human-baseline-plan>.json --out results/<human-baseline-session-kits>.json --out-dir results/<human-baseline-kits>`
to create participant/recruiting Markdown kits from those packet contracts. The
kit manifest records a content hash for each Markdown file, keeps
`private_validator_access:false`, and marks unassigned slots as recruiting kits
rather than executable sessions.

Use `npm run validate:prompts` after editing world prompts or shared runner
prompts. The audit rejects method/control signposts such as "verify every
number", "re-derive", "cross-check", or source-authority hints in shared and
world-visible prompt surfaces.

Use `npm run validate:dimensions` after editing score dimensions or terminal
classification. The default probe runs deterministic random/degenerate agent
episodes and rejects off-diagonal dimension correlations above the declared
threshold; pass `-- --episodes <file>` to audit a real episode export.

`validate-world.mjs` executes the v4 validator vocabulary listed in
`schemas/private-validator-bundle.schema.json`: artifact parse/render/execute,
schema validation, claim entailment, calculation replay, simulation/downstream
outcomes, blind acceptance review, perturbation and delayed-state checks,
approval ordering, receipt replay, budget adherence, and forbidden actions.

## Initiative Worlds preview

The Initiative Worlds validator proves the deterministic-first architecture for
trust-hardening worlds:

```bash
npm run validate:worlds:preview
```

For a single world:

```bash
node runner/validate-world.mjs \
  worlds/preview/activation-sprint \
  --receipt worlds/preview/activation-sprint/oracle-run/receipt.json
```

Preview worlds include public `private/evaluator.yaml` files only to demonstrate
the contract. Private holdout evaluator bundles must stay off-path from the
agent environment and should be executed on an isolated read-only evaluator host.

This directory also contains `orgx-benchmark.mjs`, a zero-dependency launcher that opens the real OrgX Benchmark Lab flow from a local clone of this public repo.

For low-cost local smoke runs against the public catalog, use:

```bash
npm run run:openai -- --preset full --repeat 1 --concurrency 2
```

The local OpenAI runner writes a complete bundle under `results/`, uses
`gpt-5-nano` by default, and rejects short or incomplete artifacts before
writing the final result files.

By default, the local smoke runner asks the generation model to return the
artifact and self-reported criterion scores. This is useful for cheap completion
testing, but it is not a publishable evaluation protocol.

For a public-grade run, generate cheaply and add independent judges:

```bash
npm run run:openai -- \
  --preset full \
  --repeat 3 \
  --concurrency 2 \
  --judge-preset public \
  --judge-concurrency 2 \
  --judge-max-output-tokens 2500
```

The `public` judge preset uses an independent three-judge panel:

- `gpt-5.4-nano` with low reasoning
- `gpt-5.4-mini` with medium reasoning
- `gpt-5.4` with high reasoning

To judge an existing self-reported bundle without regenerating artifacts, use:

```bash
npm run judge:bundle -- \
  results/<week> \
  --judge-preset public \
  --judge-concurrency 2 \
  --out <new-week-name>
```

Judged bundles include `judgments.json`, judge-derived task scores,
criterion-level median scores, disagreement statistics, human-review flags,
and token/cost metadata for generation and judging. The validator checks that
bundles claiming independent judging actually include completed judge records.

## Cross-provider judging

Judge specs accept `[provider:]model[:reasoningEffort]`. Registered providers
are `openai` (Responses API), `openrouter`, and `deepseek` (chat completions);
each requires its own API key env var (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`,
`DEEPSEEK_API_KEY`). The `deepseek` preset runs a three-judge DeepSeek panel
via OpenRouter so artifacts are never scored only by the vendor that generated
them:

```bash
npm run judge:bundle -- results/<week> --judge-preset deepseek --judge-concurrency 4
```

## Importing live OrgX product runs

`import-live-run.mjs` converts artifacts produced by a live OrgX run (Benchmark
Lab, MCP delegation, agent-surface execution) into a standard unscored bundle,
which the regular judge pipeline then scores:

```bash
npm run import:live -- --input runs.json --out <result-dir> --source orgx_live_product
npm run judge:bundle -- results/<result-dir> --judge-preset deepseek
```

## Pairwise bundle comparison

Absolute rubric scores saturate on the public catalog, so head-to-head claims
should use pairwise preference judging. Each judge sees both artifacts for the
same task in both orders (position-bias control), and a vote only counts when
a judge's two orderings agree:

```bash
npm run compare:bundles -- results/<bundle-a> results/<bundle-b> \
  --judge-preset deepseek --judge-concurrency 4 --out comparison.json
```
