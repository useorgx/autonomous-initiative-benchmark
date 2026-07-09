// Run: node --test runner/lib/human-baseline-session-kits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHumanBaselinePlan,
  buildHumanBaselineSessionPackets,
} from './human-baseline-plan.mjs';
import {
  HUMAN_BASELINE_SESSION_KIT_VERSION,
  buildHumanBaselineSessionKits,
  validateHumanBaselineSessionKits,
} from './human-baseline-session-kits.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

test('buildHumanBaselineSessionKits materializes participant-safe markdown kits', () => {
  const packetDocument = buildPackets();
  const result = buildHumanBaselineSessionKits(packetDocument, {
    generatedAt: '2026-07-09T02:10:00.000Z',
    outputDir: 'results/human-baseline-kits',
  });

  assert.equal(result.ok, true);
  assert.equal(result.kitDocument.kit_version, HUMAN_BASELINE_SESSION_KIT_VERSION);
  assert.equal(result.kitDocument.summary.kits, 6);
  assert.equal(result.kitDocument.summary.assigned_kits, 1);
  assert.equal(result.kitDocument.summary.unassigned_kits, 5);
  assert.equal(result.kitDocument.summary.private_validator_access_count, 0);

  const assigned = result.kitDocument.kits.find((kit) => kit.status === 'assigned');
  assert.equal(assigned.assignee_id, 'rev-1');
  assert.match(assigned.content_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(assigned.markdown, /Consent And Eligibility Checklist/);
  assert.match(assigned.markdown, /record:human-baseline/);
  assert.equal(/validatorBundleHash|answer key/i.test(assigned.markdown), false);
});

test('validateHumanBaselineSessionKits catches stale hashes and leakage', () => {
  const result = buildHumanBaselineSessionKits(buildPackets(), {
    generatedAt: '2026-07-09T02:10:00.000Z',
  });
  const broken = structuredClone(result.kitDocument);
  broken.kits[0].markdown += '\nThe answer key is here.';
  broken.summary.kits = 999;

  const validation = validateHumanBaselineSessionKits(broken, { strict: true });
  const text = validation.errors.join('\n');

  assert.equal(validation.ok, false);
  assert.match(text, /content_sha256 does not match markdown/);
  assert.match(text, /answer-key leakage/);
  assert.match(text, /summary.kits 999 must equal computed/);
});

function buildPackets() {
  const { plan } = buildHumanBaselinePlan({
    registry: {
      splits: {
        private_holdout: {
          worlds: [
            { worldId: 'holdout-1', domain: 'revenue_reconciliation' },
            { worldId: 'holdout-2', domain: 'design_accessibility' },
          ],
        },
      },
    },
    experts: [
      {
        expert_id: 'rev-1',
        domains: ['revenue_reconciliation'],
        max_sessions: 1,
        operator_profile_hash: hash('1'),
        recruitment_channel: 'expert-network',
        due_at: '2026-07-12T00:00:00.000Z',
      },
    ],
    generatedAt: '2026-07-09T00:00:00.000Z',
    releaseId: 'sota-headline-2026-q3',
  });
  const { ok, packetDocument } = buildHumanBaselineSessionPackets(plan, {
    generatedAt: '2026-07-09T01:00:00.000Z',
  });
  assert.equal(ok, true);
  return packetDocument;
}
