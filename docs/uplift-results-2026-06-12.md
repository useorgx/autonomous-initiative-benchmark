# Uplift evaluation v1 — results (2026-06-12)

Protocol: [uplift-protocol-preregistration-2026-06-12.md](uplift-protocol-preregistration-2026-06-12.md)
(frozen before runs). Base model both arms: `claude-fable-5`. Judges: DeepSeek
triple via OpenRouter (no vendor overlap with the model under test). Strict
mean aggregation. Six hard-tier tasks, three of them newly authored by an
isolated agent (multi-hop reconciliation, long-noisy forensics,
refusal-correct).

## Pre-declared verdict: the uplift hypothesis FAILED on this rung

Per the pre-registered success condition (OrgX wins the pairwise majority on
ADMITTED tasks), the result is a failure: the single admitted task went to the
raw arm. We publish it as-is.

## Admission (ARC-style ladder)

Raw fable-5, 2 attempts per task; an attempt passes at strict score ≥ 85.

| Task | Raw attempts | Status |
| --- | --- | --- |
| ops-incident-forensics-hard | 100 & 100 | SATURATED |
| ops-churn-noise-forensics-hard | 100 & 100 | SATURATED |
| xfn-revenue-reconciliation-hard | 100 & 89.8 | SATURATED |
| eng-data-migration-refusal-hard | 96 & 100 | SATURATED |
| eng-zero-downtime-migration-hard | 94.3 & 86.0 | SATURATED |
| product-capacity-plan-hard | 82.7 & 100 | **ADMITTED** |

**5 of 6 hard-tier tasks — including all three new ones — are saturated by
the strongest raw frontier model.** The intake bar for the next rung must be
"fable-5 fails ≥50% at authoring time," exactly as HLE filters against
frontier models. Planted traps, noise, multi-hop arithmetic, and even
refusal-correctness are all within a frontier reasoning model's single-shot
reach in 2026.

## Strict scores and pairwise (raw best-of-2 = A, OrgX loop = B)

| Task | Raw (best) | OrgX loop | Pairwise |
| --- | --- | --- | --- |
| ops-incident-forensics | 100 | 100 | tie (1A/2B/3t) |
| ops-churn-noise-forensics | 100 | 100 | **B** (0A/3B/3t) |
| xfn-revenue-reconciliation | 100 | 93.7 | tie (0A/3B/3t) |
| eng-zero-downtime-migration | 94.3 | 100 | **B** (0A/3B/3t) |
| product-capacity-plan (admitted) | 100 | 93.8 | **A** (4A/2B) |
| eng-data-migration-refusal | 100 | **67.5** | **A** (5A/1B) |

Task verdicts 2–2–2; raw votes 14 B / 10 A / 12 tie. A wash overall, a loss
on the admitted task, and one outright failure mode.

## Three findings

**1. The verification gate hurt on the refusal task.** The raw model simply
refused and scored 96–100. The OrgX loop's Stage 1 generated a
"partial-deliver + escalate" runbook, the Stage 2 audit endorsed the posture,
and Stage 3 kept it — judges read the delivered runbook as a violation of the
refusal requirement (67.5). The gate spec's "propose the smallest safe
preparatory work" clause licensed scope creep. **Gate v1.1 fix:** when the
missing-input check fires, the deliverable is the refusal/escalation ONLY; no
preparatory deliverables beyond what was explicitly requested.

**2. Where the gate helps: long-noisy and feasibility-heavy tasks.** The
loop's pairwise wins came on churn-noise forensics and the zero-downtime
migration — reconciliation-and-recomputation work where a second independent
pass catches real issues (the audit caught a broken SQL batch UPDATE that the
generator shipped and the raw arm also got wrong). Verification is an
amplifier for evidence-heavy work, not a universal +N.

**3. Single-artifact tasks have no room for orchestration uplift.** When a
frontier model one-shots the task at 100, the only directions a wrapper can
move are sideways or down. This was the prediction going in, and it is now
measured. The uplift OrgX sells — state, blockers, approvals, receipts,
multi-session horizon — is structurally invisible to single-artifact
evaluation no matter how hard the artifact is. **The next rung is not a
harder document; it is a longer job.** Initiative Worlds (multi-step, hidden
validator truth, approval boundaries, trust violations as first-class
metrics) is the only design in this repo that can measure the product's
actual claim.

## Why publishing a null result is the play

A benchmark whose owner publishes "our loop lost the admitted task and our
new hard tier got saturated by the control arm in one day" is a benchmark a
skeptic can believe. The admission ladder, pre-registration, cross-vendor
judging, and frozen protocols are now demonstrated practice, not promises —
that is the ARC-AGI-grade property worth owning. The product result is a
target list, not a verdict: fix gate scope discipline, then measure uplift
where the loop operates — on horizon, not on prose.

## Artifacts

- Bundles: `results/raw-fable-5-hard-20260612` (control, 12 runs),
  `results/raw-fable-5-hard-best-20260612` (best-of-2),
  `results/orgx-loop-hard-20260612` (treatment, gate provenance in notes)
- Pairwise: `results/orgx-loop-hard-20260612/pairwise-raw-vs-loop.json`
- New tasks: `catalog/tier3/{xfn-revenue-reconciliation,ops-churn-noise-forensics,eng-data-migration-refusal}-hard.yaml`
