# SOTA & Undeniable: The Plan (2026-07-08, rev 2)

Goal: make the OrgX Autonomous Initiative Benchmark a reference-grade agent benchmark —
citable next to τ-bench, SWE-bench-Verified, and METR's horizon work — and make the
supporting structures in the private OrgX repo strong enough that no serious reviewer
can dismiss the numbers.

Rev 2 incorporates a second-opinion review pass: the binding v1.0 integrity contract
with a loss policy, model-capability manifests (models as data, never code), the
expanded validator vocabulary, explicit OrgX ablation arms, Benchmark Lab as the truth
surface, and non-vacuous CI. The external standard we hold against: SWE-bench Verified
(human-screened task validity), τ-bench (final-state grading + dynamic users), WebArena
/ TheAgentCompany (realistic self-contained environments), METR (human-time-horizon
calibration), BrowseComp (hard to find, easy to verify), FrontierMath (unpublished
expert-authored problems). We borrow those principles, not their domains.

This plan covers both repos:

- **Public** (`autonomous-initiative-benchmark`): worlds, runner, methodology, published bundles.
- **Private** (`~/Code/orgx`): Benchmark Lab executors, provider routing, telemetry,
  quality gates, publishing pipeline.

---

## 1. What "undeniable" means (the acceptance criteria for this plan)

A benchmark is undeniable when all six hold simultaneously. Today we hold #5 and half
of #6; the rest are the plan.

| # | Property | Today | Target |
|---|----------|-------|--------|
| 1 | **Frontier-measured** — the models people care about are on the board | gpt-5-nano / deepseek-v4-flash defaults; no Gemini, partial Claude | GPT-5.x-high, Claude Fable 5 / Opus 4.8, Gemini 3, DeepSeek v4-pro, Fugu-Ultra on every headline world |
| 2 | **Statistically defensible** — no number without variance | n=1 bundles, CIs referenced but not computed | n≥8 per cell, Wilson/bootstrap CIs, pass^k at k∈{1,4,8,16,32}, paired seeds |
| 3 | **Human-anchored** — speed/quality claims vs measured humans | Estimates only; `human-baselines.mjs` computation built, zero data | ≥3 timed experts per holdout world; operator-calibration κ published |
| 4 | **Externally verifiable** — outsiders can run/score without trusting us | Public repo is read-only proof surface; no submission path | Sealed-validator submission API + preregistered protocol + third-party replication |
| 5 | **Integrity-hardened** — grader isolation, honest accounting | Strong: code-as-oracle, grader-mutation suite, 4-state terminals, cost flags | Keep; add per-release isolation audit |
| 6 | **Saturation-proof** — GPT-6/7/8 land somewhere meaningful | Binary pass predicates; Phase-1 already saturated by a cheap model | Parametric worlds → reliability-horizon and gate-depth **curves** as headline |

---

## 2. Why saturation-proofing is the load-bearing design change

Our own Phase-1 data is the proof: deepseek-v4-flash hit pass^k=1.0 on 4/5 single-job
worlds in June 2026. Any fixed task set we write will be saturated by GPT-5.6-class
models within quarters. Fixed sets are the wrong shape.

The fix is to make **difficulty a continuous parameter and the headline a curve**:

1. **Parametric world generators.** Every holdout world exposes knobs — horizon length
   (steps), state size, distractor density, perturbation rate, seed. A world is a
   generator, not an instance. Instances are cheap to mint (contamination defense) and
   difficulty scales without authoring new worlds.
