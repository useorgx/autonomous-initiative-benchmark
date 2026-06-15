# Making the strategy real — OrgX, the benchmark, and the multi-client UX

The evidence from Phases 1–4 is settled: single-job execution quality is
saturated (raw models own it), so orchestration uplift is a narrow,
regime-dependent band. Undeniable uplift only exists where raw models score
**zero**: long horizons, multi-session state, trust/governance, cross-context
coordination, and portfolio economy. This plan turns that into concrete changes
across the three surfaces — and its central claim is that those three surfaces
are **one object**, not three projects.

## The through-line: one instrumented work graph, many hands, proof where raw = 0

OrgX already runs as a shared brain (`mcp.useorgx.com`) with many client hands
(Claude Code / Codex / Cursor / OpenClaw plugins) posting activity, progress,
artifacts, and blockers back via runtime hooks. The strategy collapses the three
surfaces onto that spine:

- **OrgX (the brain)** owns state, the trust ledger, regime-aware orchestration,
  and routing — the capabilities raw models lack.
- **The plugins / multi-client UX (the hands + operator)** let any client attach
  to the same work graph, execute, and report receipts — and make the brain's
  state legible and actionable to a human.
- **The benchmark (the proof)** measures uplift on the dimensions where raw = 0.

The unifying move: **the benchmark's execution-graph recorder (WEG) and OrgX's
runtime hooks become the SAME instrument.** Every client posts the execution
graph + trust-ledger events back to OrgX. Then (a) the product gets the
trust/economy UX for free, (b) the benchmark measures uplift on *real* runs not
only synthetic worlds, and (c) the proof becomes continuous and self-serve.
One stream, three payoffs.

---

## Track 1 — OrgX (the brain): build what raw models don't have

Ranked by evidence-strength and leverage.

1. **Regime-aware verification (Gate v3.0).** Replace the reflexive loop with a
   per-step difficulty/confidence estimate that spends verification budget ONLY
   in the borderline band (where it doubled pass rate) — never on steps the
   model is reliable on (pure cost) or hopeless on (waste). Keep the v2.0 hard
   no-regression guard. This is the single highest-ROI build; the data already
   says reflexive verification is usually wrong.
2. **Trust ledger.** Claimed-state must reconcile against actual/validator state
   (no false completion); every receipt links to a checkable artifact / diff /
   test run (no hallucinated proof); approval boundaries are enforced. Drive
   false-completion and hallucinated-receipt rates toward zero. This is the
   non-saturating dimension — the moat.
3. **Multi-session durable state + resume-from-failure.** Decouple brain from
   hands: a durable session log lives outside any context window; receipts are
   checkpoints; an initiative can be killed and resumed (in any client) from
   verified state. Raw models have no cross-session memory — this is structural
   uplift, not marginal.
4. **Coordination runtime.** Enforce `depends_on` (never start B before A's
   output is verified); single-writer for writes + parallel context-isolated
   reads; blockers detected, surfaced, and routed to recovery or escalation
   instead of silently stalling.
5. **Economy + routing.** Closed-loop cheapest-model-that-clears-the-bar
   routing; per-run token/cost telemetry over MCP (fixes A6/A7); code-as-action
   over the MCP tool surface (tool-search + deferred loading + programmatic
   calling) to cut the token tax that makes orchestration expensive.
6. **Harness reliability (A1–A7).** Provider pinning honored end-to-end (A1),
   dispatch-time credential preflight (A2), run-state visible to status/inspect
   surfaces (A3), `orgx_write`/`orgx_spawn` contract fixes (A4/A5). Prerequisite
   to running anything reliably in-product.

## Track 2 — The benchmark (the proof): measure where raw = 0

1. **Multi-session worlds (kill + resume).** The raw arm starts over or drifts;
   OrgX resumes from verified state. The cleanest raw-scores-zero regime.
2. **Trust worlds.** Planted opportunities to falsely-complete, fabricate a
   receipt, or exceed authority; scored as **violation rates**, not pass/fail.
   These get *more* discriminative as models improve.
3. **Exceeds-one-context worlds.** Parallel dependent sub-tasks whose combined
   state exceeds a single window — where multi-agent orchestration has
   externally proven uplift (Deep Research / multi-agent research).
4. **Economy / routing worlds.** A budget ceiling per initiative; headline =
   quality-per-dollar at equal pass^k.
