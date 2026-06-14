# OrgX-Bench v2 + OrgX capability program plan

Two things have to be built together: a benchmark that measures the **real
dimensions of work** (not finished documents), and an OrgX execution
architecture that **exceedingly performs** on those dimensions. The benchmark
defines the target; OrgX builds to it; a firewall keeps OrgX winning through
generic capability rather than benchmark knowledge. This plan sequences both.

## 0. Where we are (foundation already shipped this session)

- Cross-provider judging (no vendor grades its own work); pairwise preference
  judging with position-bias control; strict graders with mean aggregation;
  hard tier with planted ground truth + hidden criteria.
- The uplift harness: same-model raw-vs-OrgX, the artifact verification gate
  as code, per-task failure isolation.
- Three findings that scope everything below: (a) artifact tasks measure the
  model, not the orchestration; (b) the gate produces real uplift (+7.8
  cheap-mode) but over-edits already-good work and is only as strong as its
  verifier; (c) LLM judges are unreliable on hard arithmetic — deterministic
  validators are required.

## 1. The two tracks and the firewall

**Track A — Benchmark:** evolve from artifact scoring to the Work Execution
Graph (WEG): seeded jobs, six work dimensions, five evaluation lenses, an
uplift matrix. (Spec: `docs/measurement-philosophy-v2.md`.)

**Track B — OrgX capability:** evolve from "spawn an agent that writes a
document" to a quality-bar-gated, dependency-aware, budget-routed,
trust-instrumented execution loop with an explicit judgment layer.

**The firewall (non-negotiable):** Track B improvements must be
domain-general loop / routing / coordination / trust machinery, provable on a
**private holdout** of worlds the OrgX team never sees during development. No
benchmark task text, criteria, or answer keys may enter any OrgX prompt,
router, or gate. The benchmark proves OrgX; it never trains it. If an
improvement only helps on known worlds, it is gaming and is rejected.

## 2. The map: dimension → how OrgX must improve → how the benchmark measures it

This is the core of the program. Each row is a work dimension; the middle
column is the OrgX architecture change that would let it exceedingly perform;
the right column is the instrument that proves it.