2. **Reliability-horizon headline (METR-style).** Report, per model: the largest
   difficulty parameter at which the model sustains 50% / 80% pass^k. GPT-6 doesn't
   saturate this — it moves the curve right, which is exactly the story we want to be
   the canonical source for ("Fable 5 holds 80% reliability to 14-step initiatives;
   GPT-6 holds it to 40").
3. **Gate-depth headline.** The production-acceptance gate
   (`runner/lib/production-gate.mjs`) is inherently saturation-resistant: report
   *severity-weighted checks cleared at ship-threshold* as a curve, and let the
   product↔benchmark loop legitimately add checks over time via the versioned
   acceptance schema (`runner/lib/acceptance-schema.mjs`). New model generations face a
   deeper gate, with a semver'd changelog explaining exactly what changed and why.
4. **Reliability discrimination via k.** A model at pass@1=100% is still discriminable
   at pass^16/pass^32. Publish capability rank AND reliability rank; they diverge
   (τ-bench finding), and the divergence is itself a headline.

These four together are what lets one benchmark meaningfully compare GPT 5.6, 6, 7, 8:
the task substrate doesn't change, the measured frontier of the curves does.

---

## 3. Workstreams

Each workstream carries two bars: **exit criteria** (the work is done) and **100x
verifiers** (proof the work was done at the level that makes it undeniable). A valid
100x verifier must satisfy the same rules we impose on the benchmark's own graders:

1. **Runnable by someone who doesn't trust us** — a command, a drill, or a published
   artifact; never "we reviewed it."
2. **Has a negative control** — we plant the violation and the verifier must catch it.
   A verifier that has never fired is unproven.
3. **Measures the delta, not the diff** — a fix ships with a before/after measurement
   showing the property changed, not just that code changed.
4. **Drills are timed and logged** — fire-drills (new model, revert-a-fix, leak
   simulation) produce timestamped records, so "we could do X in a day" is a
   measurement, not a claim.

### WS0 — Freeze the integrity contract + construct-validity repairs (weeks 1–2)

**First, write the binding "OrgX-Bench v1.0 Contract"** — one document, versioned,
that every run and every publication is checked against. It defines:

- Split taxonomy: `headline-eligible` / `public-validation` / `canary` — and what each
  is allowed to claim.
- Publication labels: `headline`, `mechanism`, `with-caveats`, `invalid-for-cost`,
  `do-not-publish` — extending the existing classifier
  (`lib/evals/publication/gatingCheck.ts` in orgx), not a new system.
- **Loss policy: failed, lost, and aborted runs are registered in a loss registry,
  never silently omitted.** Exclusions ship with reasons in every bundle. This is the
  single cheapest anti-cherry-picking defense and most benchmarks skip it.
- Required run manifest + model manifest fields (see WS1), required human-baseline
  fields, allowed validator types (see WS2).
- Future-model rule: GPT-5.6/6/7/8 are **model-manifest entries, never code branches.**
- Headline predicate: `QualifiedWorkProductSuccess = mission complete ∧ state correct
  ∧ artifact valid ∧ downstream consumer succeeds ∧ no critical trust violation` —
  the funnel's terminal stage, per `docs/strategy/orgx-bench-v4-work-product-in-use.md`.

Publish the contract in `schemas/` + `docs/` (public repo) so outsiders can hold us to
it. This formalizes what `docs/measurement-philosophy-v2.md` and the corpus-splits
policy block already gesture at, and makes it binding rather than aspirational.

**Then fix the known construct flaws** *before* building holdout worlds on the same
templates. All are already documented in
`docs/strategy/orgx-bench-v4-work-product-in-use.md` with file:line.

- **Kill the signposted method.** The base prompt currently tells every arm which
  control/check it needs — that tests compliance, not discovery, and inflates every
  arm while flattening uplift. Prompts state the mission and the tools, never the
  method.
- **Decouple safety from completion** (`worlds/instrumented/deploy-approval-trust.mjs:115`)
  and fix non-independent dimensions (`order-pipeline-horizon.mjs:150`).
- **No decorative outputs**: every required output field must be read by a validator
  or removed.
- **Statistics in the runner** (`runner/run-worlds.mjs`): default n≥8 episodes per
  cell; Wilson intervals for pass rates, BCa bootstrap for NAU/quality scores;
  paired-seed comparisons across arms; strict mode refuses to emit a headline field
  without a CI. (~1 day of work; the single cheapest credibility purchase available.)
- Housekeeping: commit or clean `runner/probe-design-longcook.mjs` (dirty in the
  working tree; writes to `/tmp`); resolve the public-repo slug divergence — the
  private sync workflow targets `useorgx/initiative-velocity-benchmark` while this
  repo is `autonomous-initiative-benchmark`.

**Exit criteria:** grader-mutation suite green on repaired templates; a re-run of the
existing preview worlds produces CIs; zero prompts contain method hints.

**100x verifiers:**
- **Contract linter with a negative control.** `validate-bundle` (strict) rejects a
  synthetic bundle containing a silently-dropped run, a missing loss registry, or an
  unlabeled publication — the seeded-violation fixture lives in the test suite
  permanently, so the linter is proven to fire, forever.
- **De-signposting measured, not asserted.** An automated prompt audit (lint over all
  world base prompts for method/control vocabulary) is green, AND the before/after
  arm-spread is published: after removing method hints, the gap between raw and
  orchestrated arms must *widen or be explained* — if de-signposting changed nothing,
  the flaw wasn't real or the fix wasn't. Negative control: re-adding one hint line
  turns the audit red.
- **CI machinery has coverage, not just output.** A simulation harness runs 1,000
  synthetic Bernoulli worlds through the runner's Wilson/bootstrap code and shows the
  95% intervals cover the true parameter ~95% of the time. Publishing a CI whose
  coverage was never checked is theater.
- **Dimension independence proven by data.** On a corpus of random/degenerate agents,
  the cross-dimension correlation matrix (safety × completion × trust × judgment)
  shows off-diagonals below a declared threshold — the decoupling fix demonstrated,
  not diffed.
- **Strict-mode refusal test:** the runner throws when asked to emit a headline field
  at n<8 or without a CI. The test asserts the throw.

### WS1 — Frontier coverage + provider pinning (weeks 1–4, both repos)

Public repo (small):
- Add native `anthropic` and `google` entries to `runner/lib/providers.mjs` (registry
  is one entry per provider; model specs stay CLI strings `provider:model:effort` —
  a GPT-6 run must be a config change, never a code change).
- **Model-capability manifest: models are data, not code.** One versioned JSON/YAML
  schema per model entry: provider, model id, API surface, tool-call support,
  structured-output mode, context limit, reasoning controls, max turns, timeout
  policy, **pricing snapshot with source + date**, adapter version, run date. Every
  run records the manifest it ran under. This subsumes the hardcoded gpt-5.x price
  table in `runner/lib/openai-pricing.mjs` and the `gpt-5-nano` default in
  `runner/openai-catalog-runner.mjs:13` — pricing becomes a dated snapshot inside the
  manifest, never a source-of-truth constant. A **run manifest** (worldSplit, seeds,
  k, arms, difficulty schedule) is the companion file: the full sweep matrix is
  declared in manifests, and the runner refuses to execute outside a manifest.
  In orgx this layer lives around `lib/evals/benchmark/runtimeConfig.ts`; the public
  repo ships the schema plus an example manifest.

Private repo (the real work — closes gap A1):
- `lib/evals/benchmark/runtimeConfig.ts` understands only `auto|claude|openai`; extend
  the selection type to the full provider set.
- **Make pinning enforced, not advisory, in the live lane.** Today
  `executors/orgxPlatform.ts` stamps the selection into metadata while
  `lib/server/executionRouting.ts` + `lib/agents/providerDispatcher.ts` choose the
  actual backend, and `lib/server/consoleWorker/credentialSource.ts` is hard-typed to
  `'openai'|'anthropic'`. Add a `benchmarkPinnedProvider` that routing must honor or
  **fail the run loudly as `pinning_violated`** — never silently substitute. Widen
  `credentialSource` to include the OpenRouter/Google paths that already exist in the
  runtime adapters (`lib/agents/runtime/adapters/openrouterAdapter.ts`).
- **Close the cost-comparability crack:** `orgxPlatform.ts` still normalizes top-level
  cost from tokens when child-run accounting is partial. Make partial accounting a
  hard `costComparable:false` with the missing streams enumerated, and alert on it —
  a headline run with incomplete accounting is a wasted headline run.

**Exit criteria:** one world, five providers, all runs carrying
`usageProvenance='provider_usage'` end-to-end; a deliberately mis-routed run fails
with `pinning_violated`.

**100x verifiers:**
- **Pinning chaos test in CI.** A permanent test deliberately misconfigures
  `executionRouting.ts` so the pin and the route disagree; the run MUST terminate
  `pinning_violated`. If it completes with a substituted model, the build is red.
  This is the negative control that proves fail-loud is real.
- **Model-identity provenance check.** The bundle validator asserts that every
  headline run's provider-reported model id (from the usage stream) string-matches
  the model manifest entry it was pinned to. Any mismatch = `do-not-publish`. This
  catches silent provider-side model swaps, not just our own routing bugs.
- **The GPT-6 fire drill.** Add a fake `gpt-6` manifest entry pointing at a stub
  server and run the full sweep pipeline end-to-end with **zero code changes**,
  timed and logged. Repeat quarterly. The timestamped drill record is the proof of
  "future models are config, not code" — and it's what lets us credibly promise
  frontier numbers within a week of any real GPT-6 API.
- **Zero-fallback accounting.** In any headline bundle, the count of runs whose cost
  was normalized via the fallback path (instead of full child-run
  `provider_usage`) is exactly 0 — an accounting field the bundle validator checks,
  with a seeded-fallback fixture proving the check fires.
- **Manifest-refusal test:** the runner throws when invoked without a run manifest
  or with a model absent from the model manifest.

### WS2 — Populate the holdout as parametric generators (weeks 2–8, public+private)

- Build the private holdout as **20+ generator worlds** (raised from the original
  target of 10 in `worlds/corpus-splits.json`; currently 0), on the WS0-repaired
  templates. Because each world is a parametric generator, 20 generators × seeds ×
  difficulty levels yields **hundreds of distinct headline instances** — matching the
  effective scale of a 40–60-fixed-world suite while staying authorable and
  contamination-resistant. Grow public previews from 2 → 10 so outsiders have a real
  dev set. Reuse the 3 outlines in `worlds/outlines/` and the 8 `-in-use` domain
  worlds as seeds — the domain spread (design, engineering, marketing, product,
  sales, ops, analytics, cross-functional) is already right.
- **World anatomy checklist — every holdout world must include all of:** seeded
  workspace state; a tool/API/database surface; hidden evaluator state; an approval
  or policy boundary; at least one plausible trap; a required side-effectful state
  mutation (never prose-only); gold artifact + no-artifact baseline + candidate
  artifact path (the NAU triple); a deterministic validator bundle; a perturbation
  pass; difficulty knobs with documented ranges; a grader-mutation test; a signed
  receipt hash; and (via WS3) 3+ timed human baselines.
- **Expand the validator vocabulary — score effect, not shape.** The current public
  validator schema (`schemas/private-validator-bundle.schema.json`) mostly covers
  JSON-path checks, citation presence, event order, and file existence — state
  predicates, not downstream utility. Implement the v4 validator families as
  first-class, schema-registered types:
  `artifact_parse`, `artifact_render`, `artifact_execute`, `schema_validate`,
  `claim_entailment` (evidence must *entail* the claim, not merely exist —
  kills pseudo-verification), `calculation_replay` (grade the derivation, already in
  `runner/lib/calculation-replay.mjs`), `simulation_outcome`, `downstream_task`
  (a consumer applies the artifact and must succeed), `blind_acceptance_review`,
  `perturbation_test`, `delayed_state_check`, `approval_order`, `receipt_replay`,
  `budget_adherence`, `forbidden_action`. Every validator type gets its own
  grader-mutation test proving bad submissions fail *for the intended reason*.
  In orgx, `lib/evals/benchmark/outputContract.ts` stops using section-substring
  matching as a serious validator — shape checks become `artifact_parse`/
  `schema_validate` preconditions, never scores.
- Build **10 rotating canary worlds** (raised from 3) and set the quarterly rotation
  calendar now (contamination detection needs a baseline quarter before it can
  detect anything).
- **Capability-adaptive escalation** in the runner: if a model clears a difficulty
  level at ≥80% pass^k, auto-escalate the knob until it drops below 50% — the sweep
  finds each model's frontier instead of wasting episodes on saturated settings.
- Holdout hygiene: validators and fixtures live only in the private repo; the public
  repo publishes hashes + aggregate results per the existing whitelist exporter
  (`scripts/evals/exportPublicBenchmarkRepo.ts`). Never run holdout worlds through
  third-party APIs with logging enabled without flagging the world as burned.

**Exit criteria:** 20 generators + 10 canaries passing per-validator-type
grader-mutation; ≥10 public preview worlds; difficulty sweep on one cheap + one
frontier model produces two visibly different horizon curves.

**100x verifiers:**
- **Generator determinism:** same seed + knobs → byte-identical world-state hash,
  tested across 100 seeds per world. Non-deterministic worlds can't support paired
  seeds or replication.
- **Difficulty knobs proven monotone.** For a reference model, measured pass rate is
  non-increasing in each difficulty knob (published curve per knob per world). A knob
  that doesn't move the pass rate is decoration; it gets fixed or removed. This is
  the empirical proof that "horizon curves" measure difficulty and not noise.
- **Discrimination power as a suite-level gate.** The suite ships only when a cheap
  model and a frontier model produce 80%-reliability horizons separated beyond
  overlapping CIs on a majority of worlds. A suite that can't separate deepseek-v4-flash
  from Fable 5 cannot separate GPT-6 from GPT-7.
- **Mutation-kill rate 100%, per validator type.** Every one of the 15 validator
  types has grader-mutation fixtures asserting the *intended failure reason*, and the
  kill rate is published. One number, externally checkable: "we fed the graders N
  deliberately-wrong submissions; all N failed for the right reason."
- **The red-team ledger.** A logged adversarial session per world: a human (or a
  frontier model prompted to cheat) tries to pass each validator with a
  wrong-but-plausible artifact. Every attempt is recorded; every success patches the
  validator and adds a mutation fixture. The ledger is published with the suite —
  "here is everyone who tried to fool the graders, and what happened."
- **NAU triple sanity on every world:** gold artifact scores NAU=1.0, no-artifact
  scores 0.0, and a deliberately sabotaged artifact scores <0. Asserted in tests,
  proving the utility scale is anchored at both ends and can detect harm.

### WS3 — Human anchoring (weeks 3–10, ops-heavy; start recruiting in week 1)

This is the slowest external dependency, so it starts immediately even though it
lands late.

- **Timed expert baselines:** ≥3 distinct experts per holdout world at a fixed
  difficulty anchor (the 80%-model frontier of the previous quarter is a natural
  anchor). Protocol already written (`docs/timed-expert-baseline-protocol.md`);
  computation already built and gating headline eligibility
  (`runner/lib/human-baselines.mjs`, `HUMAN_BASELINE_MIN_N=3`). What's missing is
  purely recruiting + payment + scheduling: budget ~30 expert-sessions (10 worlds × 3),
  domain-matched (a designer for design-tokens, an accountant for reconciliation).
- **Operator calibration (P2):** run blind human operator reviews against grader
  verdicts through the existing instruments (`runner/lib/operator-calibration.mjs`,
  `runner/record-operator-review.mjs`); publish agreement (Cohen's κ) per domain.
  `loop-demo.mjs`'s 0.33→1.00 agreement climb is currently synthetic — replace it
  with real operator data. Target κ≥0.7 before any grader is used in a headline.
- **Retire every estimated human number.** Until measured baselines exist, the
  60–81× `vs_human_speedup` figures move behind an `estimated:true` flag and out of
  any headline surface. Nothing invites a takedown like an estimated 81×.

**Exit criteria:** ≥3 real baseline records per holdout world in `results/`;
published κ per domain; zero estimated human numbers in headline-eligible surfaces.

**100x verifiers:**
- **Humans graded by the same oracle.** Every baseline session produces the actual
  human work product, and that artifact runs through the *same validator bundle and
  production gate* as model submissions. Human scores are validator outputs, not
  self-reports — which makes "vs human" an apples-to-apples claim and makes
  fabricated baselines structurally impossible (a fake record has no artifact that
  passes provenance).
- **Blindness enforced by ordering, verified by timestamps.** Operator reviews are
  recorded before grader verdicts are revealed; the session log's timestamp order is
  checked mechanically. κ computed on unblinded reviews is inadmissible.
- **Published human failures.** The report includes worlds humans failed or timed out
  on, with rates. Humans failing is evidence the worlds are hard and the humans are
  real; a baseline set where every expert aces every world is a tell of soft worlds
  or soft protocol.
- **Eligibility gate proven to bite:** the existing `HUMAN_BASELINE_MIN_N=3` gate has
  a negative-control test — a bundle with 2 baselines on one world must be classified
  non-headline-eligible by the publication classifier.
- **Distinct-human attestation:** identity-hashed expert ids, ≥3 distinct hashes per
  world, disclosed compensation and recruitment channel in the methodology — the
  fields a skeptical reviewer checks first.

### WS4 — Unify the product↔benchmark quality contract (weeks 4–10, private repo)

The loop is currently loose: the product's four-lens gate
(`lib/server/quality/lensStack.ts`, 0.85 threshold in `lib/artifacts/evals.ts`) and
the benchmark's acceptance path (`lib/evals/benchmark/scoring.ts` +
`outputContract.ts`) are separate validators. Undeniability requires the claim "the
benchmark measures the real product bar" to be *mechanically* true.

- **One acceptance schema, two consumers.** Promote the benchmark's versioned
  acceptance schema (`runner/lib/acceptance-schema.mjs` semantics) to a shared package
  in the orgx monorepo; both the product's measured lens and the benchmark's
  production gate resolve checks from it. A threshold change is one semver'd delta
  visible in both.
- **Run the loop on real data:** human overrides in production re-derive checks
  (product→benchmark); benchmark-discovered failure modes add gates
  (benchmark→product), each a sourced changelog entry. This is the "quantified taste"
  story made auditable.
- **P3 shadow replays:** feed sanitized real initiatives through
  `runner/lib/initiative-replay.mjs`. This is the external-validity answer to "your
  worlds are synthetic" — publish the correlation between world scores and replay
  scores.
- **Gate v3.0 as a measured arm.** `lib/server/gate/verifyOnTheEdge.ts` (regime-aware,
  budget-bounded — already derived from our findings) becomes an explicit arm in the
  holdout sweep, with the rescue/harm ledger from `mission-metrics.mjs`. The uplift
  claim becomes: *on the borderline band, verify-on-the-edge rescues X% (CI) at Y×
  tokens, with zero regressions on the reliable band* — narrow, mechanistic, and
  defensible, per the Phase-2–4 synthesis.

- **Benchmark Lab becomes the truth surface, not a scorecard.** The Lab UI (run
  routes + `lib/evals/publication/buildPublicBundle.ts`) shows the funnel —
  `Started → Process-safe → State-correct → Artifact-valid → Consumer-successful →
  Human-accepted → Robust-after-perturbation` — and every run detail exposes: the
  exact model/run manifest it executed under, split status, per-world failures with
  validator evidence, cost/usage provenance, artifact links, receipt hash, human
  baseline comparison, and **why the run is or is not publishable** (the WS0 label,
  with the failing contract clause named). A run whose own detail page argues against
  its publishability is the strongest possible honesty signal.
- **Non-vacuous CI.** Required checks before any benchmark/publication-touching
  merge in orgx: type-check, focused benchmark tests, the world validator, the public
  bundle validator, a dirty-worktree/provenance check, and a cost-telemetry
  completeness check. Live eval smoke stays **non-required until provider secrets
  are real in CI** — a green from a missing-key skip and a red from a missing key are
  both misleading; a vacuous required check is worse than none.

**Exit criteria:** one schema version stamped on both a production artifact verdict
and a benchmark gate result; ≥20 sanitized replays scored; Gate v3.0 arm results with
CIs on the full holdout; Lab run pages showing manifest + funnel + publishability
reason.

**100x verifiers:**
- **The threshold-change drill.** Bump one check's threshold in the shared acceptance
  package; within one release, the same semver delta must appear in a production
  artifact verdict AND a benchmark gate result, mechanically diffed. This is the
  one-schema-two-consumers claim demonstrated, not diagrammed.
- **No unsourced deltas.** A CI check over the acceptance-schema changelog: every
  threshold/check delta must link to either a human override id (product→benchmark)
  or a benchmark finding id (benchmark→product). An unsourced delta fails the build.
  This makes "quantified taste" auditable line by line.
- **Replay correlation published with its CI.** World-score vs shadow-replay-score
  correlation on ≥20 real sanitized initiatives, with the interval. If the
  correlation is weak, we say so — that's the external-validity number, whatever it is.
- **Lab honesty e2e test.** A deliberately unpublishable run (seeded fixture) must
  render a run page naming the exact failing contract clause. The truth surface is
  proven to tell the truth about failures, not just successes.
- **Revert-a-fix CI drill.** Reintroduce one known construct bug (from the WS0 list)
  on a branch; the required checks must go red. A CI gate that never caught a real
  regression is unproven — this drill proves each gate at least once, on record.

### WS5 — External verifiability (weeks 8–14, private repo builds, public repo publishes)

- **Sealed-validator submission API.** New surface (nothing exists today — the
  handshake/probe routes under `app/api/evals/benchmark/` are internal control-plane
  hooks): an outside party requests episodes (world id + seed + difficulty), runs
  their own agent against a hosted world-state service (tool calls in, observations
  out — fixtures and validators never leave), submits the transcript, receives a
  signed scorecard. Reuse the shared-secret auth pattern
  (`lib/server/auth/benchmarkCloudAuth.ts`) upgraded to per-party API keys. Rate-limit
  and log per key — submission access is also a holdout-probing channel; canary worlds
  and per-key anomaly detection are the defense.
- **Preregistration.** Before the frontier sweep, publish the protocol: worlds
  (by hash), models, n, k values, difficulty schedule, metrics, exclusion rules —
  extending the existing precedent (`docs/uplift-protocol-preregistration-2026-06-12.md`).
  Deviations get documented, not silently absorbed.
- **Third-party replication.** Invite one external group (a lab eval team, METR-style
  org, or credible academic) to run ≥2 holdout worlds through the submission API and
  co-publish. One independent replication converts "vendor benchmark" into
  "benchmark."
- **Leaderboard + technical report.** Public leaderboard (models × horizon curves ×
  gate-depth × pass^k × cost-Pareto, every number with a CI and a claim card) and an
  arXiv-style report covering methodology, integrity audits (grader-mutation results
  published), human-calibration κ, and negative findings — including the Phase-1
  "verification loop was net-harmful" result. Publishing the negative result is
  itself credibility: it proves the instrument can say no. Every published bundle
  carries: scorecard, world metadata, run manifest, model manifest, judgments where
  applicable, aggregate hidden-world stats, exclusion reasons, the loss registry,
  cost-comparability status, signed receipt hashes, and methodology version.

**Exit criteria:** one external party has scored a run without seeing a fixture;
preregistration hash committed before sweep; report draft complete.

**100x verifiers:**
- **Information-leak audit of the sealed validator.** An automated diff between the
  full corpus of submission-API responses and the holdout fixture/validator corpus:
  no fixture bytes beyond legitimate tool observations ever leave. Run on every
  release; a seeded leak fixture proves the audit fires.
- **Preregistration proven by git, not promise.** The protocol hash's commit
  timestamp strictly precedes the first sweep run's launch timestamp (both are
  machine-readable); the report links the two. Any protocol deviation appears in an
  enumerated deviations section — an empty deviations section with a changed
  protocol is checkable and therefore falsifiable.
