// Deterministic color science for the design production gate: sRGB->Lab,
// CIE76 deltaE (perceptual distance), and color-vision-deficiency simulation
// (Machado 2009 severity-1.0 matrices). Used for color-blind-safety and
// state-perceptibility checks — no LLM judge, just math.

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const delin = (v) => { const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(s * 255))); };

function rgbToLab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [x, y, z] = [f(x), f(y), f(z)];
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labOf(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToLab(rgb) : null;
}

// CIE76 perceptual distance. ~2.3 = "just noticeable"; >=10 = clearly distinct.
export function deltaE(hexA, hexB) {
  const a = labOf(hexA);
  const b = labOf(hexB);
  if (!a || !b) return null;
  return Number(Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)).toFixed(2));
}

const CVD = {
  deuteranopia: [[0.367, 0.861, -0.228], [0.28, 0.673, 0.047], [-0.012, 0.043, 0.969]],
  protanopia: [[0.152, 1.053, -0.205], [0.115, 0.786, 0.099], [-0.004, -0.048, 1.052]],
  tritanopia: [[1.256, -0.077, -0.179], [-0.078, 0.931, 0.148], [0.005, 0.691, 0.304]],
};

// Simulate how a hex looks under a given color-vision deficiency. Applied in
// linear-RGB space then re-encoded to sRGB hex.
export function simulateCVD(hex, type) {
  const rgb = hexToRgb(hex);
  const M = CVD[type];
  if (!rgb || !M) return null;
  const L = rgb.map(lin);
  const out = M.map((row) => row[0] * L[0] + row[1] * L[1] + row[2] * L[2]).map((v) => delin(Math.max(0, Math.min(1, v))));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}

// Minimum pairwise deltaE among a set of colors under a given CVD simulation —
// the "are these still distinguishable to a color-blind viewer" number.
export function minPairwiseDeltaUnderCVD(hexes, type) {
  const sim = hexes.map((h) => simulateCVD(h, type)).filter(Boolean);
  let min = Infinity;
  for (let i = 0; i < sim.length; i += 1) for (let k = i + 1; k < sim.length; k += 1) min = Math.min(min, deltaE(sim[i], sim[k]) ?? Infinity);
  return sim.length < 2 ? null : Number(min.toFixed(2));
}
