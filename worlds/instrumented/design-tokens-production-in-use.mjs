// Artifact-in-Use — DESIGN domain, PRODUCTION bar (supersedes the toy
// design-accessibility world). Deliverable: a design-token package that could
// actually merge to the component library. Graded by the shared production gate
// (runGate) against ~12 quantified, deterministic checks — the same Acceptance
// Schema the product would run + show the user as a receipt. No LLM judge.
//
// Why this lands the frontier well below 1.0: a model can pick on-brand readable
// colors, but it must SIMULTANEOUSLY clear AA in both modes, keep links on-brand
// AND accessible (brand iris fails contrast — must darken without leaving the
// family), give a real focus indicator, keep statuses distinguishable UNDER
// color-blindness (the red/green trap), use non-color cues, and not overclaim AAA.

import { runGate, check } from '../../runner/lib/production-gate.mjs';
import { contrastRatio, wcag } from '../../runner/lib/production-checks.mjs';
import { deltaE, minPairwiseDeltaUnderCVD } from '../../runner/lib/color-science.mjs';

const BRAND = { lime: '#BFFF00', teal: '#14B8A6', iris: '#6366F1', ink: '#0B1020', inkSoft: '#1A2030' };
const BG = { light: '#FFFFFF', dark: '#02040A' };
const TEXT_ROLES = ['body', 'heading', 'link', 'caption'];
const STATUSES = ['success', 'warning', 'danger', 'info'];
const STATE_KEYS = ['default', 'hover', 'active', 'focus', 'disabled'];
const CVD_TYPES = ['deuteranopia', 'protanopia', 'tritanopia'];

// A link/accent must trace to a CHROMATIC brand hue (lime/teal/iris) — NOT a
// neutral ink (every dark color is near-black in Lab, so neutrals would let any
// dark color "trace"). tol 45 admits darkened shades + tints of a brand hue; an
// off-brand color (dark green -> teal ~55, brown ~65) is rejected.
const BRAND_ACCENTS = { lime: BRAND.lime, teal: BRAND.teal, iris: BRAND.iris };
const tracesToBrand = (hex, tol = 45) => Object.values(BRAND_ACCENTS).some((b) => (deltaE(hex, b) ?? 999) <= tol);