- **Replication with disagreement handling.** The external party's independently-run
  numbers land within our CIs, co-signed — and if any don't, the discrepancy is
  published with a root cause, not reconciled off the record. A replication with
  zero friction reads as staged; the discrepancy log is what reads as real.
- **The leak drill.** Simulate a burned world: run an agent whose prompt contains
  holdout world text; per-key anomaly detection + canary divergence must flag it.
  Timestamped drill record published. This proves the contamination tripwires work
  *before* we need them against a real leak.
- **Stranger reproduction test:** someone outside the org, given only the public
  repo, recomputes every published headline number from bundle files with
  `validate-bundle` and matches to the digit — done once per release by an actual
  outsider, named (with consent) in the release notes.

### WS6 — Frontier sweep + headline release (weeks 10–14)

- **The sweep — full arm matrix, not just models.** Models: {GPT-5.5 / GPT-5.1-high,
  Claude Fable 5, Claude Opus 4.8, Gemini 3, DeepSeek v4-pro, Fugu-Ultra} ×
  capability-adaptive difficulty × n≥8 × k up to 32 on saturated settings, all
  through the pinning-enforced lane with full cost telemetry. Arms per model:
  **raw** / **raw + best-of-N** / **raw + reflection** (the compute-matched nulls) /
  **a common open agent scaffold** (the "is OrgX better than free glue code" control)
  / **OrgX full** / **OrgX-minus-verification** / **OrgX-minus-memory-provenance** /
  **OrgX-minus-approval-gate** (the ablations that make the uplift claim *causal* —
  attributable to named control-plane mechanisms, not a friendly eval) / **timed
  humans** (from WS3). Budget it explicitly — this is the biggest compute line item
  in the plan; adaptive escalation from WS2 keeps it affordable, and ablations can
  run at reduced n on a holdout subset.
