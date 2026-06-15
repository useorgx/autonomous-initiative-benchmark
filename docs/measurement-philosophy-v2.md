# Measurement philosophy v2 — the work execution graph

The current benchmark scores a finished document. Real work is not a document;
it is a *graph of decisions, actions, tool calls, handoffs, verifications, and
blockers* that produces documents (and side effects) along the way. v2 changes
the unit of measurement from the artifact to the graph, scores that graph from
several independent perspectives, and reports OrgX's value as an **uplift
vector** across the dimensions of work — never a single number.

## 1. The object of measurement: the Work Execution Graph (WEG)

Every run of a benchmark job — raw model or OrgX — emits a WEG:

- **Nodes**: units of work — a decision, a generation, a tool call, a
  verification, a handoff, a blocker, an artifact, an escalation, a stop.
- **Edges**: data flow (B consumed A's output), dependency (B waited on A),
  causation (this blocker triggered that escalation).
- **State stream**: what the system *claimed* at each step (progress %, "done",
  a receipt) alongside what was *actually true* (validator state).

Both arms run the same seeded job and produce a WEG. We measure the graph, not
just its final node. This is what makes tool use, iteration, dependencies, and
economy *visible* — they are graph structure, invisible to artifact scoring.

## 2. The six dimensions of work (what "good" decomposes into)

| Dimension | The question it answers | Why artifact scoring misses it |
| --- | --- | --- |
| **Outcome** | Is the final + intermediate output correct? | Only this one is partly captured today |
| **Method** | Did it use the right tools, verify, iterate to a bar? | No tool/iteration on the scored path |
| **Coordination** | Were dependencies ordered, handoffs faithful, blockers handled? | Tasks are independent single shots |
| **Economy** | Cost, latency, and quality-per-dollar — did it choose well? | Cost is recorded, never optimized-for |
| **Trust** | Did claimed state match real state? Valid receipts? Authority respected? Correct refusals? | Nothing checks honesty |
| **Judgment** | Did it know when to stop, escalate, or refuse — and not over-deliver? | No notion of an unfinished or unanswerable job |

These six are the breadth "what goes into the work." A faithful benchmark must
instrument all six, not just Outcome.

## 3. The five perspectives (lenses) — multi-perspective measurement

No single evaluator is trustworthy; we proved this when one DeepSeek panel
scored the same artifact 86.5 absolute and then lost it 0–4 pairwise while it
held the correct answer. So every dimension is scored by the subset of these
lenses that applies, and the lenses are triangulated:

1. **Oracle** — deterministic, machine-checkable ground-truth validators
   (answer keys, schema checks, state assertions). The anchor. Primary wherever
   ground truth is computable.
2. **Adversary** — a cross-vendor LLM panel prompted to refute, not reward;
   catches residual quality and planted traps the oracle can't express.
3. **Consumer** — the acceptance lens: would the human who requested this ship
   it without rework? Measures decision-readiness, not craft.
4. **Peer** — the craft lens: would an expert in that domain sign off? Measures
   depth and judgment a consumer might miss.
5. **Ledger** — non-LLM instrumentation read straight off the WEG: cost, latency,
   tool-call necessity, dependency-order violations, claimed-vs-actual state
   deltas. Numbers, not opinions.

**Triangulation rule:** a measurement is high-confidence only when the Oracle
agrees with at least one human-proxy lens (Consumer or Peer). When lenses
diverge — especially Oracle vs Adversary, or absolute vs pairwise — the
divergence is recorded as a confidence penalty and routed to human review. The
disagreement is a signal about the *evaluator*, and we surface it rather than
average it away.

## 4. Translating qualitative work into quantitative measurement

The hard part: turning "good coordination" into a number. The answer is that
each qualitative property becomes a **rate or count over WEG events**, scored
by the lens that can see it. The translation table:

| Dimension | Qualitative property | Quantitative measure (over the WEG) | Lens |
| --- | --- | --- | --- |
| Outcome | "got it right" | answer-key pass; residual quality 0–1 | Oracle, Adversary |
| Method | "did the work, didn't bluff" | required-tool-call coverage; % of stated numbers actually verified; attempts-to-green | Ledger, Oracle |
| Coordination | "held it together" | dependency-order violations; handoff fidelity (did B use A's *correct* output); blocker-recovery rate; rework cycles | Oracle, Ledger |
| Economy | "chose well" | $/passing-job; latency-to-bar; quality-per-dollar vs the frontier | Ledger |
| Trust | "was honest" | claimed-vs-actual completion delta; hallucinated-receipt rate; unauthorized-action count; refusal-correctness | Oracle, Ledger |
| Judgment | "knew when to stop" | premature-stop rate; missed-escalation rate; scope-creep (delivered beyond the ask) | Oracle, Peer |

Every cell is a measurable quantity emitted by an instrumented run. "Qualitative
across the execution graph → multi-perspective quantitative" is exactly this
table: graph events on the rows of measurement, lenses on the columns of trust.

## 5. The metric: uplift as a vector, with confidence

For base model M, run the same job twice — M raw (best-effort agentic harness)
and M + OrgX — and compute, per dimension d and lens l:

```
Uplift[d][l] = score_OrgX[d][l] − score_raw[d][l]      (with a confidence weight)
```

The result is a **matrix**, reported as a radar/heatmap, never collapsed to one
headline. The honest product claim is the *shape*: we expect OrgX to show
strong positive uplift on Coordination, Trust, and Economy (the orchestration
layer), near-zero on single-artifact Outcome (a wrapper can't make a frontier
model write a better paragraph), and the cheap-mode run already showed it can go
*negative* on Outcome when the reviser over-edits. Publishing the negative cells
is what makes the positive cells believable.

Two properties make this saturation-resistant in a way artifact scoring is not:

- **It indexes to the base model.** As M improves, the raw arm gets stronger, so
  uplift is always measured against the current frontier — it cannot be "won"
  once and banked. ARC-style admission falls out for free: a job only enters the
  suite if the raw arm leaves measurable headroom on at least one dimension.
- **Trust and Coordination don't ceiling.** As autonomy horizons grow, raw
  models violate trust and mis-coordinate *more*, so those dimensions get *more*
  discriminative as capability rises — the opposite of rubric saturation.

## 6. What this demands of the benchmark (the build list)

1. **Jobs, not documents** — seeded worlds with tool fixtures (DB/API/FS the
   harness provides and can assert against), a dependency DAG, an injected
   blocker, and a budget ceiling. (This is `worlds/` — Initiative Worlds.)
2. **A WEG recorder** — both arms emit the node/edge/state trace in one schema,
   so the Ledger lens can read coordination/economy/trust straight off it.
3. **Deterministic validators per job** — the Oracle. Hidden from both arms.
4. **The five-lens evaluator** — Oracle + Adversary panel + Consumer + Peer +
   Ledger, with the triangulation/confidence rule.
5. **The uplift-matrix reporter** — per dimension × lens, with confidence and
   the divergence flags surfaced, not hidden.

The current `runner/` is the artifact-scoring slice of this (Outcome dimension,
Adversary + a weak Consumer lens). v2 keeps it as one lens on one dimension and
builds the other five dimensions and three lenses around it.

## 7. The one-line philosophy

Measure the graph, not the endpoint; score it from independent lenses that must
agree to be believed; and report OrgX as an uplift vector across the real
dimensions of work — so the benchmark proves *where* orchestration adds value,
grows with the models instead of saturating, and stays honest by publishing the
cells where it doesn't.
