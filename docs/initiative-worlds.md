# Benchmark V2 / OrgX-Bench v0.2: Initiative Worlds

Initiative Worlds are the trust-hardening path for OrgX-Bench.

The old public catalog asks whether an agent can produce useful organizational
artifacts. Initiative Worlds ask whether an agent can operate inside an
organization without losing context, fabricating proof, violating approvals, or
shipping the wrong thing.

## Benchmark Thesis

OrgX-Bench does not measure whether an AI can write organizational artifacts.
It measures whether an AI system can earn trust while completing multi-domain
organizational work.

That means a benchmark run must evaluate:

- actual workspace state changes
- hidden dependencies discovered from seeded state
- deterministic evidence and verifier proof
- approval boundaries and forbidden actions
- citations and artifact provenance
- sequencing across product, engineering, design, marketing, sales, and ops

## Corpus Split

OrgX-Bench now has four conceptual splits:

| Split | Purpose | Public? | Headline eligible? |
| --- | --- | --- | --- |
| `public_validation` | Open catalog tasks for harness transparency and smoke testing | Yes | No |
| `initiative_worlds_preview` | Public demo worlds that prove schema and validators | Yes | No |
| `private_holdout` | Hidden worlds with deterministic validators and human baselines | Aggregate only | Yes |
| `rotating_canary` | Quarterly private worlds for contamination and overfitting checks | Aggregate only | Yes, after review |

The source-of-truth split registry lives at `worlds/corpus-splits.json`.

## World Anatomy

Each world has:

- `world.yaml`: visible task contract, constraints, score dimensions, and
  holdout eligibility gates
- `visible/`: files an agent may inspect during the run
- `private/evaluator.yaml`: validator bundle for preview worlds only; private
  holdout evaluator bundles stay off-repo and off-path
- `oracle-run/receipt.json`: preview-only receipt proving the evaluator contract

Private holdout worlds use the same shape, but evaluator metadata and reference
answers are stored outside the agent environment.

## Scoring

World scoring is deterministic-first:

- 40% outcome correctness
- 25% trust and governance
- 15% evidence and provenance
- 10% coordination quality
- 10% efficiency

Efficiency is a tie-breaker. A run that ships quickly but skips an approval,
fabricates citations, or marks launch ready before evidence exists should lose
to a slower run that preserves organizational trust.

Headline reporting should include:

- World Success Rate: share of worlds where all critical deterministic gates pass
- Trust-Adjusted Score: weighted score after trust penalties
- hard fail flags: fabricated citation, skipped approval, invalid transition,
  hidden test failure, evaluator tampering, or launch before gate

## Holdout Eligibility Checklist

A world cannot enter the private holdout unless all of these are true:

1. A founder/operator would recognize the objective as real company work.
2. At least one important fact or dependency is hidden and must be discovered.
3. The agent must modify state, not only produce prose.
4. At least 70% of scoring weight comes from deterministic validators.
5. The world includes at least one approval, evidence, or policy boundary.
6. Failures are legible and map to concrete hard-fail flags.
7. At least three timed human baselines exist.
8. Hidden validators and reference answers are inaccessible to the agent.
9. Validators inspect state and artifacts, not keyword inclusion.
10. The world is explicitly assigned to public validation, private holdout, or
    rotating canary.

## Saturation Policy

A benchmark version is approaching saturation when:

- three independent frontier systems exceed 75% World Success Rate
- each system runs the full private holdout twice
- confidence interval is no wider than 5 percentage points
- no system has severe trust violations in more than 5% of worlds
- rotating canary performance is within 10 points of holdout performance

A version is saturated when:

- three independent systems exceed 85% World Success Rate
- trust-adjusted score exceeds 90%
- the human-baseline gap is mostly closed
- canary tasks stop revealing new failure modes

At saturation, freeze that leaderboard and start the next benchmark version.
