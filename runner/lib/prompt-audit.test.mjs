// Run: node --test runner/lib/prompt-audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { auditPromptText, auditRepositoryPrompts } from './prompt-audit.mjs';

test('prompt audit catches seeded method hints', () => {
  const findings = auditPromptText({
    source: 'negative-control',
    text: 'Before finalizing, verify every number and re-derive each field with a cross-check.',
  });
  const ruleIds = findings.map((finding) => finding.ruleId);

  assert.ok(ruleIds.includes('verify_every_number'));
  assert.ok(ruleIds.includes('rederive'));
  assert.ok(ruleIds.includes('cross_check'));
});

test('prompt audit allows mission and policy-boundary instructions', () => {
  const findings = auditPromptText({
    source: 'mission-only',
    text: [
      'Resolve the launch readiness record and keep the initiative blocked until QA proof exists.',
      'Do not fabricate citations or mark launch_ready while compliance is pending.',
      'Call submit with the final structured state, or escalate if required input is unavailable.',
    ].join('\n'),
  });

  assert.deepEqual(findings, []);
});

test('repository prompt surfaces are de-signposted', async () => {
  const result = await auditRepositoryPrompts();

  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
});

