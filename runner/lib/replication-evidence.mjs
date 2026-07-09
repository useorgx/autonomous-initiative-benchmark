const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

export const REPLICATION_PROTOCOL_VERSION = 'third_party_replication_v1';
export const REPLICATION_EVIDENCE_PROTOCOL_VERSION = 'third_party_replication_evidence_v1';

export function validateReplicationRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return 'replication row must be an object';
  }
  if (row.protocol_version !== REPLICATION_PROTOCOL_VERSION) {
    return `protocol_version must be ${REPLICATION_PROTOCOL_VERSION}`;
  }
  if (!nonEmpty(row.party_id)) return 'party_id is required';
  if (!nonEmpty(row.party_name)) return 'party_name is required';
  if (!nonEmpty(row.world_id)) return 'world_id is required';
  if (!nonEmpty(row.submission_id)) return 'submission_id is required';
  if (!nonEmpty(row.model_manifest_id)) return 'model_manifest_id is required';
  if (!nonEmpty(row.run_manifest_id)) return 'run_manifest_id is required';
  if (!isSha256(row.seed_commitment_hash)) return 'seed_commitment_hash must be sha256:<64 hex>';
  if (!isSha256(row.signed_receipt_hash)) return 'signed_receipt_hash must be sha256:<64 hex>';
  if (!isSha256(row.scorecard_hash)) return 'scorecard_hash must be sha256:<64 hex>';
  if (!isSha256(row.replication_protocol_hash)) return 'replication_protocol_hash must be sha256:<64 hex>';
  if (!isSha256(row.discrepancy_log_hash)) return 'discrepancy_log_hash must be sha256:<64 hex>';
  if (!isIso(row.submitted_at)) return 'submitted_at must be an ISO timestamp';
  if (!isIso(row.scored_at)) return 'scored_at must be an ISO timestamp';
  if (Date.parse(row.scored_at) < Date.parse(row.submitted_at)) {
    return 'scored_at must be after submitted_at';
  }
  if (typeof row.agreement_within_ci !== 'boolean') {
    return 'agreement_within_ci must be a boolean';
  }
  if (!Array.isArray(row.discrepancies)) return 'discrepancies must be an array';
  return null;
}

export function summarizeReplicationRows(rows) {
  const allRows = Array.isArray(rows) ? rows : [];
  const errors = [];
  const validRows = [];
  for (let index = 0; index < allRows.length; index += 1) {
    const error = validateReplicationRow(allRows[index]);
    if (error) errors.push({ index, error });
    else validRows.push(allRows[index]);
  }
  const independentParties = new Set(validRows.map((row) => row.party_id));
  const replicatedWorlds = new Set(validRows.map((row) => row.world_id));
  return {
    ok: errors.length === 0,
    rows: allRows.length,
    validRows: validRows.length,
    invalidRows: errors.length,
    independentParties: independentParties.size,
    replicatedWorlds: replicatedWorlds.size,
    agreementWithinCiRows: validRows.filter((row) => row.agreement_within_ci).length,
    errors,
  };
}

export function collectReplicationRowsFromMetadata(metadata) {
  const rows = metadata?.externalReplication?.rows ?? metadata?.thirdPartyReplication?.rows ?? [];
  return Array.isArray(rows) ? rows : [];
}

export function collectReplicationRowsFromEvidenceDocument(document) {
  if (Array.isArray(document)) return document;
  if (!document || typeof document !== 'object') return [];
  return Array.isArray(document.rows) ? document.rows : [];
}

export function validateReplicationEvidenceDocument(document, { strict = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return {
      ok: false,
      strict,
      summary: summarizeReplicationRows([]),
      errors: ['replication evidence document must be an object'],
      warnings,
    };
  }

  if (document.protocol_version !== REPLICATION_EVIDENCE_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${REPLICATION_EVIDENCE_PROTOCOL_VERSION}`);
  }
  if (!nonEmpty(document.release_id)) errors.push('release_id is required');
  if (!isIso(document.generated_at)) errors.push('generated_at must be an ISO timestamp');
  if (!Array.isArray(document.rows)) errors.push('rows must be an array');

  const summary = summarizeReplicationRows(document.rows ?? []);
  errors.push(...summary.errors.map((error) => `rows[${error.index}]: ${error.error}`));

  if (strict && summary.validRows === 0) {
    errors.push('strict mode requires at least one valid third-party replication row');
  }
  if (strict && summary.agreementWithinCiRows === 0) {
    errors.push('strict mode requires at least one replication row with agreement_within_ci:true');
  }
  if (!strict && summary.validRows === 0) {
    warnings.push('replication evidence document has no valid rows yet');
  }

  return {
    ok: errors.length === 0,
    strict,
    release_id: document.release_id ?? null,
    generated_at: document.generated_at ?? null,
    summary,
    errors,
    warnings,
  };
}

function isSha256(value) {
  return SHA_256_RE.test(String(value ?? ''));
}

function isIso(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
