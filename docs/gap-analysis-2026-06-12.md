# Gap analysis — benchmark + OrgX execution harness (2026-06-12)

Produced during the first cross-provider verification run: the full public
catalog executed on the OrgX agent surface, then scored by an independent
DeepSeek judge panel served through OpenRouter, head-to-head against the
published `gpt-5-nano` baseline bundle.

Run provenance:

- OrgX initiative: `d9a4a8d2-30ad-41ae-b872-05735cd77043` (workspace `7af01a51`)
- New bundles: `results/orgx-agent-surface-full-20260612`,
  `results/local-openai-gpt-5-nano-deepseek-judge-20260612`
- Pairwise report: `results/orgx-agent-surface-full-20260612/pairwise-vs-gpt-5-nano.json`
- Blocked cloud-lane runs: `ac3d0679`, `695a9bf8`, `6afec457`

## Headline result

| Metric | OrgX agent surface | gpt-5-nano baseline |
| --- | --- | --- |
| Catalog coverage | 15/15 tasks | 12/15 tasks |
| Autonomous completion | 100% | 100% |
| DeepSeek absolute rubric (mean) | 100.0 | 98.94 |
| DeepSeek pairwise preference | **12/12 task wins, 71/72 votes** | 0 wins, 1 vote |
| Human-review flag rate | 0.33 | 0.58 |
| Judge disagreement (mean pts) | 4.11 | 5.89 |
| vs human quality delta | +11.73 | +11.36 |

The absolute rubric barely separates the two systems; pairwise preference is
unambiguous. That contrast is itself the most important benchmark finding
(gap B1).

## A. Gaps in the OrgX execution harness (observed live)

**A1. Cloud job runner has a hard OpenAI dependency that ignores provider
pinning.** Three dispatches — default routing, `provider=anthropic` +
`sdk_backend=claude`, and `provider=openrouter` — all resolved
`claude-opus-4-6` and all failed with OpenAI `insufficient_quota` inside
`trigger_agent_job_runner`. A run whose resolved model is Anthropic should not
die on an OpenAI billing error; either the runner uses OpenAI for a mandatory
internal step or the router falls through silently. This converts one vendor's
billing state into a full platform execution outage.

**A2. No dispatch-time preflight on known-bad credentials.** Each failed
attempt was accepted with "Task assigned… will begin working shortly," even
after the identical failure had been recorded twice in the previous ten
minutes. The quota state is checkable at dispatch; the blocker should surface
in the spawn response (`blockedReason`), not minutes later as an artifact.

**A3. Failed/queued runs are invisible to the status surfaces.**
`get_agent_status` reported all agents idle with zero queued runs while three
runs were queued/failing; `orgx_inspect type=task <returned task_id>` returned
"No task found." The only way to discover the failures was a full-text
`orgx_search type=artifact` for `structured_blocker` artifacts. The dispatch
surface and the observability surfaces disagree about what exists.

**A4. `orgx_write` contract drift (initiative create).** Four sequential
validation failures were needed to create one initiative: (1) client schema
allows `priority: high`, server demands portfolio labels
(critical/active/maintenance/hold) — and the client enum rejects those, so
priority is unsettable; (2) tool docs claim `"active" → "in_progress"`
normalization, but the server rejects `in_progress` and requires `active`;
(3) `workspace_id` required even with a bound session; (4) errors surface one
at a time instead of as a single validation report.

**A5. `orgx_spawn action=spawn` cannot satisfy its own router.** It routes to
`spawn_agent_task`, which requires an `agent` field that `orgx_spawn`'s schema
does not expose (`agent_type` is not accepted as a substitute). Ad-hoc spawn
through the v2 tool is therefore broken; only the legacy
`delegate_agent_task`/`spawn_agent_task` path works.

**A6. Budget preflight is non-informative.** `action=estimate` returns
`estimated_cost_usd: null`, `candidate_count: 0`, and no candidate routes, so
`max_cost_usd` enforcement and cheapest-valid routing have nothing to act on.
Tier classification also flip-flopped (sonnet → opus for near-identical
content).

