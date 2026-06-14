# OrgX-Bench v2 + OrgX capability — research-grounded program plan

Supersedes the phase detail in `docs/v2-program-plan.md`. This version is
re-underwritten against a 2025–2026 deep dive of Anthropic, OpenAI, and
academic/frontier agent research (sources at the end). The philosophy
(`docs/measurement-philosophy-v2.md`) is unchanged; the *evidence* now tells us
exactly which metrics, which OrgX upgrades, and which sequencing actually move
the needle — and several of this session's empirical findings turn out to be
named, replicated phenomena, which raises confidence in the direction.

## What the research changed (the load-bearing updates)

1. **Reliability, not pass@1, is the headline.** τ-bench's **pass^k** (all k
   trials succeed; a 90% pass@1 model is ~57% at k=8) and the 2025–26
   reliability-science work ("capability rank ≠ reliability rank") say the
   orchestration layer's real value is *consistency over a long horizon*. We
   measure pass^k and horizon, not mean quality.

2. **Token usage is the dominant confound.** Anthropic: ~80% of agent
   performance variance is explained by token usage; multi-agent burns ~15× a
   chat. Every uplift number must be **normalized to quality-per-token / a
   cost–accuracy Pareto** (Holistic Agent Leaderboard), or we are measuring
   spend, not orchestration.

3. **METR time-horizon is the saturation-proof frame.** Express uplift as a
   *horizon shift* — "the loop extends the base model's 50%/80%-reliability
   task duration from X→Y." The y-axis is open-ended human time, so it never
   saturates; you just add longer jobs.

4. **Agent↔grader isolation is now table stakes, not polish.** The Apr-2026
   exploit audit drove WebArena→~100%, OSWorld→73%, SWE-bench→100% *without
   solving anything* (reading gold files via `file://`, `conftest.py` hooks,
   prompt-injecting the judge). Validators, answer keys, and judge prompts must
   be physically unreachable by the agent's tools/sandbox.

5. **Self-correction only works with grounded feedback** — and this names our
   own bug. "LLMs Cannot Self-Correct Reasoning Yet": *intrinsic* self-review
   degrades output. Our gate over-edited a clean artifact for exactly this
   reason. The fix is to wire the verifier to **verifiable signals**
   (deterministic checks, dry-runs, schema/constraint validation, receipts),
   never "double-check your reasoning."

6. **Multi-agent is contested — parallel reads win, writes stay
   single-threaded.** Anthropic (orchestrator-worker beats single-agent 90%
   on breadth research) and Cognition ("Don't Build Multi-Agents": single
   writer, no dispersed context) are *both right in their domain*. OrgX should
   fan out parallel research/read workers but keep writes behind one authority
   that owns receipts/approvals.

7. **Decomposition + restart-at-boundary is the #1 reliability intervention.**
   Splitting a long task into bounded sub-tasks and *restarting the worker with
   clean compacted context at each boundary* kills state drift (the silent
   compounding-error failure mode). This is exactly OrgX's IWMT tree with
   receipts as checkpoints.

8. **The baseline must be a *best-effort single-agent-with-tools*, not naked
   generation.** Both labs say "start single-agent, add agents only when
   forced." If our raw control arm is one generation, we inflate uplift. The
   honest control is a competent ReAct/tool loop on the same model.

