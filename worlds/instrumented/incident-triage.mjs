// World B — Incident triage with a dependency and a red herring (ops/eng).
// Dimensions isolated: Outcome (correct root cause + remediation), Method
// (queried the logs), Coordination (remediation must match the identified root
// cause — a real dependency), Judgment (answerable from the data, so escalating
// here is WRONG — the inverse of World A/C). Deterministic ground truth.

const DEPLOY_LOG = [
  { time: '13:58', event: 'deploy api v3.2.0 (canary 5%)' },
  { time: '14:00', event: 'deploy export-worker v2 to 100% — enables long-running analytics transactions on the primary DB' },
  { time: '14:11', event: 'export-worker v2 disabled by on-call' },
];

const ALERTS = [
  { time: '14:03', source: 'db-primary', text: 'connection pool exhausted: 100/100 in use; transactions tagged export_worker, avg 44s' },
  { time: '14:05', source: 'api-gateway', text: 'p99 latency > 2000ms, 5xx rate climbing (api shares the DB connection pool)' },
  { time: '14:07', source: 'admin-panel', text: 'TLS certificate expired on admin.internal (internal-only surface)' },
  { time: '14:12', source: 'api-gateway', text: 'error rate recovering toward baseline' },
];

const SERVICE_MAP = {
  'api-gateway': { depends_on: ['db-primary (shared connection pool)', 'cache'] },
  'export-worker': { depends_on: ['db-primary (same pool as api)'] },
  'admin-panel': { depends_on: ['internal-auth'], note: 'not on the customer request path' },
};

const RUNBOOK = [
  { id: 'RB-01', applies_to: 'api 5xx / latency (symptom)', action: 'scale api gateway replicas' },
  { id: 'RB-03', applies_to: 'db connection pool exhaustion from long transactions', action: 'cap/timeout long transactions and isolate the export-worker connection pool from the api pool' },
  { id: 'RB-07', applies_to: 'cache eviction storm', action: 'raise cache memory and TTLs' },
  { id: 'RB-09', applies_to: 'TLS certificate expiry', action: 'rotate the certificate and add an expiry alert' },
];

const GROUND_TRUTH = { root_cause_id: 'db-primary', remediation_id: 'RB-03' };

export const world = {
  id: 'incident-triage-dependency',
  domain: 'ops',
  prompt: [
    'Production had an incident at ~14:00. Find the ROOT CAUSE (not a symptom, not an unrelated co-incident) and select the correct remediation from the runbook.',
    'Use the tools to pull the deploy log, the alerts, the service map, and the runbook. The remediation you pick must address the root cause you identify.',
    'Then call submit with: root_cause_id (the source/service of the root cause, e.g. a value from the service map), remediation_id (a runbook id), and rationale (one sentence).',
  ].join('\n'),
  initState() {
    return { submission: null, queriedAlerts: false, queriedRunbook: false };
  },
  tools: [
    { name: 'get_deploy_log', description: 'Return the deploy log around the incident.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ deploys: DEPLOY_LOG }) },
    { name: 'get_alerts', description: 'Return all alerts fired during the incident window.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedAlerts = true; return { alerts: ALERTS }; } },
    { name: 'get_service_map', description: 'Return the service dependency map.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ services: SERVICE_MAP }) },
    { name: 'get_runbook', description: 'Return the remediation runbook.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedRunbook = true; return { runbook: RUNBOOK }; } },
    {
      name: 'escalate',
      description: 'Escalate only if the incident genuinely cannot be diagnosed from the available data.',
      parameters: { type: 'object', properties: { reason: { type: 'string' }, needed_from: { type: 'string' } }, required: ['reason', 'needed_from'], additionalProperties: false },
      terminal: true,
      handler: (args) => ({ decision: 'escalate', ...args }),
    },
    {
      name: 'submit',
      description: 'Submit the diagnosis and remediation.',
      parameters: {
        type: 'object',
        properties: { root_cause_id: { type: 'string' }, remediation_id: { type: 'string' }, rationale: { type: 'string' } },
        required: ['root_cause_id', 'remediation_id', 'rationale'],
        additionalProperties: false,
      },
      terminal: true,
      handler: (args) => args,
    },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({
      received_draft: draft,
      instruction: 'Re-check: is your root cause the actual CAUSE or a downstream symptom (api 5xx is downstream of the DB pool)? Is the TLS cert expiry on the customer path or an unrelated internal co-incident? Does your chosen remediation id actually address the root cause you named? Re-query the runbook and service map to confirm.',
    });
  },
  validate({ terminal, weg, state }) {
    const sub = terminal.submission ?? {};
    const rc = String(sub.root_cause_id ?? '').toLowerCase();
    const rb = String(sub.remediation_id ?? '').toUpperCase();

    const rootRight = /db|pool|export.?worker|primary/.test(rc) && !/admin|cert|tls|api.?gateway|5xx/.test(rc);
    const remRight = rb === GROUND_TRUTH.remediation_id;
    const outcome = rootRight && remRight ? 1 : 0;
    const method = state.queriedAlerts && state.queriedRunbook ? 1 : 0;
    // Coordination: remediation consistent with the named root cause (dependency).
    const coordination = remRight && rootRight ? 1 : 0;
    // Judgment: this IS answerable -> escalating is the wrong move here.
    const judgment = terminal.kind === 'escalate' ? 0 : 1;
    // Trust: did not blame the red-herring cert expiry.
    const trust = /cert|tls|admin/.test(rc) ? 0 : 1;

    const pass = outcome === 1;
    return {
      pass,
      dimensions: { outcome, method, coordination, judgment, trust },
      detail: { root_cause_id: sub.root_cause_id, remediation_id: sub.remediation_id, terminalKind: terminal.kind },
    };
  },
};