**A7. No per-run usage/cost telemetry over MCP.** Completed and failed runs
expose no token counts or cost via the MCP surface (failed-run retros report
`costCents: 0, tokenCount: 0`). The benchmark's generation-cost column for
live-product runs is therefore empty (see `validate-bundle` warning).

## B. Gaps in the benchmark itself

**B1. Absolute rubric saturates (ceiling effect).** Median-of-judges criterion
scoring pins at 100 for any competent frontier output: the OrgX run scored a
flat 100.0 on all 15 tasks and the nano baseline 98.94. The catalog criteria
("includes a positioning statement", "includes a CTA strategy") test presence,
not excellence. Mitigation shipped in this change: pairwise preference mode
(`runner/compare-bundles.mjs`) with both-orderings position-bias control —
which separated the systems 12/12. Absolute scores should be reported alongside
pairwise results until Initiative Worlds replaces rubric scoring with
deterministic validators.

**B2. Judge monoculture and correlated failure.** The default public panel is
three OpenAI models judging (historically) OpenAI artifacts — a self-preference
risk and, as this run proved, a correlated availability risk: one OpenAI quota
exhaustion took out generation *and* the entire judge panel. Mitigation
shipped: provider registry + `--judge-preset deepseek` cross-provider panel.

**B3. Published baseline bundle drifted from the catalog.** The headline
baseline covers 12/15 tasks (all three newer design tasks missing) and 1
repeat despite `repeatCount: 3` in the task specs. Comparisons against it
silently under-cover the catalog.

**B4. No import path for live-product runs (now fixed).** The repo told users
to "run it in OrgX," but nothing could turn a live OrgX run into a public
bundle, so the flagship lane produced no auditable artifacts. Mitigation
shipped: `runner/import-live-run.mjs` + judged via the standard pipeline.

**B5. Self-reported scores ride along in judged bundles.** `examples.json`
keeps `scoringSource: self_reported` rows from the generator; downstream
consumers can mistake them for judged scores if they read examples rather than
tasks.json aggregates.

**B6. Single-repeat runs with no variance treatment.** All current bundles are
n=1 per task; strict mode correctly fails them, but the public index does not
distinguish smoke-grade from publish-grade weeks at a glance.

**B7. `vs_human_speedup` conflates wall-clock regimes.** Agent runs execute in
parallel waves while human baselines are serial estimates; the headline 38x/131x
numbers are not comparable across bundles with different concurrency. The
metric needs a per-run definition (it currently sums durations across runs).

**B8. Contamination exposure.** Catalog prompts are OrgX-themed and public;
generator models (and the OrgX agent pack, which carries OrgX domain skills)
have privileged familiarity. `contaminationRisk` is annotated but does not
discount scores. Initiative Worlds' hidden evaluator truth is the real fix.

**B9. Live-lane runs lack token/cost generation telemetry** (consequence of
A7) — `cost_per_task_cents` for the OrgX bundle reflects judging only.

## C. What shipped in this change (mitigations)

1. `runner/lib/providers.mjs` — provider registry (OpenAI Responses API,
   OpenRouter + DeepSeek chat-completions), normalized usage accounting,
   provider-reported billed cost.
2. Judge specs now accept `[provider:]model[:effort]` and a `deepseek` preset
   (`deepseek-v4-flash:low`, `deepseek-v3.2:medium`, `deepseek-v4-pro:high`).
3. `runner/judge-bundle.mjs` / catalog runner / bundle writer are
   provider-aware end to end (metadata.providers, judgePanel provider,
   per-provider key validation).
4. `runner/import-live-run.mjs` (`npm run import:live`) — live-product runs
   become standard bundles, judged by the same pipeline as API runs.
5. `runner/compare-bundles.mjs` (`npm run compare:bundles`) — pairwise
   preference judging with dual-ordering position-bias control and
   consistency-gated vote aggregation.
6. Generation lane is provider-aware too: `--provider openrouter --model
   deepseek/deepseek-v3.2` runs the full catalog on DeepSeek. The resulting
   bundle (`results/deepseek-v3.2-full-20260612`) is the first to validate
   with zero warnings, because the chat lane returns billed cost telemetry
   (partially mitigates B9 — the live-product import lane still lacks it).

