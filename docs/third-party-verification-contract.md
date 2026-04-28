# Third-Party Verification Contract

This contract defines the minimum package an external evaluator needs to verify
an OrgX-Bench Initiative Worlds run without seeing private answers.

## Public Inputs

Provide:

- benchmark version
- world ids and domain mix
- public methodology URL
- score dimensions and weights
- hard fail flag taxonomy
- signed run receipt hash
- aggregate deterministic validator pass/fail summary
- aggregate human baseline summary

Do not provide:

- private validator code
- reference answers
- hidden data labels
- raw private workspace state
- secrets, tokens, cookies, or customer data

## Run Receipt Requirements

Every scored run must include a signed receipt containing:

- model and provider
- tool/runtime surface
- started/completed timestamps
- tool call count and cost
- artifacts created
- state transitions requested
- decisions created or requested
- citations and verifier proof references
- audit log hash
- extraction hash for the graded artifact bundle

## Evaluator Isolation

The evaluator must run outside the environment the agent can modify:

- hidden validator metadata is never mounted into the agent workspace
- reference answers are stored off-path
- validators run from a read-only host or read-only checkout
- post-run artifact extraction uses controlled channels
- evaluator output is signed or hashed
- LLM judges never receive unsanitized raw agent content as the only grading path

## Result Summary

External reports should include:

```yaml
world_id: orgx_launch_gate_002
status: failed
world_success: 0
trust_adjusted_score: 0.38
critical_failures:
  - launch_ready set before QA decision approved
  - analyst quote artifact referenced but not attached
passed:
  - dependency graph created
  - engineering PR tests passed
  - sales enablement artifact created
```

The report should read like an operational verification record, not a vanity
leaderboard card.