// The production gate: each check is deterministic and severity-weighted.
// Exported so the Acceptance Schema / product<->benchmark loop can wrap + evolve it.
export const GATE = [
  check('text-aa-both-modes', 'accessibility', 'blocker', (a) => {
    const fails = [];
    for (const mode of ['light', 'dark']) for (const role of TEXT_ROLES) {
      const cr = contrastRatio(a?.textColors?.[mode]?.[role], BG[mode]);
      if (!wcag.aaNormal(cr)) fails.push(`${mode}.${role}=${cr}`);
    }
    return { pass: fails.length === 0, value: fails.length === 0 ? 1 : 0, detail: fails };
  }),
  check('coverage', 'completeness', 'blocker', (a) => {
    const ok = ['light', 'dark'].every((m) => TEXT_ROLES.every((r) => a?.textColors?.[m]?.[r])) &&
      STATUSES.every((s) => a?.statuses?.[s]?.color) && STATE_KEYS.every((k) => a?.buttonStates?.[k]) && a?.focus?.color != null;
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('brand-primitives-accurate', 'brand', 'blocker', (a) => {
    const fails = Object.entries(BRAND).filter(([k, v]) => (deltaE(a?.brandPrimitives?.[k], v) ?? 999) > 8).map(([k]) => k);
    return { pass: fails.length === 0, value: fails.length === 0 ? 1 : 0, detail: fails };
  }),
  check('link-traces-to-brand', 'brand', 'blocker', (a) => {
    const ok = tracesToBrand(a?.textColors?.light?.link) && tracesToBrand(a?.textColors?.dark?.link);
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('link-also-accessible', 'accessibility', 'blocker', (a) => {
    const ok = wcag.aaNormal(contrastRatio(a?.textColors?.light?.link, BG.light)) && wcag.aaNormal(contrastRatio(a?.textColors?.dark?.link, BG.dark));
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('focus-indicator', 'accessibility', 'blocker', (a) => {
    const f = a?.focus ?? {};
    const vsBg = contrastRatio(f.color, BG.light);
    const vsBtn = contrastRatio(f.color, a?.buttonStates?.default);
    const ok = Number(f.thicknessPx ?? 0) >= 2 && wcag.uiComponent(vsBg) && wcag.uiComponent(vsBtn);
    return { pass: ok, value: ok ? 1 : 0, detail: { vsBg, vsBtn, thickness: f.thicknessPx } };
  }),
  check('status-cvd-distinguishable', 'accessibility', 'major', (a) => {
    const colors = STATUSES.map((s) => a?.statuses?.[s]?.color).filter(Boolean);
    if (colors.length < 4) return { pass: false, value: 0 };
    const mins = CVD_TYPES.map((t) => minPairwiseDeltaUnderCVD(colors, t) ?? 0);
    const ok = mins.every((d) => d >= 10);
    return { pass: ok, value: ok ? 1 : 0, detail: Object.fromEntries(CVD_TYPES.map((t, i) => [t, mins[i]])) };
  }),
  check('use-of-color-cues', 'accessibility', 'major', (a) => {
    const cues = STATUSES.map((s) => a?.statuses?.[s] ?? {});
    const labels = cues.map((c) => String(c.label ?? '').toLowerCase().trim());
    const icons = cues.map((c) => String(c.icon ?? '').trim());
    const allPresent = cues.every((c) => c.label && c.icon);
    const uniqueLabels = new Set(labels).size === labels.length && !labels.some((l) => ['status', 'info', ''].includes(l) && labels.filter((x) => x === l).length > 1);
    const uniqueIcons = new Set(icons).size === icons.length && icons.every(Boolean);
    const ok = allPresent && uniqueLabels && uniqueIcons;
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('status-contrast', 'accessibility', 'major', (a) => {
    const ok = STATUSES.every((s) => wcag.uiComponent(contrastRatio(a?.statuses?.[s]?.color, BG.light)));
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('state-perceptible-delta', 'consistency', 'major', (a) => {
    const b = a?.buttonStates ?? {};
    const pairs = [['default', 'hover'], ['hover', 'active'], ['default', 'active']];
    const ok = pairs.every(([x, y]) => (deltaE(b[x], b[y]) ?? 0) >= 3);
    return { pass: ok, value: ok ? 1 : 0 };
  }),
  check('no-aaa-overclaim', 'standards', 'major', (a) => {
    const claims = Array.isArray(a?.claims) ? a.claims : [];
    const aaa = claims.find((c) => String(c.standard).toUpperCase() === 'AAA');
    if (!aaa) return { pass: true, value: 1 }; // no AAA claim, nothing to overclaim
    const role = aaa.scope === 'body' ? 'body' : null;
    if (!role) return { pass: true, value: 1 };
    const ok = ['light', 'dark'].every((m) => wcag.aaaNormal(contrastRatio(a?.textColors?.[m]?.[role], BG[m])));
    return { pass: ok, value: ok ? 1 : 0, detail: 'claimed AAA body but a mode is < 7:1' };
  }),
  check('hex-format', 'standards', 'minor', (a) => {
    const all = [...TEXT_ROLES.flatMap((r) => ['light', 'dark'].map((m) => a?.textColors?.[m]?.[r])), ...STATUSES.map((s) => a?.statuses?.[s]?.color)];
    const ok = all.every((h) => /^#[0-9a-f]{6}$/i.test(String(h ?? '')));
    return { pass: ok, value: ok ? 1 : 0 };
  }),
];

export function consumeTokens(artifact) {
  const gate = runGate(GATE, artifact ?? {}, {}, { shipThreshold: 0.95 });
  return { ...gate, accepted: gate.shipped ? 1 : 0 };
}

// Gold artifact: clears every gate (links darkened-but-on-brand, statuses
// lightness-varied so they survive CVD, real focus ring, non-color cues).
export const GOLD = {
  brandPrimitives: { ...BRAND },
  textColors: {
    light: { body: '#1A2030', heading: '#0B1020', caption: '#595959', link: '#4338CA' },
    dark: { body: '#E6E9F0', heading: '#FFFFFF', caption: '#A7AFBE', link: '#818CF8' },
  },
  statuses: {
    success: { color: '#1B5E20', icon: 'check', label: 'Success' },
    warning: { color: '#E65100', icon: 'alert-triangle', label: 'Warning' },
    danger: { color: '#C2185B', icon: 'x', label: 'Error' },
    info: { color: '#1565C0', icon: 'info-circle', label: 'Info' },
  },
  focus: { color: '#1A2030', thicknessPx: 2 },
  buttonStates: { default: '#14B8A6', hover: '#0E9384', active: '#0B7468', focus: '#1A2030', disabled: '#9CA3AF' },
  claims: [{ standard: 'AAA', scope: 'body' }],
};
export const NO_ARTIFACT_SCORE = 0;

export const world = {
  id: 'design-tokens-production-in-use',
  domain: 'design',
  prompt: [
    'Produce a production design-token package for the OrgX "Luminous Glass" system that could merge to the shared component library.',
    'Read the brand guide and accessibility standards. Submit: brandPrimitives (restate exactly), textColors per role per mode (body/heading/link/caption, light+dark), statuses (success/warning/danger/info each with color + a non-color icon + a label), a focus indicator (color + thicknessPx), buttonStates (default/hover/active/focus/disabled), and any accessibility claims.',
    'The design-system CI gate will reject the package unless EVERY production check passes: AA contrast in both modes, links on-brand AND accessible, a real focus indicator, statuses that stay distinguishable under color blindness with non-color cues, perceptibly different button states, and no overclaimed AAA.',
  ].join('\n'),
  initState() { return { readBrand: false, readStandards: false }; },
  tools: [
    { name: 'get_brand_guide', description: 'Return the canonical brand palette + backgrounds + required roles/states/statuses.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readBrand = true; return { brand: BRAND, backgrounds: BG, textRoles: TEXT_ROLES, statuses: STATUSES, states: STATE_KEYS }; } },
    { name: 'get_accessibility_standards', description: 'Return the accessibility + token standards.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readStandards = true; return { standards: 'WCAG 2.2: normal text AA >= 4.5:1, AAA >= 7:1; non-text/UI (focus, borders) >= 3:1, focus thickness >= 2px. SC 1.4.1: never rely on color alone — each status needs a unique non-color cue. Status colors must stay distinguishable under deuteranopia/protanopia/tritanopia. Links must be on-brand AND accessible. Do not claim a level you do not meet in BOTH modes.' }; } },
    { name: 'submit', description: 'Submit the design-token package.', parameters: { type: 'object', properties: { brandPrimitives: { type: 'object' }, textColors: { type: 'object' }, statuses: { type: 'object' }, focus: { type: 'object' }, buttonStates: { type: 'object' }, claims: { type: 'array' }, _confidence: { type: 'number' } }, required: ['brandPrimitives', 'textColors', 'statuses', 'focus', 'buttonStates'], additionalProperties: true }, terminal: true, handler: (a) => a },
    { name: 'escalate', description: 'Escalate if the package cannot be produced to standard.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (a) => a },
  ],
  verificationPrompt(draft) { return JSON.stringify({ draft, instruction: 're-check every text role for AA in BOTH modes, confirm the focus ring contrast/thickness, and simulate the four status colors under color blindness — they must stay distinguishable.' }); },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') return { pass: false, dimensions: { outcome: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    const ds = consumeTokens(terminal.submission ?? {});
    return {
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.weightedScore >= 0.95 ? 1 : 0, accessibility: ds.byDimension.accessibility ? ds.byDimension.accessibility.passed / ds.byDimension.accessibility.total : 0, downstream: ds.accepted, method: state.readBrand && state.readStandards ? 1 : 0 },
      detail: { weightedScore: ds.weightedScore, shipped: ds.shipped, blockersFailed: ds.blockersFailed, failed: ds.failed, byDimension: ds.byDimension, normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
