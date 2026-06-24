// The Acceptance Schema — ONE versioned object the product and the benchmark
// both run. Each check carries provenance (where the rule came from) and the
// schema carries a changelog, so its evolution is auditable. This is the spine
// of the product<->benchmark loop: every change is a versioned, sourced delta.

function bump(version, kind) {
  const [maj, min, pat] = String(version).split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

// checks: [{ id, dimension, severity, run, threshold?, provenance? }]
export function createSchema(domain, checks, { version = '1.0.0', shipThreshold = 0.95 } = {}) {
  return {
    domain,
    version,
    shipThreshold,
    checks: checks.map((c) => ({ provenance: { origin: 'workflow-v1', addedIn: version, reason: 'initial contract' }, ...c })),
    changelog: [{ version, change: 'initial schema', source: 'workflow-v1' }],
  };
}

// Evolve the schema with a sourced delta. Returns a NEW schema (pure).
//   add_check   -> minor bump (a new production gate)
//   retune      -> patch bump (tighten/loosen a threshold)
//   demote      -> patch bump (lower a check's severity; e.g. blocker->advisory)
//   remove      -> major bump (a check was wrong / superseded)
export function evolveSchema(schema, delta, { source, reason }) {
  const checks = schema.checks.map((c) => ({ ...c }));
  let kind = 'patch';
  let change = '';
  const ver = (k) => bump(schema.version, k);

  if (delta.type === 'add_check') {
    kind = 'minor';
    const v = ver(kind);
    checks.push({ ...delta.check, provenance: { origin: source, addedIn: v, reason } });
    change = `+ check ${delta.check.id} [${delta.check.severity}, ${delta.check.dimension}]`;
  } else if (delta.type === 'retune') {
    kind = 'patch';
    const c = checks.find((x) => x.id === delta.id);
    if (c) { c.threshold = delta.threshold; c.run = delta.run ?? c.run; c.provenance = { ...c.provenance, retunedIn: ver(kind), reason }; }
    change = `~ retune ${delta.id} threshold -> ${JSON.stringify(delta.threshold)}`;
  } else if (delta.type === 'demote') {
    kind = 'patch';
    const c = checks.find((x) => x.id === delta.id);
    if (c) { c.severity = delta.toSeverity; c.provenance = { ...c.provenance, demotedIn: ver(kind), reason }; }
    change = `v demote ${delta.id} -> ${delta.toSeverity}`;
  } else if (delta.type === 'remove') {
    kind = 'major';
    const i = checks.findIndex((x) => x.id === delta.id);
    if (i >= 0) checks.splice(i, 1);
    change = `- remove ${delta.id}`;
  }

  const version = ver(kind);
  return {
    ...schema,
    version,
    checks,
    changelog: [...schema.changelog, { version, change, source, reason }],
  };
}

// Convenience: the runnable check list (drop the metadata the gate doesn't need).
export function gateChecks(schema) {
  return schema.checks.map(({ id, dimension, severity, run }) => ({ id, dimension, severity, run }));
}
