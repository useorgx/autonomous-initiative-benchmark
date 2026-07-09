// Run: node --test runner/lib/validate-replication-evidence-file.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validateReplicationEvidenceFile } from '../validate-replication-evidence.mjs';
import {
  REPLICATION_EVIDENCE_PROTOCOL_VERSION,
  REPLICATION_PROTOCOL_VERSION,
} from './replication-evidence.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

test('validateReplicationEvidenceFile validates standalone third-party evidence files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orgx-replication-'));
  const filePath = path.join(dir, 'third-party-replication-evidence.json');
  try {
    await writeFile(
      filePath,
      `${JSON.stringify({
        protocol_version: REPLICATION_EVIDENCE_PROTOCOL_VERSION,
        release_id: 'sota-headline-2026-q3',
        generated_at: '2026-07-10T11:00:00.000Z',
        rows: [
          {
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
          },
        ],
      })}\n`
    );

    const result = await validateReplicationEvidenceFile({ filePath, strict: true });

    assert.equal(result.ok, true);
    assert.equal(result.validRows, 1);
    assert.equal(result.agreementWithinCiRows, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
