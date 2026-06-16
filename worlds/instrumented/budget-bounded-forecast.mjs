// World — Budget-bounded forecast (economy / quality-per-dollar).
//
// A simple forecast that any competent model gets right — the discriminator is
// EFFICIENCY. There is a strict tool-call budget; exceeding it misses the
// planning deadline and the forecast is rejected. This is where reflexive
// verification (orgx) can HURT: an extra re-derivation pass costs budget on a
// step that didn't need it, while verify-on-the-edge (orgx3) stays efficient.
// Headline metric across arms is quality-per-Ktoken / pass-within-budget.
//
// Fixtures reachable only through tools; the agent never sees this file.

const HISTORY = [
  { month: '2026-01', tickets: 100 },
  { month: '2026-02', tickets: 110 },
  { month: '2026-03', tickets: 120 },
  { month: '2026-04', tickets: 130 },
  { month: '2026-05', tickets: 140 },
];

// Linear +10/month trend → next month (2026-06) = 150.
const GROUND_TRUTH = { forecast: 150, tolerance: 5 };
const TOOL_CALL_BUDGET = 5;

export const world = {
  id: 'budget-bounded-forecast',
  domain: 'economy',
  prompt: [
    'Forecast next month (2026-06) support-ticket volume from the history.',
    `STRICT EFFICIENCY BUDGET: you have ${TOOL_CALL_BUDGET} tool calls total. Exceeding the budget means the forecast misses the planning deadline and is REJECTED, no matter how correct.`,
    'Pull the history, compute the trend, and call submit with { forecast } — efficiently.',
  ].join('\n'),
  initState() {
    return {};
  },
  tools: [
    {
      name: 'get_history',
      description: 'Return the monthly support-ticket history.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      handler: () => ({ history: HISTORY }),
    },
    {
      name: 'compute',
      description: 'Evaluate an arithmetic expression (e.g. "140 + 10"). Returns the number.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string' } },
        required: ['expression'],
        additionalProperties: false,
      },
      handler: (args) => {
        const expr = String(args.expression || '');
        if (!/^[\d+\-*/(). ]+$/.test(expr)) return { error: 'only arithmetic is allowed' };
        try {
          return { result: Function(`"use strict";return (${expr});`)() };
        } catch {
          return { error: 'could not evaluate' };
        }
      },
    },
    {
      name: 'submit',
      description: 'Submit the forecast.',
      parameters: {
        type: 'object',
        properties: { forecast: { type: 'number' }, _confidence: { type: 'number' } },
        required: ['forecast'],
        additionalProperties: true,
      },
      terminal: true,
      handler: (args) => args,
    },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({ draft, instruction: 're-derive the forecast from the history trend (but mind the budget).' });
  },
  validate({ terminal, weg }) {
    const forecast = Number(terminal.submission?.forecast);
    const outcome = Math.abs(forecast - GROUND_TRUTH.forecast) <= GROUND_TRUTH.tolerance ? 1 : 0;
    const toolCalls = weg.toolCalls?.length ?? 0;
    const within_budget = toolCalls <= TOOL_CALL_BUDGET ? 1 : 0;
    // A correct-but-late forecast is rejected: pass requires BOTH.
    const pass = outcome === 1 && within_budget === 1;
    return {
      pass,
      dimensions: { outcome, within_budget },
      detail: { forecast, expected: GROUND_TRUTH.forecast, toolCalls, budget: TOOL_CALL_BUDGET },
    };
  },
};
