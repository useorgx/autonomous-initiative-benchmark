# Human Baseline Recruiting and Replication Plan

This plan turns the remaining SOTA evidence gaps into an operational outreach
and data-collection program. It is intentionally separate from the benchmark
implementation: recruiting, paid sessions, third-party replication, and outside
reproduction are evidence, not code.

## Evidence to Collect

The benchmark is not headline-ready until these four evidence groups exist:

- `timed-human-baselines`: at least three protocol-valid human sessions for
  every private holdout world.
- `strict-headline-bundle`: the private frontier sweep is run, every planned
  job is scored/lost/blocked in the execution ledger, and the headline bundle
  passes strict validation.
- `third-party-replication`: at least one independent party runs through the
  sealed validator path and signs an agreeing or discrepancy-documented row.
- `stranger-reproduction`: an outside reviewer recomputes the public headline
  release from public files and matches every headline number to the digit.

## Outreach Lanes

### Lane A - Methodology Advisors

Purpose: get advice on study design, human-baseline protocol, contamination
controls, and claim wording. These people do not need to run every session.

Best targets:

- METR, because its time-horizon work explicitly estimates task duration from
  human experts and fits reliability curves over task duration.
- SWE-bench / SWE-bench Verified authors and collaborators, because that line
  of work dealt directly with human screening, issue underspecification, and
  benchmark task validity.
- tau-bench authors: Shunyu Yao, Noah Shinn, Pedram Razavi, Karthik Narasimhan.
  Their benchmark focuses on stateful tool-agent-user interaction, final state
  grading, and pass^k reliability.
- WebArena / TheAgentCompany authors: Shuyan Zhou, Frank F. Xu, Graham Neubig,
  and collaborators. Their work is closest to self-contained workplace-like
  agent environments.
- Epoch AI / FrontierMath team, because FrontierMath is a strong precedent for
  unpublished expert-authored private problems and expert review workflows.

Ask:

- 30 minutes of methodology review.
- Feedback on the human-baseline protocol and release gates.
- Optional introduction to a replication-minded evaluator.

Do not ask these people to be generic annotators. Ask them for protocol review,
credibility critique, and replication design.

### Lane B - Paid Domain Practitioners

Purpose: collect the 60 timed expert sessions needed for the private holdout.
These should mostly be experienced practitioners, not famous academics.

Roster target:

- Three distinct qualified humans per holdout world.
- Prefer one expert per exact domain where possible; use wildcard operators
  only when they genuinely have broad operator experience.
- Every roster entry must satisfy `human_expert_roster_v1`: hashed identity,
  max session load, recruitment channel, compensation disclosure, conflict
  attestation, and `private_validator_access:false`.

Recruiting pools:

- software engineering and migration reviewers
- incident response / SRE / reliability operators
- revenue operations and finance/reconciliation practitioners
- product managers with prioritization and launch experience
- accessibility-minded product designers
- sales operations and deal-desk operators
- support operations / SLA owners
- privacy, security, and trust/safety reviewers
- analytics and metric-governance practitioners
- partner/channel launch operators

Ask:

- Paid 45-90 minute timed task session.
- Complete the task from provided instructions and allowed tools only.
- Produce a work artifact and session receipt.
- Consent to hashed, non-identifying aggregate reporting.

### Lane C - Independent Replication Partners

Purpose: get at least one externally replicated row through the sealed API.

Best targets:

- AI eval nonprofits or labs: METR, Epoch AI, Apollo Research, Redwood Research,
  Center for AI Safety eval-adjacent researchers, and university agent-eval
  groups.
- Benchmark builders with agent-environment experience: SWE-bench, tau-bench,
  WebArena, TheAgentCompany, AstaBench-adjacent researchers.
- Credible independent eval consultancies that can sign a discrepancy log.

Ask:

- Run two sealed holdout worlds through the submission API.
- Keep validators hidden.
- Co-sign the resulting replication evidence or publish discrepancies.

### Lane D - Stranger Reproduction Reviewers

Purpose: prove the public release can be recomputed without trusting OrgX.

Best targets:

- senior independent software engineers
- reproducibility-minded ML engineers
- benchmark leaderboard maintainers
- technical writers who have reproduced ML eval claims

Ask:

- Pull the public repo.
- Run the documented reproduction command.
- Record input hashes, command, result hash, deviations, and whether the
  headline numbers match to the digit.

## Current Public Contact Routes

The first-wave methodology and replication routes in
`results/sota-outreach-plan.example.json` should stay source-backed. Current
public routes are:

- METR: use the official public organization contact route for methodology
  review, and reference its public task-development guidance when asking about
  human-duration/task-design critique.
- Epoch AI / FrontierMath: use Epoch's official public team/contact route for
  private-holdout and expert-review methodology advice.
- SWE-bench team: official contact page lists the general inquiry addresses.
- tau-bench / Sierra Research: Sierra's tau-bench post asks benchmark-improvement
  suggestions to go to `research@sierra.ai`.
- TheAgentCompany: the public repository asks questions to be filed as an issue
  or sent to the listed authors' public emails.
