# Methodology Amendment: Initiative Worlds

Benchmark V2, shipped as OrgX-Bench v0.2 while the public corpus is still pre-1.0, separates public validation tasks from Initiative Worlds.

Public tasks are released to make the harness inspectable and reproducible.
They remain useful for smoke tests, regression checks, and contamination-visible
examples. They are not frontier evidence.

Private Initiative Worlds are used for headline scores because they contain
hidden evaluator state, deterministic validators, and timed human baselines.

We do not treat rubric-only document generation as sufficient evidence that an
AI system can complete organizational work. A world contributes to the headline
benchmark only when the agent must change organizational state and when the
majority of scoring is performed by deterministic validators.

LLM judges are used only for bounded qualitative dimensions after deterministic
checks complete. They may assess executive clarity, prioritization quality,
tone, and usefulness to a human operator. They may not be the primary authority
for whether tests passed, math is correct, citations exist, approval order was
respected, or hidden dependencies were resolved.

The benchmark measures whether an AI system can complete multi-domain
organizational work while preserving trust:

- approvals respected
- artifacts provenanced
- state transitions valid
- citations real
- audit trails intact
- claims backed by workspace evidence

The current preview includes two runnable Initiative Worlds:

- `orgx_activation_sprint_001`
- `orgx_launch_gate_001`

These worlds prove the format, receipt model, and deterministic-first evaluator
path. They do not produce headline claims. Headline scores require private
holdout worlds and timed expert baselines.
