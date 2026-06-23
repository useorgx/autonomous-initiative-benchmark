// Artifact-in-Use — DESIGN domain. Deliverable: a color palette assigning a
// foreground to each UI text role on the brand background. Downstream consumer:
// a deterministic WCAG contrast checker (the design system's CI gate) — AA
// requires >= 4.5:1 for normal text. A palette that "looks on-brand" but fails
// contrast is rejected: looks-right != usable. No LLM judge.

const BG = '#ffffff';
const ROLES = ['body', 'heading', 'link', 'button_label'];

function lin(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrastRatio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  if (a == null || b == null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

// Downstream: apply the palette to the design-system contrast gate.
export function consumePalette(wb, bg = BG) {
  const tokens = wb?.tokens ?? {};
  const results = ROLES.map((role) => {
    const fg = tokens[role];
    const ratio = fg ? contrastRatio(fg, bg) : null;
    return { role, fg, ratio, passesAA: ratio != null && ratio >= 4.5 };
  });
  const covered = results.every((r) => r.fg);
  const allPass = results.every((r) => r.passesAA);
  const accepted = covered && allPass ? 1 : 0;
  return { accepted, score: accepted ? 1 : covered ? 0.3 : 0, results, allPass, covered };
}

export const GOLD_PALETTE = { tokens: { body: '#1a1a1a', heading: '#000000', link: '#0b5fff', button_label: '#ffffff' } };
// link/button on white: #0b5fff ~ 5.6:1 ok; button_label #ffffff on white fails —
// gold uses a dark label; keep gold all-pass:
GOLD_PALETTE.tokens.button_label = '#14171a';
export const NO_ARTIFACT_SCORE = 0;

export const world = {
  id: 'design-accessibility-in-use',
  domain: 'design',
  prompt: [
    `Define the text-color tokens for the UI on the brand background ${BG}. Roles: ${ROLES.join(', ')}.`,
    'Submit { tokens: { role: "#hex", ... } }. The design-system CI gate will apply your palette and reject it unless EVERY role meets WCAG AA contrast (>= 4.5:1) against the background.',
  ].join('\n'),
  initState() { return { readBrand: false }; },
  tools: [
    { name: 'get_brand', description: 'Return the brand background and role list.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readBrand = true; return { background: BG, roles: ROLES }; } },
    { name: 'check_contrast', description: 'Return the WCAG contrast ratio of a fg hex against the background.', parameters: { type: 'object', properties: { fg: { type: 'string' } }, required: ['fg'], additionalProperties: false }, handler: (a) => ({ ratio: contrastRatio(a.fg, BG) }) },
    { name: 'submit', description: 'Submit the palette tokens.', parameters: { type: 'object', properties: { tokens: { type: 'object' }, _confidence: { type: 'number' } }, required: ['tokens'], additionalProperties: true }, terminal: true, handler: (a) => a },
    { name: 'escalate', description: 'Escalate if a compliant palette cannot be produced.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (a) => a },
  ],
  verificationPrompt(draft) { return JSON.stringify({ draft, instruction: 'check each role with check_contrast; every role must be >= 4.5 before submitting.' }); },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') return { pass: false, dimensions: { outcome: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    const ds = consumePalette(terminal.submission ?? {});
    return {
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.allPass ? 1 : 0, artifact_valid: ds.covered ? 1 : 0, downstream: ds.accepted, method: state.readBrand ? 1 : 0 },
      detail: { ...ds, normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