- Paid practitioner pools: use vetted research-recruiting platforms such as
  Respondent, User Interviews, Prolific, or CloudResearch Connect, with
  prescreening for current or recent domain experience. Do not put private
  validators, solution keys, or grader output in any screener.

Do not replace these with scraped personal addresses unless the source is a
public professional profile and the outreach plan records the source URL.

## Timing

Use a two-wave schedule rather than a blast.

- Wave 0: prepare packets, proof links, and draft messages before any sends.
- Validate the outreach plan before moving any target to `queued` or `sent`:
  `npm run validate:outreach-plan -- --strict --plan results/sota-outreach-plan.example.json`.
- Materialize reviewable drafts:
  `npm run materialize:outreach-drafts -- --plan results/sota-outreach-plan.example.json --out results/sota-outreach-drafts.json --out-dir results/outreach-drafts`.
  Drafts with contact forms, warm intros, marketplace pools, or manual-research
  targets are intentionally blocked from direct-send status.
- Review `results/outreach-drafts/_action-queue.md` before touching any
  recipient-facing channel. The queue schedules approved actions inside the
  declared high-response window and distinguishes `send_ready` copy from
  `dispatch_ready_now`.
- Initialize and validate the execution ledger before the first action:
  `npm run init:outreach-ledger -- --drafts results/sota-outreach-drafts.example.json --out results/sota-outreach-action-ledger.example.json`
  and
  `npm run validate:outreach-ledger -- --strict --ledger results/sota-outreach-action-ledger.example.json --now <iso>`.
- Wave 1: send 6-8 high-fit methodology and replication messages on Thursday
  morning, July 9, 2026, recipient-local time if ready; otherwise send Tuesday
  morning, July 14, 2026.
- Wave 2: start practitioner recruiting immediately through paid/direct
  channels once the roster contract is ready. Practitioner outreach can happen
  on weekdays except Friday afternoon.
- Follow-up 1: three business days after no response.
- Follow-up 2: seven business days after first contact, with a smaller ask:
  "Who is the right person for protocol review or replication?"

Avoid Friday afternoon, weekends, and late-night sends. For high-status
academics/labs, a Tuesday or Wednesday morning send is better than a rushed
evening send.

## Message Shape

The initial message should be short and specific:

- One sentence: what OrgX-Bench measures.
- One sentence: why their work is the reason we are asking.
- One sentence: the exact ask.
- One sentence: proof that the benchmark has real guardrails already.
- One sentence: scheduling or referral CTA.

Avoid claiming SOTA. The credible posture is: "we are trying to make the
release hard to dismiss, and we want critique before we publish."

## Data Collection Workflow

1. Validate the outreach plan:

   ```bash
   npm run validate:outreach-plan -- --strict --plan results/sota-outreach-plan.example.json
   npm run materialize:outreach-drafts -- --plan results/sota-outreach-plan.example.json --out results/sota-outreach-drafts.json --out-dir results/outreach-drafts
   ```

   Treat `_action-queue.md` as the execution checklist. `send_ready` means the
   direct-email copy is resolved. `dispatch_ready_now` means the direct email is
   resolved and the current timestamp is inside the approved send policy. Manual
   actions such as contact forms, warm intros, and paid practitioner pool posts
   must still be executed deliberately at the scheduled time.

   After a real action happens, record it in the action ledger. The recorder
   requires a receipt reference, refuses early completion before
   `recommended_at`, and schedules follow-ups from the configured business-day
   offsets:

   ```bash
   npm run record:outreach-action -- \
     --ledger results/sota-outreach-action-ledger.json \
     --out results/sota-outreach-action-ledger.json \
     --action-id <action-id> \
     --completed-at <iso> \
     --operator <operator> \
     --receipt-channel gmail|contact_form|marketplace|intro \
     --receipt-ref <provider-or-local-receipt-id>
   ```

2. Validate the expert roster:

   ```bash
   npm run validate:human-expert-roster -- --strict --roster results/human-expert-roster.json
   ```

3. Build the assignment plan:

   ```bash
   npm run plan:human-baselines -- --strict --experts results/human-expert-roster.json --out results/human-baseline-plan.json
   ```

4. Export reviewer-safe packets:

   ```bash
   npm run export:human-baseline-packets -- --plan results/human-baseline-plan.json --out results/human-baseline-session-packets.json
   npm run materialize:human-baseline-kits -- --plan results/human-baseline-plan.json --out results/human-baseline-session-kits.json --out-dir results/human-baseline-kits
   ```

5. Send only the relevant Markdown kit plus the session world access to each
   participant. Do not send private validators, solution materials, model
   outputs, or grader output.

6. Record completed sessions with `npm run record:human-baseline`.

7. Validate coverage with `npm run validate:human-baselines`.

8. Attach third-party replication evidence with
   `npm run validate:replication -- --strict --file <evidence.json>`.

9. Attach outside reproduction with
   `npm run validate:reproduction -- --receipt <receipt.json>`.

## Current Boundary

Codex can prepare the roster, packet exports, draft outreach, track replies, and
record evidence after artifacts are returned. Codex cannot itself be the
independent human baseline participant, external replication party, or outside
reproduction reviewer.