9. **Receipts/approvals/blockers are technically load-bearing.** Across the
   research they are simultaneously: the external verifier that makes
   self-correction work (#5), the sub-task boundaries that enable
   restart (#7), the single-writer authority that prevents the multi-agent
   failure mode (#6), the search-budget triggers for test-time compute, and the
   episodic-memory + checkpoint substrate for resume-from-failure. OrgX's
   governance layer is the moat — if it is made *true and verifiable*.

## Revised measurement stack (Track A)

| Layer | What it scores | Method (research basis) |
| --- | --- | --- |
| **Outcome** | goal reached | deterministic end-state check in an isolated sandbox (τ-bench, WebArena, SWE-bench-Verified) — never an LLM judge where a state check is possible |
| **Process / trajectory** | right delegation, handoff timing, tool choice, guardrail firing | trajectory grading off the WEG (OpenAI agent-evals; PRM > ORM; "Agent's GPA") |
| **Reliability** | consistency | **pass^k** and long-horizon success (τ-bench; reliability-science) |
| **Economy** | efficiency | **quality-per-token + cost–accuracy Pareto** (HAL); token usage logged on every node |
| **Horizon** | capability frontier | **50%/80% time-horizon shift** raw→OrgX (METR) |
| **Trust / Judgment** | honesty, escalation, refusal | rubric + reference answer, **cross-provider** masked-pairwise jury, **human-agreement on a sampled subset** (HealthBench pattern); deterministic where checkable (claimed-vs-actual state) |

Triangulation rule unchanged: deterministic Oracle anchors every checkable
claim; LLM judges only for the irreducibly subjective, always cross-provider,
masked, order-randomized, and spot-checked against humans.

## Revised OrgX architecture (Track B) — what to build to exceedingly perform

Each upgrade is now tied to a named result, not intuition:

1. **Grounded verification loop (fixes our over-edit bug).** Gate stages wire
   to verifiable signals — deterministic validators, dry-run execution, schema
   checks, receipt validation — and a **no-regression guard** (preserve every
   correct claim; only add corrections or remove verified errors). Self-review
   without a ground-truth signal is disabled. *(Reflexion + "cannot self-correct
   yet" + our cheap-mode finding.)*
2. **Decomposition + restart-at-boundary with compaction.** Initiatives split
   into bounded sub-tasks; each worker starts with a clean, compacted context
   rehydrated from receipts/progress notes, not chat history. *(Reliability
   science #1 intervention; Anthropic long-running-agent harness.)*
3. **Single-writer governance, parallel reads.** Orchestrator fans out parallel
   read/research subagents (context-isolated, return ~1–2k-token summaries);
   all writes serialize behind the receipts/approvals authority. *(Anthropic
   multi-agent + Cognition single-writer.)*
4. **Code-as-action over the MCP surface.** Expose OrgX's 29+ MCP tools as a
   typed code API with **tool search + deferred loading + programmatic
   calling**; the orchestrator scripts across domains and filters in the
   execution env. *(Code execution with MCP: 150k→2k tokens; Advanced Tool Use:
   85% token cut. Directly attacks the token confound in #2.)*
5. **Confidence-gated test-time compute.** Spend extra reasoning/search budget
   only at high-uncertainty, high-stakes, or irreversible steps (blockers,
   approvals, branch points); run the routine 90% cheaply. *(CATTS: +9.1% at
   2.3× fewer tokens vs uniform scaling.)*
6. **Trust ledger.** Claimed state must reconcile against actual/validator
   state (no false completion); every receipt links to a checkable
   artifact/diff/test; approval boundaries enforced. *(HealthBench safety
   criteria; the dimension that does not saturate.)*
7. **Calibrated check-in / judgment layer.** Explicit deliver / iterate /
   escalate / refuse decision, with missing-input detection and
   stop-when-good-enough; check-in rate should rise with task complexity as a
   measured behavior. *(Anthropic calibrated autonomy; OpenAI HITL thresholds;
   our refusal-task finding.)*
8. **Cross-run memory (instrument, don't assume).** Receipts as episodic
   memory; consolidate recurring patterns (who-approves-what, domain SOPs) into
   semantic memory reused across initiatives — flagged as a maturing capability,
   measured rather than claimed. *(MemGPT/Mem0 proven; self-improving memory
   promising-not-proven.)*

## Re-underwritten phases

### Phase 1 first-run result (2026-06-13) — instrument built, OrgX loop caught net-harmful
See [phase1-instrumented-worlds-results-2026-06-13.md](phase1-instrumented-worlds-results-2026-06-13.md).
The deterministic, isolated, pass^k, token-normalized instrument is built and
ran across 5 worlds. Finding: cheap reasoning model + tools **saturates single
jobs** (both arms pass^k=1.0 on 4 worlds, OrgX +0 quality at 2.25–4× cost), and
the reflexive verification gate **induced 2/8 failures** on the long-horizon
world that the raw arm passed 8/8 (pass^k 1.0→0). This forces **Gate v2.0**:
verification fires only on a *detected* tool-grounded inconsistency, is
step/token-budget-bounded, and has a hard no-regression guard (can never lower a
validated answer). It also confirms uplift cannot come from single-job
execution quality — only from multi-session state, coordination, trust, and
portfolio economy, which need the next instruments.

### Phases 2–4 first-run results (2026-06-14) — orchestration value is a narrow band
See [phase2-4-orchestration-regimes-2026-06-14.md](phase2-4-orchestration-regimes-2026-06-14.md).
Built and ran three interventions × two model strengths. **Gate v2.0**
(no-regression draft fallback) shipped — restores horizon pass^k 0→1.0, harm
removed, but +0 value at 2.4× cost on saturated tasks. **Restart-at-boundary**
shipped — aces the hard sequential reasoning (revenue + backorder set perfect
8/8) but introduces seam-aggregation errors (count drift) → 1/8; decomposition
trades one failure mode for another. **Model sweep** (llama-3.1-8b) found the
program's first positive uplift: on a *borderline* task the gate doubled pass
rate (0.17→0.33); no-op where the model is reliable, wasted where hopeless.
Synthesis: orchestration helps only in the borderline-capability band; a
regime-aware loop (verify only on the edge) is the next directive.

### Phase 0 — done (foundation)
Cross-provider judging, pairwise with position-bias control, strict graders +
mean aggregation, hidden-criteria hard tier, the uplift harness, per-task
failure isolation. Plus the three findings that the research now corroborates
(model-not-orchestration, grounded-vs-intrinsic correction, judge unreliability
on arithmetic).

### Phase 1 — Instrumented world + honest baseline + reliability metrics
**Objective:** one Initiative World scored on the revised stack, with a *fair*
control arm.
- Build one seeded world: tool fixtures (DB/API/FS the harness owns and asserts
  against, **in a sandbox the agent cannot read gold/config from** — exploit-audit
  defense), a dependency DAG (≥3 tasks, B consumes A's *verified* output), one
  injected blocker requiring recovery/escalation, a budget ceiling.
- Build the **WEG recorder** (both arms emit one node/edge/state/token schema)
  and **deterministic validators** (Oracle, isolated).
- Build the honest control arm: **best-effort single-agent ReAct + tools** on
  the same base model (not naked generation).
- Metrics: pass^k (run each arm k≥5×), trajectory grade, quality-per-token, and
  a first horizon estimate; LLM judge only on residual subjective quality.
- **Exit:** a reliability-and-cost uplift readout (raw ReAct vs OrgX) on one
  world, with agent↔grader isolation verified by an attempted-exploit check.

### Phase 1.5 — OrgX harness reliability (prerequisite + Track-B substrate)
Fix the gaps found live this session, which are *also* the technical substrate
above: provider pinning honored end-to-end (A1), dispatch-time credential
preflight (A2), run-state visible to status/inspect surfaces (A3),
`orgx_write` enum drift (A4), `orgx_spawn` agent routing (A5), **per-run
token/cost telemetry over MCP** (A6/A7 — required for the Economy metric and the
token confound). Land code-as-action / tool-search on the MCP surface here
(Track-B upgrade #4) since it is the cheapest large win and unblocks the cost
story.

### Phase 2 — Track-B capability build, regression-tested by the matrix
Ship the eight upgrades in dependency order, re-running Phase-1's world after
each as the regression test:
grounded verification loop (#1) → decomposition+restart (#2) → single-writer
parallel-reads (#3) → confidence-gated compute (#5) → trust ledger (#6) →
judgment/check-in layer (#7) → cross-run memory (#8, instrumented).
**Exit:** the over-edit and weak-verifier negatives from cheap-mode are now
neutral-or-positive cells; pass^k and quality-per-token strictly improve vs
the Phase-1 raw baseline.

### Phase 3 — Scale to a saturation-resistant suite
N worlds across domains; **private holdout split** (`worlds/corpus-splits.json`);
ARC-style admission (a world enters only if the raw arm leaves measurable
headroom on ≥1 dimension *at pass^k*); BrowseComp-style "hard-to-solve /
easy-to-verify" authoring; LiveBench-style periodic refresh against
contamination. Published headline = the uplift matrix with pass^k, cost-Pareto,
and a horizon-shift number, plus confidence and divergence flags.

### Phase 4 — Run it inside OrgX, on the frontier
Run the suite through the real OrgX product (now reliable per Phase 1.5) across
base models from cheap to frontier. **Exit / "exceedingly perform":** a
published, held-out uplift matrix showing large confident positive uplift on
Coordination, Trust, Economy, Judgment; neutral (not negative) Outcome;
quality-per-token strictly better than the best-effort raw agentic harness at
equal pass^k; a positive 50%/80% horizon shift; and the whole result
*reproducing as the base model is swapped* — proving the uplift is orchestration,
not model.

### Phase 5 — Continuous co-evolution
Worlds retire publicly as raw models saturate them (at pass^k, not pass@1);
new/longer worlds admitted to push the horizon; OrgX uplift tracked across
model generations. Trust and Coordination stay discriminative as horizons grow,
so the suite ages well by construction. Position in the "reliability science /
beyond-pass@1" frame the labs and standards bodies (MCP → Agentic AI
Foundation; NIST shared benchmarks) are converging on.

## Integrity guardrails (hardened by the research)

- **Agent↔grader isolation** is mandatory and tested (attempted-exploit check
  each phase) — the single biggest credibility risk in 2026 agent benchmarks.
- Private holdout; OrgX developed against a disjoint set; no benchmark text,
  criteria, or keys in any OrgX prompt/router/gate.
- Pre-registration per phase (as practiced this session).
- Cross-provider, masked, order-randomized judging with **human-agreement
  sampling**; deterministic Oracle anchors everything checkable.
- Report token-normalized numbers and the negative/null cells. Raw-quality
  headlines without cost are, per the research, "meaningless."

## Sources (deep-dive briefs, 2025–2026)

Anthropic: Building Effective Agents (Dec 2024); Effective Context Engineering
(Sep 2025); Multi-Agent Research System (Jun 2025); Writing Tools for Agents /
Advanced Tool Use / Code Execution with MCP (Sep–Nov 2025); Effective Harnesses
for Long-Running Agents (Nov 2025); Scaling Managed Agents + Trustworthy Agents
(Apr 2026). OpenAI: A Practical Guide to Building Agents (2025); Agents SDK /
AgentKit / Responses API; Graders + Agent-Evals + Agent RFT; HealthBench (May
2025); Agents-SDK long-horizon/sandbox update (Apr 2026). Academic/frontier:
τ-bench (2406.12045) + τ²-bench (2506.07982); METR Time-Horizon 1.0/1.1; ARC-AGI
-2/-3; BrowseComp (2504.12516); CodeAct (2402.01030); Reflexion (2303.11366) +
"Cannot Self-Correct Yet" (2310.01798); Scaling Test-Time Compute (ICLR 2025) +
CATTS; Cognition "Don't Build Multi-Agents" (Jun 2025); Beyond pass@1 reliability
(2603.29231); benchmark-exploit audit (moogician.github.io, Apr 2026); Holistic
Agent Leaderboard (2510.11977); LLM-judge bias survey (llm-judge-bias.github.io).
Vendor self-reported figures (Anthropic 90.2% / 98.7%, etc.) flagged as not
independently replicated.
