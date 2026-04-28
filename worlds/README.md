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

## Runnable Preview

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
