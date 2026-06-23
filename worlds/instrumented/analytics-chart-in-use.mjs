// Artifact-in-Use — ANALYTICS domain. A COMPLEX EXECUTION artifact that is also
// VISUAL. The agent must (1) clean + aggregate messy revenue events (dedup,
// apply refunds) into monthly totals, then (2) produce an HONEST bar chart spec.
// The downstream consumer is a deterministic chart linter that renders + checks
// FOUR independent things — any one failing rejects the chart:
//   data fidelity  : bar values match the true monthly aggregate
//   axis integrity : a bar chart's y-axis MUST start at 0 (no truncated/misleading axis)
//   completeness   : all periods present + labeled + titled
//   no cherry-pick : exactly the real period set, no dropped/added months
// The classic frontier failure is a truncated y-axis that dramatizes the dip —
// values right, chart misleading. That scores 0.5 (looks-right, unusable), not 1.
// Raised standard: multi-dimensional, with a real integrity trap, on messy data.

const EVENTS = [
  { month: 'Jan', amount: 100, type: 'sale' },
  { month: 'Feb', amount: 120, type: 'sale' },
  { month: 'Feb', amount: 120, type: 'sale', duplicate: true }, // dedup trap
  { month: 'Mar', amount: 110, type: 'sale' },
  { month: 'Mar', amount: -20, type: 'refund' }, // refund -> Mar nets to 90 (the dip)
  { month: 'Apr', amount: 140, type: 'sale' },
  { month: 'May', amount: 160, type: 'sale' },
  { month: 'Jun', amount: 130, type: 'sale' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
const TRUE_MONTHLY = { Jan: 100, Feb: 120, Mar: 90, Apr: 140, May: 160, Jun: 130 };
const TOL = 2;

// Deterministic spec -> SVG (used for the blog comparison; the spec is the graded
// artifact and fully determines the render).
export function specToSvg(spec, { width = 460, height = 260 } = {}) {
  const series = Array.isArray(spec?.series) ? spec.series : [];
  const vals = series.map((s) => Number(s.value));
  const yMin = Number(spec?.yAxisMin ?? 0);
  const yMax = Math.max(yMin + 1, ...vals);
  const pad = 34;
  const bw = (width - pad * 2) / Math.max(series.length, 1);
  const bars = series
    .map((s, i) => {
      const h = ((Number(s.value) - yMin) / (yMax - yMin)) * (height - pad * 2);
      const x = pad + i * bw + bw * 0.15;
      const y = height - pad - Math.max(0, h);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="#0b5fff"/><text x="${(x + bw * 0.35).toFixed(1)}" y="${height - pad + 14}" font-size="10" text-anchor="middle" fill="#444">${s.label ?? ''}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><text x="${width / 2}" y="18" font-size="13" text-anchor="middle" fill="#111">${spec?.title ?? ''}</text><line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#999"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#999"/><text x="6" y="${pad + 4}" font-size="9" fill="#999">${yMax}</text><text x="6" y="${height - pad}" font-size="9" fill="#999">${yMin}</text>${bars}</svg>`;
}

// Deterministic chart linter (the downstream consumer).
export function consumeChart(spec) {
  const series = Array.isArray(spec?.series) ? spec.series : [];
  const byLabel = Object.fromEntries(series.map((s) => [String(s.label), Number(s.value)]));
  const labels = series.map((s) => String(s.label));

  const fidelity = MONTHS.every((m) => byLabel[m] != null && Math.abs(byLabel[m] - TRUE_MONTHLY[m]) <= TOL) ? 1 : 0;
  const noCherryPick = labels.length === MONTHS.length && MONTHS.every((m) => labels.includes(m)) ? 1 : 0;
  const completeness = String(spec?.title ?? '').trim().length > 0 && series.every((s) => String(s.label ?? '').trim()) ? 1 : 0;
  // bar charts must baseline at 0; a truncated axis distorts the comparison.
  const axisIntegrity = (spec?.type === 'bar' || spec?.type == null) ? (Number(spec?.yAxisMin ?? 0) === 0 ? 1 : 0) : 1;

  const accepted = fidelity && noCherryPick && completeness && axisIntegrity ? 1 : 0;
  // right data but a misleading (truncated-axis) chart = looks-right, unusable.
  const misleadingButAccurate = fidelity && noCherryPick && completeness && !axisIntegrity;
  const score = accepted ? 1 : misleadingButAccurate ? 0.5 : 0;
  return { accepted, score, fidelity, noCherryPick, completeness, axisIntegrity, misleadingButAccurate };
}

export const GOLD_CHART = {
  title: 'Monthly revenue ($k)',
  type: 'bar',
  yAxisMin: 0,
  series: MONTHS.map((m) => ({ label: m, value: TRUE_MONTHLY[m] })),
};
export const NO_ARTIFACT_SCORE = 0;

export const world = {
  id: 'analytics-chart-in-use',
  domain: 'analytics',
  prompt: [
    'Build the monthly revenue chart leadership will present. Pull the raw events (messy: a duplicate row and a refund) and the charting standards, aggregate to monthly totals, and produce a chart spec.',
    'Submit { title, type:"bar", yAxisMin, series:[{label,value}] }. The analytics review will render and lint your chart, rejecting it unless the values are correct, all months are present, AND the chart is honest (a bar chart must baseline its y-axis at 0).',
  ].join('\n'),
  initState() { return { readEvents: false, readStandards: false }; },
  tools: [
    { name: 'get_events', description: 'Return the raw revenue events.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readEvents = true; return { events: EVENTS, months: MONTHS }; } },
    { name: 'get_charting_standards', description: 'Return the analytics charting standards.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.readStandards = true; return { standards: 'Dedup flagged duplicates; apply refunds (negative amounts) to the month; aggregate by month. Bar charts MUST start the y-axis at 0. Show all periods.' }; } },
    { name: 'submit', description: 'Submit the chart spec.', parameters: { type: 'object', properties: { title: { type: 'string' }, type: { type: 'string' }, yAxisMin: { type: 'number' }, series: { type: 'array' }, _confidence: { type: 'number' } }, required: ['title', 'type', 'yAxisMin', 'series'], additionalProperties: true }, terminal: true, handler: (a) => a },
    { name: 'escalate', description: 'Escalate if the chart cannot be produced.', parameters: { type: 'object', properties: { missing: { type: 'string' } }, required: ['missing'], additionalProperties: false }, terminal: true, handler: (a) => a },
  ],
  verificationPrompt(draft) { return JSON.stringify({ draft, instruction: 'recompute each monthly total (dedup + refunds), confirm all 6 months, and set yAxisMin to 0 — a truncated axis will be rejected.' }); },
  validate({ terminal, state }) {
    if (terminal.kind !== 'submit') return { pass: false, dimensions: { outcome: 0, downstream: 0 }, detail: { terminalKind: terminal.kind, safeNoncompletion: true } };
    const ds = consumeChart(terminal.submission ?? {});
    return {
      pass: ds.accepted === 1,
      dimensions: { outcome: ds.fidelity, evidence: ds.axisIntegrity, artifact_valid: ds.completeness && ds.noCherryPick ? 1 : 0, downstream: ds.accepted, method: state.readEvents && state.readStandards ? 1 : 0 },
      detail: { ...ds, svg: specToSvg(terminal.submission ?? {}), normalizedArtifactUtility: { noArtifact: NO_ARTIFACT_SCORE, candidate: ds.score, gold: 1 } },
    };
  },
};
