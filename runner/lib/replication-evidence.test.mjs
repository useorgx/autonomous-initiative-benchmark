// Run: node --test runner/lib/replication-evidence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPLICATION_EVIDENCE_PROTOCOL_VERSION,
  REPLICATION_PROTOCOL_VERSION,
  summarizeReplicationRows,
  validateReplicationEvidenceDocument,
  validateReplicationRow,
} from './replication-evidence.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function row(overrides = {}) {
  return {
    protocol_version: REPLICATION_PROTOCOL_VERSION,
    party_id: 'external-lab-1',
    party_name: 'External Lab 1',
    world_id: 'holdout-2026q3-01-revenue_leakage',
    submission_id: 'submission-1',
    model_manifest_id: 'models-frontier-2026q3',
    run_manifest_id: 'run-private-holdout-2026q3',
    seed_commitment_hash: hash('a'),
    signed_receipt_hash: hash('b'),
    scorecard_hash: hash('c'),
    replication_protocol_hash: hash('d'),
    discrepancy_log_hash: hash('e'),
    submitted_at: '2026-07-08T10:00:00.000Z',
    scored_at: '2026-07-08T10:05:00.000Z',
    agreement_within_ci: true,
    discrepancies: [],
    ...overrides,
  };
}

function evidenceDocument(overrides = {}) {
  return {
    protocol_version: REPLICATION_EVIDENCE_PROTOCOL_VERSION,
    release_id: 'sota-headline-2026-q3',
    generated_at: '2026-07-10T11:00:00.000Z',
    rows: [row()],
    ...overrides,
  };
}

test('validateReplicationRow accepts signed third-party evidence rows', () => {
  assert.equal(validateReplicationRow(row()), null);
});

test('validateReplicationRow rejects rows without signed receipt and discrepancy log provenance', () => {
  assert.match(validateReplicationRow(row({ signed_receipt_hash: 'missing' })), /signed_receipt_hash/);
  assert.match(validateReplicationRow(row({ discrepancy_log_hash: 'missing' })), /discrepancy_log_hash/);
  assert.match(
    validateReplicationRow(row({ scored_at: '2026-07-08T09:59:00.000Z' })),
    /scored_at/
  );
});

test('summarizeReplicationRows counts only valid rows and reports independent coverage', () => {
  const summary = summarizeReplicationRows([
    row(),
    row({ party_id: 'external-lab-2', party_name: 'External Lab 2', world_id: 'holdout-2026q3-02-incident_trust_recovery' }),
    row({ party_id: '', party_name: '' }),
  ]);

  assert.equal(summary.ok, false);
  assert.equal(summary.rows, 3);
  assert.equal(summary.validRows, 2);
  assert.equal(summary.invalidRows, 1);
  assert.equal(summary.independentParties, 2);
  assert.equal(summary.replicatedWorlds, 2);
});

test('validateReplicationEvidenceDocument accepts standalone third-party evidence files', () => {
  const result = validateReplicationEvidenceDocument(evidenceDocument(), { strict: true });

  assert.equal(result.ok, true);
  assert.equal(result.summary.validRows, 1);
  assert.equal(result.summary.agreementWithinCiRows, 1);
});

test('validateReplicationEvidenceDocument rejects malformed rows and empty strict handoffs', () => {
  const malformed = validateReplicationEvidenceDocument(
    evidenceDocument({ rows: [row({ scorecard_hash: 'missing' })] }),
    { strict: true }
  );
  const empty = validateReplicationEvidenceDocument(evidenceDocument({ rows: [] }), { strict: true });

  assert.equal(malformed.ok, false);
  assert.match(malformed.errors.join('\n'), /rows\[0\].*scorecard_hash/);
  assert.equal(empty.ok, false);
  assert.match(empty.errors.join('\n'), /at least one valid third-party replication row/);
});
