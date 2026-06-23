// Quantified taste — the "beauty has mathematical coherence, even when
// asymmetric" hypothesis, made deterministic. These measures do NOT claim to
// certify beauty; they are NECESSARY conditions whose VIOLATION is reliably bad
// taste (an inverted visual hierarchy, hues with no harmonic relationship). They
// falsify ugliness; they cannot guarantee greatness. The thresholds are meant to
// be DERIVED from rated exemplars (LLM as measurement/derivation tool) and
// re-tuned by the product<->benchmark loop when human overrides reveal a miss —
// which is exactly how the irreducible, hard-to-code residue of taste is handled
// without making an LLM the runtime oracle.

import { contrastRatio } from './production-checks.mjs';
import { hexToRgb } from './color-science.mjs';

export function hexToHue(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null; // achromatic (neutral) — no hue
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  return ((h % 360) + 360) % 360;
}

// 1. Visual hierarchy must be ORDERED: more-prominent roles carry more contrast.
// roles given most->least prominent (e.g. ['heading','body','caption']).
export function hierarchyMonotonic(textColors, bg, roles) {
  const cr = roles.map((r) => contrastRatio(textColors?.[r], bg));
  let ok = true;
  for (let i = 1; i < cr.length; i += 1) if (!(cr[i] != null && cr[i - 1] != null && cr[i - 1] >= cr[i] - 0.01)) ok = false;
  return { pass: ok, value: ok ? 1 : 0, detail: Object.fromEntries(roles.map((r, i) => [r, cr[i]])) };
}

// 2. Hue harmony: chromatic accents should relate by recognizable intervals
// (analogous / complementary / triadic / split), not scatter randomly. Coherent
// asymmetry is fine — harmony is an angular RELATIONSHIP, not symmetry. Residual
// = mean distance of each pairwise hue gap to the nearest harmonic angle.
const HARMONIC = [0, 30, 60, 90, 120, 150, 180];
export function hueHarmonyResidual(hexes) {
  const hues = hexes.map(hexToHue).filter((h) => h != null);
  if (hues.length < 2) return { residual: null, n: hues.length };
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < hues.length; i += 1) for (let k = i + 1; k < hues.length; k += 1) {
    let diff = Math.abs(hues[i] - hues[k]) % 360;
    if (diff > 180) diff = 360 - diff;
    total += Math.min(...HARMONIC.map((a) => Math.abs(diff - a)));
    pairs += 1;
  }
  return { residual: Number((total / pairs).toFixed(2)), n: hues.length };
}

export function hueHarmonyCoherent(hexes, { tol = 14 } = {}) {
  const r = hueHarmonyResidual(hexes);
  return { pass: r.residual != null && r.residual <= tol, value: r.residual == null ? 0 : Math.max(0, 1 - r.residual / 90), residual: r.residual };
}

// 3. Birkhoff-style aesthetic measure proxy M = Order / Complexity. Order = how
// many accent pairs sit on a harmonic interval; Complexity = distinct hues.
// Higher = more coherent-per-element. Reported, not gated (it ranks, doesn't pass/fail).
export function birkhoffMeasure(hexes, { tol = 14 } = {}) {
  const hues = hexes.map(hexToHue).filter((h) => h != null);
  if (hues.length < 2) return null;
  let order = 0;
  let pairs = 0;
  for (let i = 0; i < hues.length; i += 1) for (let k = i + 1; k < hues.length; k += 1) {
    let diff = Math.abs(hues[i] - hues[k]) % 360;
    if (diff > 180) diff = 360 - diff;
    if (Math.min(...HARMONIC.map((a) => Math.abs(diff - a))) <= tol) order += 1;
    pairs += 1;
  }
  const complexity = new Set(hues).size;
  return Number((order / pairs / complexity).toFixed(4));
}
