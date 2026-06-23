// Reusable deterministic check primitives shared across domain production gates.
// (The per-domain contracts compose these; the workflow extracts the full set.)

// --- color / accessibility ---
export function relLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(fg, bg) {
  const a = relLuminance(fg);
  const b = relLuminance(bg);
  if (a == null || b == null) return null;
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}
export const wcag = {
  aaNormal: (cr) => cr != null && cr >= 4.5,
  aaaNormal: (cr) => cr != null && cr >= 7,
  aaLarge: (cr) => cr != null && cr >= 3,
  uiComponent: (cr) => cr != null && cr >= 3, // WCAG 2.2 non-text contrast (focus rings, borders)
};

// --- completeness / schema ---
export function requiredFieldsPresent(obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null || (typeof obj[f] === 'string' && !obj[f].trim()));
  return { pass: missing.length === 0, value: fields.length ? 1 - missing.length / fields.length : 1, missing };
}

// --- consistency / correctness ---
export function recomputeMatches(stated, recomputed, tol = 0) {
  const a = Number(stated);
  const b = Number(recomputed);
  const pass = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
  return { pass, value: pass ? 1 : 0, detail: { stated: a, recomputed: b } };
}

// --- naming / format conventions ---
export function matchesConvention(value, regex) {
  return { pass: regex.test(String(value ?? '')), value: regex.test(String(value ?? '')) ? 1 : 0 };
}
export const conventions = {
  kebabToken: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, // design tokens, slugs
  semverish: /^\d+\.\d+(\.\d+)?$/,
};

// --- grounding / provenance ---
// fraction of items that cite an allowed source; ungrounded items returned.
export function provenanceComplete(items, { sourceField = 'source', allowedSources = null } = {}) {
  const arr = Array.isArray(items) ? items : [];
  const ungrounded = arr.filter((it) => {
    const src = it?.[sourceField];
    if (!src || (typeof src === 'string' && !src.trim())) return true;
    if (allowedSources && !allowedSources.includes(src)) return true;
    return false;
  });
  return { pass: arr.length > 0 && ungrounded.length === 0, value: arr.length ? 1 - ungrounded.length / arr.length : 0, ungrounded };
}

// --- set fidelity (no missing / no extraneous) ---
export function exactKeySet(actualKeys, requiredKeys) {
  const a = new Set(actualKeys.map(String));
  const r = new Set(requiredKeys.map(String));
  const missing = [...r].filter((k) => !a.has(k));
  const extra = [...a].filter((k) => !r.has(k));
  return { pass: missing.length === 0 && extra.length === 0, value: r.size ? (r.size - missing.length) / (r.size + extra.length) : 1, missing, extra };
}
