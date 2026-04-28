# Public runner notes

This directory contains the open subset of the benchmark harness needed to
verify a published benchmark bundle.

What this is for:

- validate that a weekly bundle contains the expected files
- inspect the scorecard CSV and summary JSON
- recompute the public headline metrics from published files

What this is not:

- the private OrgX control plane
- the private orchestration runtime
- a full local reproduction of the internal benchmark execution environment

What this also means:

- `orgx-benchmark.mjs` is a launcher into the real product flow, not a hidden benchmark-only runtime
- benchmark execution should mirror the same initiative and auto-continue behavior a real OrgX user sees
- the benchmark repo exists to make that path obvious and auditable

Use `node validate-bundle.mjs ../results/<week>` to verify a published bundle.
Use `node validate-bundle.mjs ../results/<week> --strict` to apply the higher
public-grade bar. Strict mode intentionally fails smoke bundles that still rely
on self-reported scoring, fewer than three repeats, too few design tasks, or
low criterion-level scores.

## Initiative Worlds preview

The Initiative Worlds validator proves the deterministic-first architecture for
trust-hardening worlds:

```bash
npm run validate:worlds:preview
```

For a single world:

```bash
node runner/validate-world.mjs \
  worlds/preview/activation-sprint \
  --receipt worlds/preview/activation-sprint/oracle-run/receipt.json
```

Preview worlds include public `private/evaluator.yaml` files only to demonstrate
the contract. Private holdout evaluator bundles must stay off-path from the
agent environment and should be executed on an isolated read-only evaluator host.

This directory also contains `orgx-benchmark.mjs`, a zero-dependency launcher that opens the real OrgX Benchmark Lab flow from a local clone of this public repo.

For low-cost local smoke runs against the public catalog, use:

```bash
npm run run:openai -- --preset full --repeat 1 --concurrency 2
```

The local OpenAI runner writes a complete bundle under `results/`, uses
`gpt-5-nano` by default, and rejects short or incomplete artifacts before
writing the final result files.

By default, the local smoke runner asks the generation model to return the
artifact and self-reported criterion scores. This is useful for cheap completion
testing, but it is not a publishable evaluation protocol.

For a public-grade run, generate cheaply and add independent judges:

```bash
npm run run:openai -- \
  --preset full \
  --repeat 3 \
  --concurrency 2 \
  --judge-preset public \
  --judge-concurrency 2 \
  --judge-max-output-tokens 2500
```

The `public` judge preset uses an independent three-judge panel:

- `gpt-5.4-nano` with low reasoning
- `gpt-5.4-mini` with medium reasoning
- `gpt-5.4` with high reasoning

To judge an existing self-reported bundle without regenerating artifacts, use:

```bash
npm run judge:bundle -- \
  results/<week> \
  --judge-preset public \
  --judge-concurrency 2 \
  --out <new-week-name>
```

Judged bundles include `judgments.json`, judge-derived task scores,
criterion-level median scores, disagreement statistics, human-review flags,
and token/cost metadata for generation and judging. The validator checks that
bundles claiming independent judging actually include completed judge records.
