# OrgX artifact verification gate (generic execution contract)

Pre-registered 2026-06-12, before the uplift runs. This is the generic
"loop" the OrgX arm uses for hard-tier work. It contains no task-specific
knowledge; the same three stages apply to any artifact-producing task.

## Stage 1 — Generate (domain agent)

The routed domain agent produces the artifact from the task prompt alone, to
a senior practitioner standard: verify every number with explicit arithmetic,
question claims in the inputs, do not defer to authority figures whose math
is unchecked.

## Stage 2 — Verify (independent auditor, fresh context)

A separate agent with no memory of Stage 1's reasoning receives ONLY the task
prompt and the artifact, and produces an adversarial audit:

1. **Recompute** every number, total, rate, duration, and budget figure in
   the artifact from the source inputs. Flag any that do not reproduce.
2. **Reconcile** every factual claim against every source document; flag
   contradictions between sources the artifact failed to surface.
3. **Feasibility-check** every commitment (timeline, budget, capacity, SLO)
   against stated constraints, with arithmetic.
4. **Fact-check** technical assertions repeated from stakeholders in the
   inputs; plausible-sounding claims from colleagues are not evidence.
5. **Missing-input check:** decide whether the request is actually answerable
   from the inputs. If required facts are absent or sources irreconcilably
   contradict, the correct deliverable is a refusal/escalation that names
   exactly what is missing — flag if the artifact delivered a confident plan
   anyway.
6. Return a numbered issue list with severity (blocker / material / minor),
   or "CLEAN" if nothing is found.

## Stage 3 — Revise (closer)

A third agent receives the task prompt, the Stage 1 artifact, and the Stage 2
audit, and produces the final artifact: fix every blocker and material issue,
incorporate the recomputed numbers, and convert to a refusal/escalation if
the audit established the request is unanswerable. If the audit returned
CLEAN, the artifact passes through unchanged.

## Why this is fair game for the benchmark

The gate is the product claim itself — OrgX's value is that work passes
through verification before a human sees it. The gate never sees acceptance
criteria, answer keys, or judge prompts. Any system (including a raw model
harness) is free to implement the same loop; the benchmark measures whether
the orchestration layer actually runs it, reliably, on every artifact.

---

## Post-run addendum (2026-06-12, after uplift v1 — spec frozen above)

Defect found by the uplift evaluation: on refusal-correct tasks, the Stage 2
"smallest safe preparatory work" clause and Stage 3 pass-through licensed
scope creep — the loop delivered a preparatory runbook where the correct
deliverable was a refusal/escalation only, and judges scored it 67.5 vs the
raw model's 96-100. **Gate v1.1:** when the missing-input check establishes
the request is unanswerable or unauthorized, Stages 2-3 must converge on the
refusal/escalation as the ONLY deliverable; preparatory work may be proposed
as a one-line offer, never delivered unrequested.

## Post-run addendum 2 (2026-06-13, after cheap-mode uplift — spec frozen above)

Cheap-mode replication (deepseek-v4-flash both arms) produced the first
measured absolute uplift (+7.8 strict mean) but lost the pairwise on
already-strong tasks. Two defects:
- **Over-editing (gate v1.2):** the Stage-3 reviser compressed a strong
  capacity artifact 5,345->2,260 chars, dropping scoring depth. Fix: the
  reviser must preserve every correct claim and only ADD corrections or
  remove verified errors — surgical patches, never a rewrite, when the audit
  returns only minor issues.
- **Weak-auditor blindness:** a cheap Stage-2 auditor marked all six tasks
  answerable, including the refusal task. The gate is only as strong as its
  verifier; run Stage 2 on a stronger model than Stage 1 (asymmetric
  generate-cheap / verify-strong), which the harness supports per-stage.
