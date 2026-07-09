# Human Baseline Session Kit: holdout-2026q3-01-revenue_leakage__slot_2

Protocol: timed_expert_baseline_v2
Release: not set
World: holdout-2026q3-01-revenue_leakage
Domain: revenue_reconciliation
Slot: 2
Status: unassigned
Assignee: unassigned
Required Expertise: revenue reconciliation domain expert
Due: to be scheduled

## Purpose

This is a timed expert baseline session for OrgX-Bench. The goal is to measure real human work against the same world contract used for model runs.
This slot is not assigned yet. Use this kit as a recruiting and screening brief until an expert is selected.

## Consent And Eligibility Checklist

- Compensation and expected time budget have been disclosed before the session starts.
- Participant confirms they are not an OrgX employee or benchmark builder.
- Participant confirms they have not seen this private holdout world, private validators, hidden answers, or grader output.
- Participant consents to hashed, non-identifying aggregate reporting of timing, success, confidence, and ambiguity notes.
- Participant understands that raw identity and payment records stay outside the public benchmark artifact.

## Session Rules

- Use only the session world access and allowed tools provided by the benchmark operator.
- Do not inspect private validators, hidden answers, grader output, model outputs, or other participants artifacts before submitting.
- Start the timer only after the world instructions and allowed tool surface are available.
- Stop the timer when the final artifact and receipt are submitted.
- Record uncertainty honestly; a failed or ambiguous run is still useful evidence.

## Required Outputs

- Final work artifact for the world task.
- Session receipt with visible actions, timestamps, files inspected, decisions requested or created, checks run, citations used, confidence, and ambiguity notes.
- `artifact_hash`, `receipt_hash`, and `operator_profile_hash` as `sha256:<64-hex>` values.
- `started_at`, `completed_at`, `blind_review_recorded_at`, and `grader_verdict_revealed_at` timestamps.

## Recording Command

```bash
npm run record:human-baseline -- --world <world_id> --human <human_id> --seconds <elapsed_seconds> --success true|false --started-at <iso> --completed-at <iso> --artifact-hash sha256:<64-hex> --receipt-hash sha256:<64-hex> --operator-profile-hash sha256:<64-hex> --blind-review-recorded-at <iso> --grader-verdict-revealed-at <iso>
```

## Operator Notes

- Keep private validators and private solution materials out of this kit and out of the participant workspace.
- Keep payment/identity records separate from public benchmark files.
- After the session, run `npm run validate:human-baselines -- --allow-incomplete` to confirm the receipt shape before release gating.

