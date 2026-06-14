# We built the benchmark that could catch us. It caught us. (draft)

So I'll just say the result first because it's the whole point: we built a new benchmark to measure whether OrgX's orchestration actually makes a model better — and on the cleanest test we've ever run, it caught our own verification loop making a reliable model *worse*. Same model, with our loop, on a task the raw model nailed 8 out of 8 times. Our loop took two of those wins and turned them into failures.

I want to walk through why that's the best thing that happened this week, not the worst.

## What we actually built

Up to now our benchmark scored finished documents — write a launch brief, write a postmortem — and a panel of AI judges rated them. The problem, which I've been chewing on for a while, is that's the one shape of work where a raw model in a chat box is already great and orchestration adds almost nothing. We were measuring the model, not the thing we build.

So we rebuilt it around what the field actually figured out in 2025 and 2026 — τ-bench, METR's time-horizon work, the reliability-science papers, the "LLMs cannot self-correct yet" line, Cognition's "don't build multi-agents," Anthropic's long-running-agent harness work. The throughline across all of it: stop measuring single answers, measure the execution graph; score reliability not pass@1; and never trust an AI judge when you can check the answer with code.

The new thing is an **Initiative World**: a sandboxed job where the agent only touches state through tools — it queries a billing export, reads a policy, computes, decides — and never sees the answer key. The outcome is checked by **deterministic code**, not a judge. We run each arm *k* times and ask the brutal question: did it pass *all k* (that's pass^k — a 90%-per-run agent is 57% at k=8). And we log every token, because ~80% of agent performance variance is just token spend, so if you don't divide quality by cost you're measuring spend and calling it intelligence.

Two arms, same cheap model (DeepSeek v4-flash), same tools, same prompt quality. One is a plain tool-using agent. The other is the OrgX loop — plan, then verify before you finalize. The only difference is the orchestration. So any gap is us.

## Five worlds. Here's what happened.

Three normal jobs — reconcile revenue and route a refund, triage an incident, handle a migration that's secretly unanswerable. Both arms passed everything, every run, every dimension. And the OrgX loop spent 2.25× the tokens to get the identical answer. Pure cost.

So I thought, okay, the jobs are too easy. We built a nasty one — a revenue reconciliation with six stacked traps: a duplicate row, two churned accounts still in the export, an annual contract you have to *not* multiply by twelve, a superseded plan-upgrade row, a 50% promo credit, a free trial. The kind of thing that takes a human analyst real focus. Raw v4-flash, with a calculator tool: $186,000, correct, eight times out of eight. The verification loop had nothing to fix and cost 4×.

And so I'm realizing the thing I didn't want to realize: a 2026 reasoning model with a calculator and clear rules doesn't make arithmetic mistakes on a single job. The headroom I was assuming exists — for our loop to go capture — isn't there. The model already owns it.

Then the one that actually stung. A long-horizon pipeline: twelve orders, shared inventory that depletes as you go, so whether order ten ships depends on what orders one through nine consumed. This is the real test — sequential state, the exact place the reliability papers say long agents fall apart. Raw model: 8 out of 8, exact backordered set every single time. Our loop: 6 out of 8. The two it lost, it lost because the "verify before you finalize" step sent the model to re-derive the whole twelve-step chain, and it ran out of budget mid-re-derivation and never came back with an answer. pass^k went from 1.0 to zero. We took a model that was perfectly reliable and made it unreliable.

## Why I'm glad

Because the benchmark worked. It's deterministic, the agent can't reach the grader, it measures reliability and cost honestly, and it caught *us* — not a competitor, us — adding cost and inducing failures on work the base model already does. A benchmark that can do that to the company that built it is the only kind worth publishing. Every agent benchmark that got exposed this year — WebArena, OSWorld, SWE-bench driven to 100% without solving anything — got exposed because nobody isolated the grader from the agent. We isolated it and pointed it at ourselves.

And the result names three things the research already told us and we just confirmed with clean numbers:

- "Self-correction without a real signal degrades the answer" — confirmed, it flipped a 100%-reliable task to 75%.
- Cheap reasoning models plus tools already saturate single jobs — there's no execution-quality headroom to sell.
- Reflexive orchestration is a regression. A loop that re-verifies everything, unbounded, is strictly worse than no loop on tasks the model handles.

That last one is a product directive, not a footnote. Our gate has to become **selective** — fire only when there's an actual grounded inconsistency to chase, never on reflex; never run past a budget; and never, ever be able to replace a validated answer with a worse one. The loop must be incapable of lowering a correct result. That's the next build, and it's specced.

## So where IS the value

Not in single-job execution quality. The evidence says the model already has that. Which means the honest answer is: OrgX's value lives where these single-shot worlds literally cannot see — real state across many sessions and many days, coordination across initiatives, and trust. The part where a receipt has to be *true*, an approval boundary has to actually hold, work has to resume after a failure without drift. The base model has none of that, and a one-shot pass^k can't measure it.

That's the next instrument, and it's the one that maps to what you actually want an autonomous company to do. We're going to build it the same way — grounded, isolated, reliability-first, token-honest, and pointed at ourselves.

We didn't find the win this week. We found the exact shape of where the win can't be, with receipts. That's worth more, because now we're not guessing. The bundles are public. Check the math — that's still the point.

## Update: we kept going, and the map got sharper

After that first result I didn't want to stop on "the loop is harmful," so we built the fixes and ran the rest of it. Three things.

One — we fixed the gate. The reason it broke those two runs was dumb and real: it re-derived past its budget and forgot to come back with an answer. So we gave it a hard no-regression rule — if the re-check runs out of room, you keep the answer the model already validated, full stop. The loop is now *incapable* of lowering a result it already had. Re-ran the long-horizon world: back to 8 out of 8. The harm is gone. It still costs 2.4× the tokens and adds zero quality on a task the model already nails — so now it's safe, not valuable. That's an honest place to be.

Two — we tried the thing the research swears by: decomposition. Split the twelve-order pipeline into three chunks, each in a clean context carrying only the verified state forward. And here's the beautiful part — it *aced* the hard part. The sequential inventory depletion, the exact backordered orders, the revenue — perfect, all eight times. The thing that's genuinely hard, it nailed by keeping each context small. And then it failed anyway, 7 out of 8, because the running *count* drifted at the seams between chunks — it'd say 10 fulfilled when it was 9. We fixed the hard failure and invented a new one at the boundaries. That's not a bug in the idea, it's the idea's tax: every time you split work, you create a seam, and seams leak. Nobody tells you that part.

Three — and this is the one that actually matters — we ran the gate on a *weak* model. An old 8B. And finally, the first real lift in the whole program: on the one task where the little model was *borderline* — got it right maybe one try in six — the verification gate doubled it, one in three. On the tasks the 8B could already do, the gate did nothing. On the tasks it had no prayer of doing, the gate burned eight times the tokens flailing and changed nothing. You can't verify your way into a capability the model doesn't have.

So put it all together and the map is just... clean, and it's not the map anyone sells you:

Orchestration helps in exactly one square — a model that's *almost* good enough, on a task it *almost* gets. A strong model on a normal job? The loop is pure cost. A model that's hopeless on the task? The loop is wasted motion. Everywhere except that one borderline band, "wrap it in a verification loop" is cost, no-op, or harm. And decomposition isn't a free win either — it trades one failure mode for another.

I think that's the most honest thing we've ever published, and it's better than a win, because it tells us exactly what to build: a loop that knows which square it's in and only spends when it's in the one that pays. Not "always verify." *Verify when you're on the edge.* That's the next thing. The bundles are all there — the broken runs, the fixed ones, the weak-model squares, all of it. Check it.
