// World — Ledger running total (multi-session / kill-and-resume).
//
// Many transactions must be summed to a final balance. The single-context arms
// (raw / orgx) see the whole ledger at once and can drift or miscount as the
// list grows. The restart arm processes the ledger in SEGMENTS, each in a fresh
// context that carries forward only the verified running total — the kill-and-
// resume pattern. This is the cleanest regime where raw drifts and durable
// carried state wins.
//
// Fixtures reachable only through tools; the agent never sees this file.

// 20 transactions with varied signs/magnitudes (drift-prone to eyeball).
const TXNS = [
  120, -45, 300, -80, 60, -15, 200, -120, 90, -25,
  150, -60, 75, -30, 240, -100, 50, -20, 180, -90,
];
const SEGMENT_SIZE = 5;
const GROUND_TRUTH = { balance: TXNS.reduce((a, b) => a + b, 0) }; // = 1154

function segmentRows(lo, hi) {
  return TXNS.slice(lo, hi).map((amount, i) => ({ id: `T${lo + i + 1}`, amount }));
}

export const world = {
  id: 'ledger-running-total',
  domain: 'multi_session',
  prompt: [
    `Compute the final balance of a ${TXNS.length}-transaction ledger.`,
    'Pull the transactions and sum every amount exactly (mind the signs). Then call submit with { balance }.',
  ].join('\n'),
  initState() {
    return { queriedLedger: false };
  },
  // Single-context arms (raw / orgx / orgx2 / orgx3).
  tools: [
    {
      name: 'get_ledger',
      description: 'Return every transaction in the ledger.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      handler: (_args, state) => {
        state.queriedLedger = true;
        return { transactions: segmentRows(0, TXNS.length) };
      },
    },
    {
      name: 'compute',
      description: 'Evaluate an arithmetic expression. Returns the number.',
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
      description: 'Submit the final balance.',
      parameters: {
        type: 'object',
        properties: { balance: { type: 'number' }, _confidence: { type: 'number' } },
        required: ['balance'],
        additionalProperties: true,
      },
      terminal: true,
      handler: (args) => args,
    },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({ draft, instruction: 're-sum the ledger transaction by transaction.' });
  },
  // Restart arm: segmented kill-and-resume over carried verified state.
  restart: {
    totalItems: TXNS.length,
    segmentSize: SEGMENT_SIZE,
    initCarry() {
      return { runningBalance: 0, processed: 0 };
    },
    segmentTools(_carry, lo, hi) {
      return [
        {
          name: 'get_segment',
          description: `Return transactions ${lo + 1}..${hi}.`,
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          handler: () => ({ transactions: segmentRows(lo, hi) }),
        },
        {
          name: 'submit_segment',
          description: 'Submit the sum of THIS segment only.',
          parameters: {
            type: 'object',
            properties: { segment_sum: { type: 'number' } },
            required: ['segment_sum'],
            additionalProperties: false,
          },
          terminal: true,
          handler: (args) => ({ segment_sum: Number(args.segment_sum) || 0 }),
        },
      ];
    },
    segmentPrompt(lo, hi, n) {
      return [
        `You are resuming a ledger reconciliation. This is one segment of ${n}.`,
        `Call get_segment, sum ONLY transactions ${lo + 1}..${hi}, then call submit_segment with { segment_sum }.`,
        'Do not try to recall earlier segments — the running total is carried for you.',
      ].join('\n');
    },
    foldCarry(carry, segmentResult) {
      return {
        runningBalance: carry.runningBalance + (segmentResult.segment_sum || 0),
        processed: carry.processed + 1,
      };
    },
    finalSubmission(carry) {
      return { balance: carry.runningBalance };
    },
  },
  validate({ terminal, weg, state }) {
    const balance = Number(terminal.submission?.balance);
    const outcome = balance === GROUND_TRUTH.balance ? 1 : 0;
    // method: pulled the data via tools rather than guessing.
    const method = state.queriedLedger || (weg.segments ?? 0) > 0 ? 1 : 0;
    return {
      pass: outcome === 1,
      dimensions: { outcome, method },
      detail: { balance, expected: GROUND_TRUTH.balance, segments: weg.segments ?? 0 },
    };
  },
};
