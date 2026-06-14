# Tier3 hard-task + strict-grader pilot (2026-06-12)

The public catalog saturates: every competent system pins the absolute rubric
at ~100 because the criteria test presence ("includes a CTA strategy"), not
excellence. This pilot is the response — a harder task class and a harder
grading protocol, validated end to end on three systems the same day it was
designed.

## Design

**Hard tasks (`catalog/tier3/`)** are built around planted, verifiable ground
truth instead of structural checklists:

- **Planted traps.** Each task embeds specific falsehoods and decoys a correct
  artifact must catch: a red-herring deploy and a 37x-inflated impact claim
  (`ops-incident-forensics-hard`), an infeasible-by-exactly-$105k budget ask
  endorsed by an authority figure (`product-capacity-plan-hard`), an
  impossible "weekend" schedule and a plausible-but-false Postgres claim
  (`eng-zero-downtime-migration-hard`).
- **Verifiable arithmetic.** Every trap has a computable answer (≈$480 revenue
  impact, $105k gap, 4.9-day backfill, 21.6-minute error budget), so judges
  recompute rather than vibe-check.
- **Hidden criteria.** `hideCriteriaFromGenerator: true` withholds acceptance
  criteria from the generation prompt (and from the structured-output schema,
  whose property names would otherwise leak the traps). The benchmark measures
  whether a system catches issues *unprompted* — which is what an autonomous
  initiative actually requires.
- **Noise and authority pressure.** Inputs include wrong narratives from
  management, confident wrong claims from colleagues, clock-skewed logs, and
  unrelated co-incidents. Agreeableness is a scored failure mode.

**Strict graders** (`judgingProtocol: strict`) replace the lenient rubric:
adversarial framing, per-criterion verification with recomputation, anchored
deductions (1.0 = exact finding; 0.0 = missed or repeated the planted false
claim), and an explicit instruction that fluent prose missing the hidden
findings must score near zero.

## Pilot results (3 tasks × 3 systems, DeepSeek judge panel)

Absolute strict scores:

| Task | OrgX agent surface | deepseek-v3.2 | deepseek-v4-flash |
| --- | --- | --- | --- |
| Incident forensics | 100 | 100 | 100 |
| Capacity plan | 90.7 | 100 | 100 |
| Migration plan | 100 | **70.7** | 100 |
| Mean | 96.9 | 90.2 | 100.0 |

Pairwise (dual-ordering, consistency-gated, same panel):

| Matchup | Verdict | Raw votes |
| --- | --- | --- |
| OrgX vs deepseek-v3.2 | **OrgX 3/3** | 17–1 |
| OrgX vs deepseek-v4-flash | **OrgX 3/3** | 16–2 |
| deepseek-v4-flash vs deepseek-v3.2 | v4-flash 2/3, 1 tie | 15–3 |

Spot-checks confirmed scores track real trap detection: the OrgX artifacts
compute $468–480 against the $18k decoy, the $105,000 gap to the dollar, the
12,153-rows/sec infeasibility, and correct the PG13 column-default myth.
v4-flash also caught the core traps; v3.2 missed several on the migration
task and lost 30 points for it.

## What the pilot proved — and what it didn't

1. **Hidden-criteria traps de-saturate the mid-tier.** v3.2 went from 99.5
   (easy catalog) to 90.2 with a 70.7 floor. Narrative-following and skipped
   arithmetic now cost real points.
2. **Reasoning models clear arithmetic traps.** v4-flash scored a perfect
   absolute 100 — planted single-hop computations are not enough to separate
   the top tier. Top-end separation still comes from pairwise judging, where
   OrgX swept 6/6 tasks (33–3 votes) on depth beyond the traps.
3. **Median aggregation re-saturates the top.** Several runs aggregated to 100
   despite one judge scoring 70–89, because per-criterion median lets two
   lenient judges outvote one strict one. Strict-tier bundles should aggregate
   with mean (or trimmed-min) instead of median, or report pairwise as the
   headline. (Open gap — not yet implemented.)

## Toward "100x harder"

This pilot is one step of roughly 10x. The remaining levers, in priority order:

1. **Multi-hop, cross-document traps** — inconsistencies that only surface
   when three documents are reconciled (reasoning models clear single-hop
   arithmetic; chains of 4+ dependent computations with decoy intermediate
   values are where they still break).
2. **Much longer noisy inputs** — 50–200KB of logs/tickets/threads where the
   load-bearing facts are sparse, misordered, and partially contradictory.
3. **Refusal-correct tasks** — scenarios where the only right answer is to
   decline, escalate, or demand missing inputs; any delivered plan scores zero.
4. **Deterministic validators** — the Initiative Worlds architecture (hidden
   evaluator truth + machine-checkable receipts) replaces LLM grading
   entirely for the checkable core, with LLM judges only on residual quality.
5. **Strict aggregation + judge calibration** — mean/min aggregation for
   strict tiers, anchor artifacts (a known-60 and known-90) in the judge
   prompt, and pairwise as the default headline metric.

## Reproduce

```bash
# generate + strict-judge a hard run
npm run run:openai -- --provider openrouter --model deepseek/deepseek-v3.2 \
  --preset hard --max-output-tokens 12000 \
  --judge-preset deepseek --judge-max-output-tokens 10000

# pairwise round-robin
npm run compare:bundles -- results/<a> results/<b> --judge-preset deepseek
```

Bundles: `results/orgx-agent-surface-hard-20260612`,
`results/deepseek-v3.2-hard-20260612`, `results/deepseek-v4-flash-hard-20260612`
(pairwise reports inside the OrgX bundle directory).