5. **The regime map.** A model-ladder (8B → frontier) × difficulty-ladder sweep
   to confirm the borderline band and locate where the gate's uplift peaks.
6. **Fixes (committed-but-open):** a forced-failure test that proves the v2.0
   no-regression guard fires (it passed by variance, not by the guard, in the
   v2 run); fix the restart seam (carry only irreducible state, derive
   aggregates once); regenerate today's reports in the admission-aware format;
   wire the private holdout split (`worlds/corpus-splits.json`); pass^k-based
   admission; publish the **uplift matrix** (dimensions × lenses, token-
   normalized) + a horizon-shift number as the headline.

## Track 3 — Multi-client UX + plugin work (the hands + the operator)

1. **Make the regime legible.** Selective verification only earns trust if the
   operator can see *why*: "this step was borderline — verified; this one was
   confident — shipped." Surface the decision, not just the result. Without
   this, "we verify less now" reads as "we got lazier."
2. **Trust surface as the primary UI.** Claimed-vs-actual at a glance; receipts
   with one-click proof (open the diff/test/artifact behind the claim);
   blockers and approvals as the main action surface. OrgX's own design law —
   quiet when healthy, loud only when it needs you.
3. **One work graph, many hands.** Any client (Claude Code / Codex / Cursor /
   OpenClaw) attaches to the same initiative through the MCP brain, with one
   execution contract and one receipt schema, so the operator sees a single
   coherent initiative regardless of which client or model did the work — and
   can resume it in a different client tomorrow. This is the plugins' reason to
   exist, made first-class.
4. **Economy visible per step.** Which model ran this, what it cost — the
   quality-per-dollar story made tangible in the timeline, so routing decisions
   are auditable by the operator.
5. **Unify hooks with the WEG.** The plugins already post activity / progress /
   artifacts / blockers. Extend the hook payload to the full execution graph +
   trust-ledger events, so the product telemetry and the benchmark instrument
   are the same stream. This is the keystone change that makes Track 2 run on
   real product traffic.
6. **In-product proof.** Benchmark Lab surfaces the regime map and the uplift
   matrix, so the value claim is self-serve verifiable by a prospect — the
   honesty (publishing the saturated/negative cells) is the credibility engine.

---

## Sequencing (each phase moves all three surfaces together)

**Phase A — Unify the instrument + stop the bleeding.**
OrgX: A1–A7 reliability + per-run telemetry. UX: extend plugin hooks to emit the
WEG + trust events (the keystone). Benchmark: forced-failure no-regression test,
restart-seam fix, holdout wiring, report regeneration.
Exit: every client run emits a deterministic execution graph + trust ledger to
OrgX; benchmark fixes green.

**Phase B — Build and prove the moat (trust + regime-aware loop).**
OrgX: Gate v3.0 (verify-on-the-edge) + trust ledger. Benchmark: trust worlds +
multi-session worlds. UX: trust surface + regime-legibility.
Exit: a held-out uplift readout showing OrgX driving false-completion /
hallucinated-receipt rates to zero where the raw arm leaks them, and the gate
adding value only in the borderline band — with the UX showing why.

**Phase C — Multi-client coordination + economy.**
OrgX: coordination runtime + closed-loop routing + code-as-action. Benchmark:
exceeds-one-context + economy/routing worlds + the regime map. UX: one-graph-
many-hands attach/resume across clients + per-step economy + Benchmark Lab proof.
Exit: quality-per-dollar strictly beats a best-effort raw harness at equal
pass^k; an initiative resumes cleanly across two different clients.

**Phase D — Continuous co-evolution.**
The uplift matrix runs on real product traffic; model-ladder sweeps track where
the band sits as models improve; saturated worlds retire publicly; trust and
coordination stay discriminative as horizons grow.

## What "undeniable" means at the end

A published, held-out **uplift matrix on real multi-client runs** showing: large
positive uplift on trust (violation rates → 0), multi-session reliability
(resume where raw can't), coordination (dependency/handoff fidelity), and
economy (quality-per-dollar) — neutral, not negative, on single-job quality —
reproducing as the base model is swapped from cheap to frontier, and verifiable
self-serve in Benchmark Lab. That is a claim a skeptic checks themselves, that
grows with the models, and that is the same object the product delivers and the
plugins surface. Three surfaces, one proof.