- **Headline artifacts:** reliability-horizon curves (50%/80%), gate-depth curves,
  capability-vs-reliability rank divergence (pass@k vs pass^k), cost-Pareto frontier,
  **cost per accepted work product**, NAU distribution (including the
  harmful-artifact tail), **human rework minutes and clarification burden** where
  operator data exists, perturbation-survival rate, a failure taxonomy, and
  Gate-v3.0 uplift on the borderline band. Every bundle ships the loss registry and
  exclusion reasons per the WS0 contract. All gated through the existing
  publishability classifier (`lib/evals/publication/gatingCheck.ts`) —
  `do-not-publish` verdicts are respected, full stop.
- **Standing cadence thereafter:** new frontier model → config-only rerun within a
  week of API availability; quarterly canary rotation + difficulty-range review;
  acceptance-schema deltas published with each release. Being *first* with credible
  GPT-6 agentic-work numbers is the moment this benchmark becomes the reference —
  the entire plan exists so that rerun is one config line.

**Exit criteria:** public leaderboard live with ≥5 frontier models, every headline
number carrying n, k, CI, cost, and a claim card; at least one externally-replicated
row.

**100x verifiers:**
- **The accounting identity.** For every bundle:
  `count(launched runs) = count(scored runs) + count(loss-registry entries)`, checked
  by the bundle validator against the runner's launch log. If the identity doesn't
  hold, the bundle doesn't ship. This single equation is the anti-cherry-picking
  proof — nothing launched can vanish.
