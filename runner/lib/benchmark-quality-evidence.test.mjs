import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTAMINATION_AUDIT_PROTOCOL_VERSION,
  CORRECTION_LEDGER_PROTOCOL_VERSION,
  STATISTICAL_PRECISION_PROTOCOL_VERSION,
  WORLD_QUALITY_PROTOCOL_VERSION,
  validateContaminationAudit,
  validateCorrectionLedger,
  validateStatisticalPrecisionReport,
  validateWorldQualityAudit,
} from './benchmark-quality-evidence.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;

function worldQuality(overrides = {}) {
  return {
    protocol_version: WORLD_QUALITY_PROTOCOL_VERSION,
    release_id: 'release-1',
    generated_at: '2026-07-09T20:00:00.000Z',
    status: 'complete',
    thresholds: {
      minimumIndependentReviewers: 5,
      maximumFalseAcceptanceRate: 0.02,
      maximumFalseRejectionRate: 0.02,
      maximumAmbiguityRate: 0.05,
      minimumReviewerAgreement: 0.67,
      minimumCounterfactualTwinPassRate: 0.95,
      minimumMetamorphicPassRate: 0.95,
      minimumDelayedConsequencePassRate: 0.95,
      maximumSevereDefects: 0,
    },
    worlds: [
      {
        world_id: 'world-1',
        generator_hash: hash('a'),
        reviewer_ids: ['r1', 'r2', 'r3', 'r4', 'r5'],
        solution_zoo: {
          valid_solution_count: 3,
          invalid_solution_count: 5,
          accepts_all_valid: true,
          rejects_all_invalid: true,
          false_acceptance_rate: 0,
          false_rejection_rate: 0,
        },
        task_audit: {
          overly_strict_tests: 0,
          underspecified_prompt: 0,
          low_coverage_tests: 0,
          misleading_prompt: 0,
          severe_defects: 0,
          ambiguity_rate: 0,
          reviewer_agreement: 0.8,
        },
        counterfactual_twins: { case_count: 20, passed_count: 20, pass_rate: 1 },
        metamorphic_tests: { case_count: 20, passed_count: 19, pass_rate: 0.95 },
        delayed_consequence_tests: { case_count: 20, passed_count: 20, pass_rate: 1 },
        status: 'eligible',
      },
    ],
    ...overrides,
  };
}

function contamination(overrides = {}) {
  return {
    protocol_version: CONTAMINATION_AUDIT_PROTOCOL_VERSION,
    release_id: 'release-1',
    generated_at: '2026-07-09T20:00:00.000Z',
    status: 'complete',
    policy: {
      sealed_vault: true,
      just_in_time_seeds: true,
      signed_access_log: true,
      provider_retention_controls: true,
      burn_on_strong_leak_signal: true,
    },
    worlds: [
      {
        world_id: 'world-1',
        probe_runs: 15,
        canary_count: 3,
        access_event_count: 4,
        strong_leak_signals: 0,
        burned: false,
        burn_reason: null,
        headline_eligible: true,
      },
    ],
    ...overrides,
  };
}

function precision(overrides = {}) {
  return {
    protocol_version: STATISTICAL_PRECISION_PROTOCOL_VERSION,
    release_id: 'release-1',
    generated_at: '2026-07-09T20:00:00.000Z',
    status: 'complete',
    policy: {
      minimumEpisodesPerCell: 8,
      maximumCiWidth: 0.1,
      paired_seeds: true,
      hierarchical_model: true,
      suppress_rank_on_overlap: true,
    },
    cells: [
      {
        world_id: 'world-1',
        model_id: 'model-1',
        arm: 'orgx_full',
        attempts: 64,
        ci_low: 0.81,
        ci_high: 0.9,
        precision_met: true,
      },
    ],
    ...overrides,
  };
}

test('complete quality evidence passes strict validation', () => {
  assert.equal(validateWorldQualityAudit(worldQuality(), { strict: true, expectedWorldIds: ['world-1'] }).ok, true);
  assert.equal(validateContaminationAudit(contamination(), { strict: true, expectedWorldIds: ['world-1'] }).ok, true);
  assert.equal(validateStatisticalPrecisionReport(precision(), { strict: true }).ok, true);
  assert.equal(
    validateCorrectionLedger(
      {
        protocol_version: CORRECTION_LEDGER_PROTOCOL_VERSION,
        updated_at: '2026-07-09T20:00:00.000Z',
        status: 'active',
        entries: [],
      },
      { strict: true, releaseId: 'release-1' }
    ).ok,
    true
  );
});

test('world-quality negative controls catch narrow graders, shortcuts, and weak twins', () => {
  const document = worldQuality();
  document.worlds[0].solution_zoo.accepts_all_valid = false;
  document.worlds[0].solution_zoo.false_acceptance_rate = 0.2;
  document.worlds[0].task_audit.overly_strict_tests = 1;
  document.worlds[0].task_audit.severe_defects = 1;
  document.worlds[0].counterfactual_twins = { case_count: 20, passed_count: 10, pass_rate: 0.5 };
  const validation = validateWorldQualityAudit(document, { strict: true, expectedWorldIds: ['world-1'] });
  const text = validation.errors.join('\n');

  assert.equal(validation.ok, false);
  assert.match(text, /accepts_all_valid/);
  assert.match(text, /false_acceptance_rate/);
  assert.match(text, /severe_defects/);
  assert.match(text, /counterfactual_twins.pass_rate/);
});

test('contamination evidence burns leaked worlds and suppresses headline use', () => {
  const document = contamination();
  document.worlds[0].strong_leak_signals = 1;
  const validation = validateContaminationAudit(document, { strict: true, expectedWorldIds: ['world-1'] });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /must be burned/);
  assert.match(validation.errors.join('\n'), /cannot be headline_eligible/);
});

test('precision is gated by interval width rather than minimum n alone', () => {
  const document = precision();
  document.cells[0].attempts = 100;
  document.cells[0].ci_low = 0.55;
  document.cells[0].ci_high = 0.8;
  const validation = validateStatisticalPrecisionReport(document, { strict: true });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /CI width/);
});

test('open severe corrections block publication and resolved ones require recomputation', () => {
  const base = {
    protocol_version: CORRECTION_LEDGER_PROTOCOL_VERSION,
    updated_at: '2026-07-09T20:00:00.000Z',
    status: 'active',
    entries: [
      {
        correction_id: 'corr-1',
        reported_at: '2026-07-09T19:00:00.000Z',
        status: 'open',
        severity: 'severe',
        affected_release_ids: ['release-1'],
        affected_world_ids: ['world-1'],
        public_summary: 'A valid alternative solution was rejected.',
        score_recomputed: false,
      },
    ],
  };
  const open = validateCorrectionLedger(base, { strict: true, releaseId: 'release-1' });
  assert.equal(open.ok, false);
  assert.match(open.errors.join('\n'), /open severe or critical/);

  base.entries[0].status = 'resolved';
  const unrecomputed = validateCorrectionLedger(base, { strict: true, releaseId: 'release-1' });
  assert.equal(unrecomputed.ok, false);
  assert.match(unrecomputed.errors.join('\n'), /score_recomputed/);
});
