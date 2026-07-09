# Initiative Worlds

Initiative Worlds are seeded OrgX workspaces for evaluating whether an agent can
complete organizational work while preserving trust. They are not prompt-only
document tasks.

The current `catalog/` suite remains the public validation set. It proves that
the runner, task format, result bundles, and judging pipeline are inspectable.
Headline benchmark scores should come from private holdout worlds, not from
rubric-only public tasks.

## Splits

- `public_validation`: current Tier 1 and Tier 2 task catalog.
- `initiative_worlds_preview`: open demo worlds with validator architecture and
  oracle receipts. These prove the format and are safe to publish.
- `private_holdout`: off-repo worlds with hidden evaluator state, isolated
  validators, and timed human baselines.
- `rotating_canary`: quarterly private worlds used to detect overfitting.

See `worlds/corpus-splits.json` for the source-of-truth split registry.

## Canary Commitments

The `rotating_canary.rotationCalendar` publishes the Q3 2026 private canary
commitments. It exposes only canary id, quarter, domain, status, seed commitment
hash, and validator bundle hash. The canary task text, fixtures, seeds, and
validators remain private unless a canary is burned and later disclosed.

## Private Holdout Commitments

The `private_holdout.worlds` registry publishes the Q3 2026 sealed generator
commitments for the headline holdout. Each entry exposes only a world id, domain,
private status, parametric generator type, source/seed/validator hashes,
difficulty knob names, and the anatomy checklist flags. The generator code,
fixtures, hidden evaluator state, seeds, gold artifacts, and validator bundles
remain off-repo and off-path from agents until aggregate release disclosure.

These commitments are not headline results by themselves. Headline eligibility
still requires measured timed human baselines, strict private-holdout runs, loss
accounting, cost provenance, and external replication.

## Runnable Preview

The preview split currently contains 12 runnable worlds:

- activation sprint
- cross-functional launch gate
- revenue leak reconciliation
- incident trust recovery
- design accessibility gate
- sales discount approval
- support escalation SLA
- vendor renewal risk
- data retention policy
- partner launch handoff
- analytics metric drift
- security scope change

Validate all runnable preview worlds:

```bash
npm run validate:worlds:preview
```

Validate one world explicitly:

```bash
node runner/validate-world.mjs \
  worlds/preview/activation-sprint \
  --receipt worlds/preview/activation-sprint/oracle-run/receipt.json
```

The `private/` evaluator bundles in preview worlds are intentionally public
because they are examples. Private holdout evaluator bundles must stay off-path
from the agent environment.