| Dimension | OrgX capability upgrade (Track B) | Benchmark instrument (Track A) |
| --- | --- | --- |
| **Outcome** | Verification gate v1.2: **no-regression reviser** (preserve every correct claim, only add corrections / remove verified errors — never compress a clean section); **asymmetric models** (cheap generate, strong verify). | Oracle answer-key pass + Adversary residual quality, raw vs gate. |
| **Method** (tools, iteration) | **Quality-bar-gated loop**: the agent calls required tools on the critical path and iterates until an internal validator/critic passes OR a budget cap trips — and it knows its own bar (stops when green, not when tired). | Required-tool-call coverage; % of stated numbers actually verified; attempts-to-green; tool fixtures the harness can assert against. |
| **Coordination** | **Dependency-aware dispatch that actually enforces `depends_on`**; **handoff fidelity** (B provably consumes A's *verified* output, not a stale draft); **blocker detection + recovery/escalation that fires** (fixes A3: failed/queued runs invisible; A5: spawn routing broken). | Dependency-order violations; handoff-fidelity validator; blocker-recovery rate; rework cycles read off the WEG. |
| **Economy** | **Working cost estimation + closed-loop routing** to the cheapest model that clears the bar (fixes A6: null estimates; A7: no per-run telemetry). Budget caps that downgrade/escalate before overspend. | $/passing-job; latency-to-bar; quality-per-dollar vs the frontier; Ledger reads cost straight off the run. |
| **Trust** | **Claimed-state == validator-state** (no false completion); **verifiable receipts** (no hallucinated proof — every receipt links to a checkable artifact/diff/test run); **enforced approval boundaries**. | Claimed-vs-actual completion delta; hallucinated-receipt rate; unauthorized-action count; refusal-correctness. Oracle + Ledger. |
| **Judgment** | **An explicit deliver / iterate / escalate / refuse decision layer**: missing-input detection (gate v1.1 + strong auditor), stop-when-good-enough (don't burn budget over-polishing), escalate-when-blocked, refuse-when-unanswerable. | Premature-stop rate; missed-escalation rate; scope-creep (delivered beyond the ask); refusal-correctness. Oracle + Peer. |

The shape of the expected uplift matrix is the product thesis: OrgX should
dominate on **Coordination, Trust, Economy, Judgment** (the orchestration
layer raw models lack entirely), roughly tie on **Outcome** (a wrapper can't
make a frontier model write a better paragraph), and the program's job is to
turn the over-edit / weak-verifier negatives into neutrals.

## 3. Phased delivery

### Phase 1 — One instrumented world, end to end (proof of architecture)
Build a single Initiative World that exercises all six dimensions: tool
fixtures (a seeded DB/API/FS the harness owns and can assert against), a
dependency DAG (≥3 tasks where B consumes A's verified output), one injected
blocker requiring recovery or escalation, and a budget ceiling. Build the WEG
recorder (both arms emit one node/edge/state schema), the deterministic
validators (Oracle, hidden), and the five-lens evaluator + uplift-matrix
reporter. Run raw vs OrgX. **Exit:** a real uplift matrix for one world.

### Phase 1.5 — OrgX harness reliability (prerequisite to running in-product)
Fix the gaps that block running the benchmark inside OrgX at all: provider
pinning honored end-to-end (A1), dispatch-time credential preflight (A2),
run-state visible to `get_agent_status`/`orgx_inspect` (A3), `orgx_write`
enum drift (A4), `orgx_spawn` agent routing (A5), per-run cost telemetry over
MCP (A6/A7). These are also the Coordination/Economy/Trust substrate from §2.

### Phase 2 — OrgX capability build, tested against Phase 1
Ship the Track B upgrades in §2, each validated against the held-out world,
in dependency order: gate v1.2 + asymmetric models (Outcome) → quality-bar
loop (Method) → dependency/handoff/blocker enforcement (Coordination) →
closed-loop routing + telemetry (Economy) → state-truth + receipt validation
(Trust) → judgment layer (Judgment). Re-run the uplift matrix after each;
the matrix is the regression test.

### Phase 3 — Scale to a saturation-resistant suite
N worlds across domains; private holdout split (use `worlds/corpus-splits.json`);
ARC-style admission (a world enters only if the raw frontier arm leaves
measurable headroom on ≥1 dimension). The published headline becomes the
uplift matrix with confidence and divergence flags, never a single number.

### Phase 4 — Continuous co-evolution
Worlds retire publicly as raw models saturate them; new worlds admitted; OrgX
uplift tracked across model generations. Trust and Coordination stay
discriminative as horizons grow, so the suite ages well by construction.

## 4. OrgX architecture changes, in detail (Track B)

1. **Execution loop becomes bar-gated, not fixed-stage.** Today: spawn →
   one artifact. Target: generate → verify → (revise → re-verify)* until an
   internal validator passes or a budget cap trips, with a no-regression
   guard so revisions never degrade a clean section. The loop owns a quality
   bar and a budget and stops on whichever binds first.
2. **Asymmetric, cost-aware model routing.** Cheap generators, stronger
   verifiers; routing closes the loop on a quality bar at minimum cost;
   estimates and per-run telemetry actually populate (today they are null).
3. **Coordination as a first-class runtime.** `depends_on` is enforced (no
   starting B before A's output is verified); handoffs pass verified outputs,
   not drafts; blockers are detected, surfaced to the right surface, and
   trigger recovery or escalation instead of silently stalling.
4. **A trust ledger.** Every claimed state is reconcilable against actual
   state; every receipt links to a checkable artifact; approval boundaries
   are enforced; false-completion and hallucinated-receipt rates are driven
   to zero. This is the differentiator that does not saturate.
5. **A judgment layer.** An explicit decision among deliver / iterate /
   escalate / refuse at each step, with missing-input detection and
   stop-when-good-enough, so OrgX neither over-delivers (the cheap-mode
   over-edit) nor under-delivers (the missed refusal).

## 5. Integrity guardrails

- Private holdout worlds; OrgX developed against a disjoint set.
- Pre-registration of each phase's protocol before its runs (as done this
  session).
- Cross-vendor judging; Oracle anchors every checkable claim; divergence
  surfaced, not averaged.
- Publish the negative and null cells of every uplift matrix. The credibility
  of the positive cells depends on it.

## 6. What "exceedingly perform" means, measured

Success is not "OrgX wins." Success is a **published uplift matrix on
held-out worlds** showing large, confident positive uplift on Coordination,
Trust, Economy, and Judgment; neutral (not negative) Outcome; quality-per-
dollar strictly better than the best-effort raw agentic harness at equal
reliability; and the whole thing reproducing as the base model is swapped from
cheap to frontier — proving the uplift is orchestration, not model. That is a
claim a skeptic can check, that grows with the models, and that maps exactly
to the work you actually want to run.
