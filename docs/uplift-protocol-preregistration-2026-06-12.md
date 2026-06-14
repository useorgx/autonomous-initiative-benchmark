# Pre-registered protocol: OrgX uplift evaluation v1 (2026-06-12)

This protocol is written and committed BEFORE any of its runs execute. It
replaces the confounded model-vs-model comparison with a controlled uplift
measurement, and adds ARC-style saturation resistance to the hard tier.

## Hypothesis

OrgX's orchestration layer (domain agent pack + artifact verification gate)
produces a measurable quality uplift over the same base model running raw,
on hard-tier tasks with hidden criteria — and the uplift is attributable to
architecture, not model choice or task-specific knowledge.

## Design

**Base model (both arms):** `claude-fable-5`, served via OpenRouter for the
raw arm and via the Claude Code agent surface for the OrgX arm. Same model
family and version in both arms eliminates the model confound from the
2026-06-12 OrgX-vs-DeepSeek comparison.

**Control arm (raw):** single-shot generation through the catalog runner
(`--provider openrouter --model anthropic/claude-fable-5 --preset hard
--repeat 2`), hidden criteria, no tools, no revision. The prompt includes the
same "senior practitioner standard, verify every number" line the OrgX arm
receives, so prompt quality is not the variable.

**Treatment arm (OrgX loop):** the OrgX execution contract on the agent
surface, defined generically in
[orgx-artifact-verification-gate.md](orgx-artifact-verification-gate.md):
1. Domain agent generates the artifact (same task text as the raw arm).
2. An independent verifier agent in a FRESH context adversarially audits the
   artifact: recompute all arithmetic, reconcile claims across source
   documents, check feasibility against stated constraints, list missing
   inputs that make the request unanswerable.
3. A reviser agent produces the final artifact from the original + audit.
The gate contains no task-specific content. It is the productized "loop."

**Contamination controls:**
- New tasks are authored by an isolated subagent; generation agents (both
  arms) never receive acceptance criteria or answer keys
  (`hideCriteriaFromGenerator: true` plus schema scrubbing).
- The orchestrator does not paste criteria, traps, or answer keys into any
  generation or verification prompt. Verifier agents receive only the task
  prompt and the artifact.

## Admission rule (ARC-style ladder)

A hard-tier task is **admitted** to the scored suite only if the raw control
arm fails it in at least 50% of attempts (n=2), where an attempt fails if its
strict-judged quality score is below 85. Tasks the raw model passes both
times are labeled `saturated` and excluded from uplift claims (they remain in
the repo as the retired rung of the ladder). The 2026-06-12 tier3 pilot tasks
are subject to the same rule retroactively.

## Scoring (changes from v2.0)

- Strict-tier judge aggregation uses **mean** per criterion across judges
  (median allowed two lenient judges to outvote one strict judge).
- Judge panel: DeepSeek triple (v4-flash:low, v3.2:medium, v4-pro:high) via
  OpenRouter — no judge shares a vendor with the base model under test.
- **Headline metric: pairwise uplift** — per-task preference between the best
  raw attempt and the OrgX artifact, dual-ordering, consistency-gated.
  Absolute strict scores are reported as secondary evidence.

## Pre-declared outcomes

- **Success:** OrgX wins the pairwise on a majority of ADMITTED tasks and the
  strict-score mean is no lower than raw.
- **Failure (publishable):** raw matches or beats the loop — published as-is
  in the gap analysis.
- Saturated-task counts are published either way; saturation of the
  2026-06-12 pilot tasks by the raw frontier model is an expected and
  reportable outcome of the ladder design.

---

## Amendment A (2026-06-12, pre-registered before its runs): cheap-mode replication

Same design, base model `deepseek/deepseek-v4-flash` via OpenRouter in BOTH
arms (the cheapest available lane), to prove the gate mechanism where the
base model has headroom. The treatment arm runs the gate as code
(`runner/uplift-loop-runner.mjs`, gate v1.1 with the refusal-scope fix) on
the same cheap model — no fable-5 anywhere in either arm. Admission threshold
unchanged (raw attempt passes at strict ≥85, n=2). Success condition
unchanged: the loop wins the pairwise majority on admitted tasks.
