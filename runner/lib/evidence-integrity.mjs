import { createHash, verify, createPublicKey } from 'node:crypto';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError('Non-JSON evidence value');
  return JSON.stringify(value);
}
export const digest = value => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
export const isNumber = value => typeof value === 'number' && Number.isFinite(value);
export const cellKey = row => JSON.stringify([row.world_id, row.model_id, row.arm]);

export function exactCoverage(expected, observed, label = 'coverage') {
  const errors = [];
  if (!Array.isArray(expected) || expected.length === 0) return [`${label} requires a nonempty preregistered expected set`];
  if (new Set(expected).size !== expected.length) errors.push(`${label} expected set has duplicates`);
  if (new Set(observed).size !== observed.length) errors.push(`${label} observed set has duplicates`);
  for (const id of expected) if (!observed.includes(id)) errors.push(`${label} missing ${id}`);
  for (const id of observed) if (!expected.includes(id)) errors.push(`${label} unexpected ${id}`);
  return errors;
}

// Evidence may tighten a published policy, never relax it or coerce strings/null.
export function tightenedPolicy(defaults, overrides = {}) {
  const errors = [];
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return { policy: defaults, errors: ['thresholds must be an object'] };
  const policy = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in defaults)) { errors.push(`unknown threshold ${key}`); continue; }
    if (!isNumber(value) || value < 0) { errors.push(`threshold ${key} must be a finite non-negative number`); continue; }
    if ((key.includes('Reviewers') || key.includes('Defects')) && !Number.isInteger(value)) errors.push(`threshold ${key} must be an integer`);
    const minimum = key.startsWith('minimum');
    if (minimum ? value < defaults[key] : value > defaults[key]) errors.push(`threshold ${key} cannot weaken the published policy`);
    else policy[key] = value;
  }
  return { policy, errors };
}

export function wilson95(successes, attempts) {
  if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(successes) || successes < 0 || successes > attempts) throw new TypeError('Invalid binomial counts');
  const z = 1.959963984540054, p = successes / attempts, d = 1 + z*z/attempts;
  const c = (p + z*z/(2*attempts))/d;
  const h = z*Math.sqrt(p*(1-p)/attempts + z*z/(4*attempts*attempts))/d;
  return { ci_low: Math.max(0,c-h), ci_high: Math.min(1,c+h) };
}

// Independent clusters, NOT individual repeated trials, determine precision.
// For repeated clusters use a conservative distribution-free Hoeffding bound
// on the equally weighted cluster means. No degenerate bootstrap intervals.
export function recomputeCell(rows) {
  if (!rows.length) throw new Error('No measured observations');
  const clusters = new Map();
  for (const row of rows) {
    if (typeof row.accepted !== 'boolean' || typeof row.cluster_id !== 'string' || !row.cluster_id.trim()) throw new Error('Raw outcomes require Boolean acceptance and cluster_id');
    if (!['scored','lost','blocked'].includes(row.status) || (row.status !== 'scored' && row.accepted)) throw new Error('Invalid outcome status');
    const a = clusters.get(row.cluster_id) ?? []; a.push(Number(row.accepted)); clusters.set(row.cluster_id,a);
  }
  const values = [...clusters.values()].map(a=>a.reduce((s,x)=>s+x,0)/a.length);
  const p = values.reduce((s,x)=>s+x,0)/values.length;
  const attempts = rows.length, successes = rows.filter(x=>x.accepted).length;
  if (clusters.size === rows.length) return { attempts, successes, independent_clusters: clusters.size, estimate: p, method: 'wilson_independent_95', ...wilson95(successes,attempts) };
  const h = Math.sqrt(Math.log(40)/(2*clusters.size));
  return { attempts, successes, independent_clusters: clusters.size, estimate:p, method:'cluster_hoeffding_95', ci_low:Math.max(0,p-h), ci_high:Math.min(1,p+h) };
}

export function recomputePrecision({ledger, expectedCells, releaseId}) {
  const errors = [];
  if (!ledger || ledger.release_id !== releaseId || !Array.isArray(ledger.episodes)) return {errors:['Bound outcome ledger missing or release identity mismatch'],cells:[]};
  if (!Array.isArray(expectedCells) || !expectedCells.length) return {errors:['precision requires preregistered expectedCells'],cells:[]};
  const wanted = expectedCells.flatMap(c=>c.episode_ids ?? []);
  const seen = ledger.episodes.map(r=>r.episode_id);
  errors.push(...exactCoverage(wanted,seen,'episode ledger'));
  const keys = expectedCells.map(cellKey);
  errors.push(...exactCoverage(keys,[...new Set(ledger.episodes.map(cellKey))],'cell ledger'));
  const cells = [];
  for (const cell of expectedCells) {
    const rows = ledger.episodes.filter(r=>cellKey(r)===cellKey(cell));
    errors.push(...exactCoverage(cell.episode_ids,rows.map(r=>r.episode_id),`cell ${cellKey(cell)}`));
    try { cells.push({world_id:cell.world_id,model_id:cell.model_id,arm:cell.arm,...recomputeCell(rows)}); }
    catch(e) { errors.push(e.message); }
  }
  return {errors,cells};
}

// Trust-store authority is an external input, never a key supplied by the signer.
// Signatures bind bytes/identity, not semantic truth or reviewer independence.
export function verifyAttestation(envelope, {trustedKeys, expectedBinding, requiredRole}) {
  try {
    const key = trustedKeys?.[envelope?.issuer];
    if (!key || !key.roles?.includes(requiredRole)) throw new Error('Untrusted issuer/role');
    if (key.algorithm !== 'ed25519') throw new Error('Unsupported signing algorithm');
    for (const [k,v] of Object.entries(expectedBinding)) if (envelope.payload?.[k] !== v) throw new Error(`Attestation binding mismatch: ${k}`);
    const publicKey = createPublicKey(key.publicKey);
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Wrong key type');
    if (!verify(null,Buffer.from(canonicalJson(envelope.payload)),publicKey,Buffer.from(envelope.signature,'base64'))) throw new Error('Invalid signature');
    return {ok:true,payload:envelope.payload,issuer:envelope.issuer};
  } catch(e) { return {ok:false,error:e.message}; }
}
