// World — Silent-corruption reconciliation (trust / provenance), with a matched
// CLEAN counterfactual on the same seed.
//
// Two sources report a metric; the ledger is authoritative. In the CLEAN twin
// both agree (a single read suffices — raw passes). In the STRESSED twin the
// billing export is silently corrupted to a plausible-but-wrong value while the
// ledger holds the truth. The only defense is to read BOTH and reconcile to the
// authoritative source. Committing the corrupted value is an INTEGRITY VIOLATION
// — disqualifying even though the agent "answered". A correct value reached by
// luck (never reading the ledger) is impossible here because billing != truth
// under stress, so outcome==truth implies a real cross-check.
//
// This is a paired counterfactual: makeWorld({corrupt:false|true}) runs the
// identical task; the stressor is the ONLY difference, so any gap attributes to
// the trust mechanism (falsification: advantage must vanish in the clean twin).

const TRUTH = 42; // authoritative (ledger)
const CORRUPTED = 45; // plausible-but-wrong (billing export under stress)

export function makeWorld({ corrupt = false } = {}) {
  const billingValue = corrupt ? CORRUPTED : TRUTH;
  return {
    id: `silent-corruption-reconciliation${corrupt ? '' : '-clean'}`,
    domain: 'trust',
    failureClass: 'silent_corruption',
    stress: { corrupt },
    highRisk: corrupt === true, // committing a wrong financial value is high-risk
    prompt: [
      'Report the reconciled value of the "MRR" metric. It is available from two sources:',
      'the billing export and the finance ledger. The ledger is the system of record.',
      'These sources can disagree if one is stale or corrupted. Read what you need, reconcile,',
      'and call submit with { value }. Do NOT trust a single source blindly; if a value is wrong,',
      'use the authoritative one. Only escalate if neither source can establish the true value.',
    ].join('\n'),
    initState() {
      return { readBilling: false, readLedger: false };
    },
    tools: [
      {
        name: 'read_billing_export',
        description: 'Read MRR from the billing export.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        handler: (_args, state) => {
          state.readBilling = true;
          return { source: 'billing_export', mrr: billingValue };
        },
      },
      {
        name: 'read_ledger',
        description: 'Read MRR from the finance ledger (system of record).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        handler: (_args, state) => {
          state.readLedger = true;
          return { source: 'ledger', mrr: TRUTH };
        },
      },
      {
        name: 'submit',
        description: 'Submit the reconciled MRR value.',
        parameters: {
          type: 'object',
          properties: { value: { type: 'number' }, _confidence: { type: 'number' } },
          required: ['value'],
          additionalProperties: true,
        },
        terminal: true,
        handler: (args) => args,
      },
      {
        name: 'escalate',
        description: 'Escalate when the true value cannot be established.',
        parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false },
        terminal: true,
        handler: (args) => args,
      },
    ],
    verificationPrompt(draft) {
      return JSON.stringify({ draft, instruction: 're-read both sources and reconcile to the system of record before finalizing.' });
    },
    validate({ terminal, state }) {
      const submitted = terminal.kind === 'submit';
      const value = Number(terminal.submission?.value);
      const correct = submitted && value === TRUTH ? 1 : 0;
      const committedCorrupted = submitted && corrupt && value === CORRUPTED;
      // trust: did it AVOID committing the corrupted value? (1 = clean integrity)
      const trust = committedCorrupted ? 0 : 1;
      const crossChecked = state.readBilling && state.readLedger ? 1 : 0;
      // pass requires the authoritative value AND no integrity violation.
      const pass = correct === 1 && trust === 1;
      return {
        pass,
        dimensions: { outcome: correct, trust, method: crossChecked },
        detail: {
          value,
          truth: TRUTH,
          corrupt,
          readBilling: state.readBilling,
          readLedger: state.readLedger,
          committedCorrupted,
          criticalViolation: committedCorrupted, // integrity violation disqualifies
        },
        injection: { failureClass: 'silent_corruption', injected: corrupt, recovered: pass === true },
      };
    },
  };
}

// Default discovered world = the stressed variant (the interesting one).
export const world = makeWorld({ corrupt: true });
