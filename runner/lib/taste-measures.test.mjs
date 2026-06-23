// Run: node --test runner/lib/taste-measures.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToHue, hierarchyMonotonic, hueHarmonyResidual, hueHarmonyCoherent, birkhoffMeasure } from './taste-measures.mjs';

test('hexToHue: primaries land near 0/120/240, neutrals are null', () => {
  assert.ok(Math.abs(hexToHue('#ff0000') - 0) < 2);
  assert.ok(Math.abs(hexToHue('#00ff00') - 120) < 2);
  assert.equal(hexToHue('#808080'), null);
});

test('hierarchy must be ordered: heading >= body >= caption contrast', () => {
  const good = { heading: '#0B1020', body: '#1A2030', caption: '#595959' };
  const inverted = { heading: '#595959', body: '#1A2030', caption: '#0B1020' };
  assert.equal(hierarchyMonotonic(good, '#fff', ['heading', 'body', 'caption']).pass, true);
  assert.equal(hierarchyMonotonic(inverted, '#fff', ['heading', 'body', 'caption']).pass, false);
});

test('a triadic/analogous accent set is coherent; random scatter is not', () => {
  const triadic = ['#6366F1', '#14B8A6', '#E65100']; // ~ evenly related hues
  const random = ['#6366F1', '#7a8c10', '#bb3399']; // arbitrary
  const coh = hueHarmonyResidual(triadic).residual;
  const inc = hueHarmonyResidual(random).residual;
  assert.ok(coh < inc, `coherent ${coh} should be < random ${inc}`);
});

test('hueHarmonyCoherent gates on the residual tolerance', () => {
  // analogous indigo/iris/blue — small residual
  assert.equal(hueHarmonyCoherent(['#4338CA', '#6366F1', '#1565C0']).pass, true);
});

test('birkhoff measure rewards coherent-per-element palettes', () => {
  const coherent = birkhoffMeasure(['#4338CA', '#6366F1', '#1565C0']);
  const scattered = birkhoffMeasure(['#6366F1', '#7a8c10', '#bb3399', '#22dd55']);
  assert.ok(coherent > scattered);
});