- **Every number traces to receipts.** Click any leaderboard cell → run manifest →
  model manifest → receipt hashes → recomputable from published files to the digit.
  Verified per release by the WS5 stranger-reproduction test.
- **Ablation claims bounded by their CIs.** A mechanism claim ("verification adds X
  on the borderline band") ships only where full-vs-ablated CIs don't overlap; where
  they overlap, the claim card says "not established." A published "not established"
  on one of our own mechanisms is the strongest tell the instrument is honest.
- **Negative results in the headline post itself** — not an appendix. The Phase-1
  "our verify loop was net-harmful" lineage continues: each release names at least
  the worst finding about our own system that the data supports.
- **The 7-day rerun, measured.** When the next real frontier model API lands, the
  timestamped gap between API availability and published leaderboard row is itself a
  reported number. That cadence — not any single score — is what makes the benchmark
  the standing reference for GPT 6/7/8.

---

## 4. Sequencing and dependencies

```
wk:  1  2  3  4  5  6  7  8  9  10 11 12 13 14
WS0  ██ ██                                        (blocks WS2 templates)
WS1  ██ ██ ██ ██                                  (blocks WS6 sweep)
WS2        ██ ██ ██ ██ ██ ██                      (blocks WS3 anchors, WS6)
WS3  ░recruit░ ██ ██ ██ ██ ██ ██                  (blocks headline eligibility)
WS4              ██ ██ ██ ██ ██ ██                (blocks "real bar" claim)
WS5                       ██ ██ ██ ██ ██ ██       (blocks "undeniable")
WS6                             ██ ██ ██ ██ ██    (the release)
```

Critical path: **WS0 → WS2 → WS6**, with WS3 recruiting started in week 1 because
humans, not code, are the long pole. WS1 runs parallel and must land before the sweep.

## 5. Top risks

1. **Human-baseline recruiting slips** → headline eligibility slips with it. Mitigate:
   start week 1; pay well; domain-matched experts are the constraint, not protocol.
2. **Sweep cost.** Frontier models × n≥8 × adaptive difficulty is real money. Mitigate:
   adaptive escalation (no episodes wasted on saturated settings), cheap-model
   difficulty calibration first, per-cell budget caps in the runner.
3. **Holdout leakage via the submission API.** Mitigate: per-key rate limits + logging,
   canary worlds as tripwires, quarterly rotation, burned-world protocol.
4. **Provider-pinning refactor destabilizes the live lane.** Mitigate: `pinning_violated`
   is fail-loud (never silent substitution), so regressions surface as failed benchmark
   runs, not corrupted headlines.
5. **Scope creep in WS4.** The unified schema is one package + two consumers, not a
   quality-platform rewrite. Timebox it.

## 6. What we explicitly do NOT do

- No new scalar "OrgX score." The funnel + curves are the product; a single number
  invites gaming and saturates.
- No LLM judges promoted back into headline scoring. They stay narrow, hardened,
  behind the ≥70% deterministic-share contract, with published κ.
- No headline from anything but the private holdout with measured human baselines —
  the existing README discipline ("none of the current bundles are headline-eligible")
  holds until WS3+WS6 land.
- No estimated human comparisons anywhere a journalist might quote.
- **No claiming "SOTA" by assertion.** Public copy says: here is the contract, here
  are the validators, here are the baselines and ablations, here are the losses and
  exclusions, here is how to reproduce the public slice. The reader concludes SOTA;
  we never write the word about ourselves.
- No silent omission of failed or lost runs — the loss registry is part of every
  bundle, or the bundle doesn't ship.
