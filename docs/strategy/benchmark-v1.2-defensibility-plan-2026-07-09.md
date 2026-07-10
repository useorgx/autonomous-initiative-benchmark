# OrgX-Bench V1.2 Defensibility Plan

Date: 2026-07-09

## Thesis

OrgX-Bench measures trustworthy initiative completion: whether a system can move
an organization from one valid state to another, produce a work product that a
downstream consumer can use, preserve approvals and policy boundaries, and do so
reliably under perturbation.

The memorable headline is the Trustworthy Initiative Horizon: the longest
human-equivalent initiative duration at which a system sustains 80% qualified
success under the preregistered stress profile with no critical trust violation.

Qualified success remains decomposable:

```text
mission complete
AND final state valid
AND work product accepted in downstream use
AND evidence and provenance valid
AND approvals and policies respected
AND no critical trust violation
```

## Threat Model

The benchmark assumes capable systems may exploit task familiarity, prompt
signposts, validator implementation details, weak coverage, missingness,
selective reruns, or unstable rankings. It also assumes benchmark authors can be
wrong. V1.2 therefore treats benchmark error as measured release evidence.

The task-defect taxonomy is:

- overly strict tests that reject a valid implementation
- underspecified prompts whose hidden checks require uninferable behavior
- low-coverage tests that accept incomplete work
- misleading prompts that conflict with the intended or tested behavior
- contamination or hidden-state leakage
- non-monotonic or non-discriminating difficulty controls
- delayed failures that are invisible at the immediate terminal state

## World Quality Court

Every private generator receives a quality dossier before it can contribute to
a headline. The dossier includes:

- five independent reviewer ids
- at least two independently valid solutions
- at least three invalid, shortcut, partial, or policy-violating solutions
- measured false acceptance and false rejection rates
- prompt ambiguity and reviewer agreement
- counterfactual twins whose correct action changes with hidden causal truth
- metamorphic relations where irrelevant changes preserve the correct outcome
- delayed-consequence scenarios that reopen the state after a later event

Task authors cannot be the sole approver of their own validators. Severe defects
block the world until repair and re-audit.

## Contamination Firewall

Private worlds use just-in-time seeds, a sealed evaluator vault, signed access
events, provider-retention controls, planted canaries, and adaptive leakage
probes. A strong leak signal burns the world for the affected release. Burned
worlds remain visible in the evidence ledger but are excluded from the headline.

Counterfactual twins make memorized solution templates actively brittle: the
same surface story can require the opposite action when authoritative state,
approval, budget, or policy changes.

## Statistical Precision

Eight episodes per cell is the minimum, not the stopping rule. Paired-seed runs
continue until the preregistered confidence-interval width is met or the budget
cap is reached. The analysis uses a hierarchical model across generators and
difficulty levels. Rankings are suppressed when uncertainty intervals overlap.

The release reports capability, reliability, trust violations, cost, and
human-rework minutes separately. The Trustworthy Initiative Horizon is derived
from the qualified-success predicate, not an opaque weighted score.

## Corrections And External Attack

The correction ledger is public and append-only. Severe and critical reports
block affected releases. Resolution requires a public explanation and score
recomputation or withdrawal. Historical bundles are not silently replaced.

External replication and stranger reproduction remain separate gates. The
benchmark should also fund adversarial reviews whose mandate is to find broken
tasks, accepted shortcuts, leaked state, and unstable rankings. A valid critique
becomes a correction-ledger entry, not a private argument.

## Publication Sequence

1. Publish this methodology and the executable contracts before headline runs.
2. Populate world-quality, contamination, precision, human, and execution evidence.
3. Run the preregistered frontier sweep.
4. Obtain independent replication and public-file reproduction.
5. Publish headline results only after strict release validation passes.

Until step 5, all public language must say methodology, preview, preflight, or
mechanism result. It must not say SOTA headline result.
