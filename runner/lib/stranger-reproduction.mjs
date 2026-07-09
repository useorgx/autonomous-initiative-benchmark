export const STRANGER_REPRODUCTION_PROTOCOL_VERSION = 'stranger_reproduction_v1';

const SHA_256_RE = /^sha256:[a-f0-9]{64}$/;

export function validateStrangerReproductionReceipt(receipt, { strict = false } = {}) {
  const errors = [];
  const warnings = [];

  if (!isRecord(receipt)) {
    return invalid({ strict, errors: ['receipt must be an object.'], warnings });
  }

  if (receipt.protocol_version !== STRANGER_REPRODUCTION_PROTOCOL_VERSION) {
    errors.push(`protocol_version must be ${STRANGER_REPRODUCTION_PROTOCOL_VERSION}.`);
  }
  if (!nonEmpty(receipt.release_id)) errors.push('release_id is required.');
  if (!nonEmpty(receipt.reviewer_id)) errors.push('reviewer_id is required.');
  if (!nonEmpty(receipt.reviewer_affiliation)) errors.push('reviewer_affiliation is required.');
  if (!isIso(receipt.recorded_at)) errors.push('recorded_at must be an ISO timestamp.');
  if (!nonEmpty(receipt.command)) errors.push('command is required.');
  if (!Array.isArray(receipt.public_inputs) || receipt.public_inputs.length === 0) {
    errors.push('public_inputs must contain at least one public input file.');
  } else {
    receipt.public_inputs.forEach((input, index) => validatePublicInput({ input, index, errors }));
  }
  if (!isSha256(receipt.result_hash)) errors.push('result_hash must be sha256:<64 hex>.');
  if (!isSha256(receipt.bundle_hash)) errors.push('bundle_hash must be sha256:<64 hex>.');
  if (!isSha256(receipt.release_manifest_hash)) errors.push('release_manifest_hash must be sha256:<64 hex>.');
  if (!isSha256(receipt.reproduction_log_hash)) errors.push('reproduction_log_hash must be sha256:<64 hex>.');
  if (typeof receipt.completed !== 'boolean') errors.push('completed must be a boolean.');
  if (typeof receipt.matched_to_digit !== 'boolean') errors.push('matched_to_digit must be a boolean.');
  if (!Array.isArray(receipt.deviations)) errors.push('deviations must be an array.');
  if (!Array.isArray(receipt.reproduction_environment)) errors.push('reproduction_environment must be an array.');

  if (receipt.completed !== true) {
    const message = 'receipt is not completed.';
    if (strict) errors.push(message);
    else warnings.push(message);
  }
  if (receipt.matched_to_digit !== true) {
    const message = 'receipt does not match headline numbers to the digit.';
    if (strict) errors.push(message);
    else warnings.push(message);
  }

  return {
    ok: errors.length === 0,
    strict,
    status: errors.length === 0 ? 'stranger_reproduction_valid' : 'stranger_reproduction_invalid',
    summary: summarizeStrangerReproductionReceipt(receipt),
    errors,
    warnings,
  };
}

export function summarizeStrangerReproductionReceipt(receipt) {
  return {
    protocol_version: receipt?.protocol_version ?? null,
    release_id: receipt?.release_id ?? null,
    reviewer_id: receipt?.reviewer_id ?? null,
    reviewer_affiliation: receipt?.reviewer_affiliation ?? null,
    completed: receipt?.completed === true,
    matched_to_digit: receipt?.matched_to_digit === true,
    public_input_count: Array.isArray(receipt?.public_inputs) ? receipt.public_inputs.length : 0,
    deviation_count: Array.isArray(receipt?.deviations) ? receipt.deviations.length : 0,
    recorded_at: receipt?.recorded_at ?? null,
    result_hash: receipt?.result_hash ?? null,
  };
}

function validatePublicInput({ input, index, errors }) {
  const prefix = `public_inputs[${index}]`;
  if (!isRecord(input)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  if (!nonEmpty(input.path)) errors.push(`${prefix}.path is required.`);
  if (!isSha256(input.sha256)) errors.push(`${prefix}.sha256 must be sha256:<64 hex>.`);
  if (!nonEmpty(input.role)) errors.push(`${prefix}.role is required.`);
}

function invalid({ strict, errors, warnings }) {
  return {
    ok: false,
    strict,
    status: 'stranger_reproduction_invalid',
    summary: null,
    errors,
    warnings,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIso(value) {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

function isSha256(value) {
  return typeof value === 'string' && SHA_256_RE.test(value);
}