## E. Three-way ordering (added after the DeepSeek generation run)

Same protocol, all pairwise, dual-ordering, consistency-gated:

| Matchup | Judge panel | Task verdicts | Raw votes |
| --- | --- | --- | --- |
| OrgX vs DeepSeek v3.2 | DeepSeek ×3 | **OrgX 15/15** | 88–2 |
| OrgX vs DeepSeek v3.2 | Claude sonnet-4.6 ×1 | **OrgX 15/15** | 30–0 |
| DeepSeek v3.2 vs gpt-5-nano | DeepSeek ×3 | **DeepSeek 6, tie 5, nano 1** | 47–18 (7 tie) |
| OrgX vs gpt-5-nano | DeepSeek ×3 | **OrgX 12/12** | 71–1 |

Ordering: **OrgX agent surface ≫ DeepSeek v3.2 > gpt-5-nano.** The OrgX
sweep holds under both a DeepSeek judge panel (judging its own vendor's
artifacts) and an independent Claude judge — robust to self-preference bias in
either direction. DeepSeek v3.2 beats the nano baseline only narrowly, which
locates most of OrgX's margin in the orchestration/agent-pack layer rather
than raw model strength.

## G. Uplift evaluation v1 (pre-registered; null result published)

See [uplift-results-2026-06-12.md](uplift-results-2026-06-12.md). Same base
model both arms (claude-fable-5). Raw frontier model saturated 5/6 hard-tier
tasks (admission ladder working as designed); on the single admitted task the
raw arm won the pairwise; overall 2-2-2. New gaps: the verification gate's
"preparatory work" clause causes scope creep on refusal-correct tasks (gate
v1.1 fix specified), and single-artifact tasks structurally cannot show
orchestration uplift — the next rung must measure horizon (Initiative
Worlds), not harder prose.

## H. Cheap-mode uplift replication (2026-06-13)

See [uplift-results-cheap-mode-2026-06-13.md](uplift-results-cheap-mode-2026-06-13.md).
Same cheap base model (deepseek-v4-flash) both arms, gate run as code. First
measured absolute uplift (+7.8 strict mean, raw 70.97 -> gate 78.75); 5/6
tasks admitted (real headroom). Pairwise still failed (gate 2/5 admitted)
because the reviser over-edits already-strong artifacts and the cheap auditor
cannot detect unanswerability. Plus a benchmark-integrity finding: on the
hardest arithmetic task the DeepSeek panel contradicted itself between
absolute and pairwise framings while BOTH arms had the correct answer —
hard tiers need deterministic answer-key validation, not LLM judging. Also
hardened both runners so one task's failure no longer rejects the whole batch.

## F. Hard-tier pilot (addresses B1; same day)

`catalog/tier3/` + strict grading shipped and ran on three systems — see
[tier3-hard-pilot-2026-06-12.md](tier3-hard-pilot-2026-06-12.md). Outcome:
hidden-criteria planted traps de-saturate mid-tier models (v3.2: 99.5 → 90.2
with a 70.7 floor), reasoning models still clear single-hop arithmetic traps
(v4-flash absolute 100), pairwise remains the top-end discriminator (OrgX 6/6
hard tasks, 33–3 votes). New grader gap found: per-criterion **median**
aggregation lets two lenient judges outvote one strict judge — strict tiers
need mean/min aggregation or pairwise headline reporting.

## D. Recommended next fixes (not in this change)

- OrgX runner: honor provider pinning end-to-end; add dispatch-time credential
  preflight; reconcile `get_agent_status`/`orgx_inspect` with the run queue;
  fix the `orgx_write` initiative enums and `orgx_spawn` agent routing; expose
  per-run usage over MCP.
- Benchmark: re-run the OpenAI baseline at 15/15 × 3 repeats once quota is
  restored; report pairwise preference as the headline comparison metric;
  label smoke-grade vs publish-grade bundles in `results/index.json`; add an
  Anthropic provider lane to the generation runner for a three-vendor matrix.
