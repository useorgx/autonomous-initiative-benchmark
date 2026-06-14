// World E — Long-horizon stateful order pipeline (operations).
// The point: SHARED INVENTORY depletes as orders are processed in sequence, so
// order N's fulfillability depends on orders 1..N-1. This is a genuine
// sequential dependency chain (12 steps) that punishes state drift — the
// compounding-error failure mode that single-context execution hits and that
// decomposition/verification is supposed to recover. Outcome is checked by an
// embedded reference simulation (single source of truth). Ground truth:
// 9 fulfilled, $9,945, backordered [O7, O9, O10].

const TIERS = {
  acme: { tier: 'gold', discount: 0.20, min_qty_for_discount: 5 },
  beta: { tier: 'silver', discount: 0.10, min_qty_for_discount: 3 },
  gamma: { tier: 'standard', discount: 0, min_qty_for_discount: 0 },
  delta: { tier: 'gold', discount: 0.20, min_qty_for_discount: 5 },
  epsilon: { tier: 'silver', discount: 0.10, min_qty_for_discount: 3 },
};
const TAX = { US: 0.08, EU: 0.20, APAC: 0.10 };
const PRICE = { 'SKU-A': 100, 'SKU-B': 250, 'SKU-C': 60, 'SKU-D': 400 };
const INVENTORY0 = { 'SKU-A': 30, 'SKU-B': 12, 'SKU-C': 50, 'SKU-D': 6 };
const ORDERS = [
  { id: 'O1', customer: 'acme', sku: 'SKU-A', qty: 8, region: 'US' },
  { id: 'O2', customer: 'beta', sku: 'SKU-B', qty: 5, region: 'EU' },
  { id: 'O3', customer: 'gamma', sku: 'SKU-A', qty: 10, region: 'APAC' },
  { id: 'O4', customer: 'delta', sku: 'SKU-D', qty: 4, region: 'US' },
  { id: 'O5', customer: 'epsilon', sku: 'SKU-C', qty: 20, region: 'EU' },
  { id: 'O6', customer: 'acme', sku: 'SKU-B', qty: 6, region: 'US' },
  { id: 'O7', customer: 'beta', sku: 'SKU-D', qty: 3, region: 'APAC' },
  { id: 'O8', customer: 'gamma', sku: 'SKU-C', qty: 15, region: 'US' },
  { id: 'O9', customer: 'delta', sku: 'SKU-A', qty: 15, region: 'EU' },
  { id: 'O10', customer: 'epsilon', sku: 'SKU-B', qty: 4, region: 'APAC' },
  { id: 'O11', customer: 'acme', sku: 'SKU-D', qty: 2, region: 'US' },
  { id: 'O12', customer: 'beta', sku: 'SKU-A', qty: 6, region: 'EU' },
];

const RULES = `FULFILLMENT RULES (apply in order, O1 first)
- Process orders strictly in sequence. Inventory is SHARED and depletes: if an order is fulfilled, subtract its quantity from that SKU's remaining stock before the next order.
- An order is fulfillable only if the SKU's REMAINING stock at that point is >= the order quantity. Otherwise it is BACKORDERED (no partial fulfillment) and consumes no stock.
- Revenue for a fulfilled order = unit_price x qty, minus the customer's tier discount (the discount applies ONLY if qty >= the tier's min_qty_for_discount), then plus the order's regional tax. Tax is applied AFTER the discount.
- Backordered orders contribute $0 revenue.`;

function reference() {
  const inv = { ...INVENTORY0 };
  let revenue = 0;
  let fulfilled = 0;
  const back = [];
  for (const o of ORDERS) {
    if (inv[o.sku] >= o.qty) {
      inv[o.sku] -= o.qty;
      const t = TIERS[o.customer];
      const disc = o.qty >= t.min_qty_for_discount ? t.discount : 0;
      const net = PRICE[o.sku] * o.qty * (1 - disc);
      revenue += net * (1 + TAX[o.region]);
      fulfilled += 1;
    } else {
      back.push(o.id);
    }
  }
  return { fulfilled, revenue: Math.round(revenue), backordered: back };
}

const GROUND_TRUTH = reference();
const REVENUE_WINDOW = 50;

export const world = {
  id: 'order-pipeline-horizon',
  domain: 'ops',
  prompt: [
    'Process the order batch through the fulfillment pipeline and report the result. Inventory is shared and depletes as you fulfill orders in sequence, so whether a later order can be fulfilled depends on what earlier orders consumed.',
    'Use the tools to pull the orders, the customer tiers, the tax table, the SKU prices, and the starting inventory. Read the fulfillment rules and apply them exactly, processing O1 first.',
    'Then call submit with: fulfillable_count (integer), total_revenue (integer dollars), and backordered_ids (array of order ids that could not be fulfilled).',
  ].join('\n'),
  initState() { return { submission: null, queriedOrders: false, queriedInventory: false }; },
  tools: [
    { name: 'get_orders', description: 'Return the order batch in processing sequence.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedOrders = true; return { orders: ORDERS }; } },
    { name: 'get_customer_tiers', description: 'Return customer tier + discount table.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ tiers: TIERS }) },
    { name: 'get_tax_table', description: 'Return region tax rates.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ tax: TAX }) },
    { name: 'get_prices', description: 'Return SKU unit prices.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ prices: PRICE }) },
    { name: 'get_inventory', description: 'Return STARTING inventory per SKU.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: (_a, s) => { s.queriedInventory = true; return { inventory: INVENTORY0 }; } },
    { name: 'get_rules', description: 'Return the fulfillment rules.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ rules: RULES }) },
    { name: 'compute', description: 'Evaluate an arithmetic expression. Returns the number.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false }, handler: (args) => { const e = String(args.expression || ''); if (!/^[\d+\-*/(). ]+$/.test(e)) return { error: 'arithmetic only' }; try { return { result: Function(`"use strict";return (${e});`)() }; } catch { return { error: 'bad expr' }; } } },
    {
      name: 'submit', description: 'Submit the pipeline result.',
      parameters: { type: 'object', properties: { fulfillable_count: { type: 'integer' }, total_revenue: { type: 'integer' }, backordered_ids: { type: 'array', items: { type: 'string' } } }, required: ['fulfillable_count', 'total_revenue', 'backordered_ids'], additionalProperties: false },
      terminal: true, handler: (args) => args,
    },
  ],
  verificationPrompt(draft) {
    return JSON.stringify({
      received_draft: draft,
      instruction: 'Re-run the pipeline from scratch, processing O1..O12 in order and tracking REMAINING inventory per SKU after each fulfilled order. For each order check remaining stock >= qty before fulfilling; if not, it is backordered and consumes nothing. Recompute revenue per fulfilled order (discount only if qty >= the tier minimum, then add regional tax). Confirm your fulfillable_count, total_revenue, and the exact backordered_ids match the re-run.',
    });
  },
  // Restart-at-boundary support: the orchestrator can process the batch in
  // segments, each in a FRESH context that receives only the carried verified
  // state (remaining inventory + running totals). This is the reliability
  // research's #1 intervention — it kills state drift by never letting the
  // working context grow. The segment tools are scoped to the segment's slice;
  // ground truth and the full batch are never exposed.
  restart: {
    segmentSize: 4,
    totalItems: ORDERS.length,
    initCarry() { return { remaining_inventory: { ...INVENTORY0 }, running_count: 0, running_revenue: 0, backordered: [] }; },
    segmentTools(carry, lo, hi) {
      const slice = ORDERS.slice(lo, hi);
      return [
        { name: 'get_segment_orders', description: `Return THIS segment's orders (${slice.length} of the batch, already in sequence).`, parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ orders: slice }) },
        { name: 'get_carried_state', description: 'Return the remaining inventory and running totals carried from earlier segments. Start from these.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ remaining_inventory: carry.remaining_inventory, running_count: carry.running_count, running_revenue: carry.running_revenue, backordered_so_far: carry.backordered }) },
        { name: 'get_customer_tiers', description: 'Return customer tier + discount table.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ tiers: TIERS }) },
        { name: 'get_tax_table', description: 'Return region tax rates.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ tax: TAX }) },
        { name: 'get_prices', description: 'Return SKU unit prices.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ prices: PRICE }) },
        { name: 'get_rules', description: 'Return the fulfillment rules.', parameters: { type: 'object', properties: {}, additionalProperties: false }, handler: () => ({ rules: RULES }) },
        { name: 'compute', description: 'Evaluate an arithmetic expression.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false }, handler: (args) => { const e = String(args.expression || ''); if (!/^[\d+\-*/(). ]+$/.test(e)) return { error: 'arithmetic only' }; try { return { result: Function(`"use strict";return (${e});`)() }; } catch { return { error: 'bad expr' }; } } },
        {
          name: 'submit_segment', description: 'Submit this segment\'s updated carried state for the next segment.',
          parameters: { type: 'object', properties: { remaining_inventory: { type: 'object', additionalProperties: { type: 'integer' } }, running_count: { type: 'integer' }, running_revenue: { type: 'integer' }, backordered: { type: 'array', items: { type: 'string' } } }, required: ['remaining_inventory', 'running_count', 'running_revenue', 'backordered'], additionalProperties: false },
          terminal: true, handler: (args) => args,
        },
      ];
    },
    segmentPrompt(lo, hi, n) {
      return [
        `You are processing segment orders ${lo + 1}..${hi} of a ${ORDERS.length}-order fulfillment batch (segment ${Math.floor(lo / 4) + 1} of ${n}).`,
        'First call get_carried_state to load the remaining inventory and running totals from earlier segments — you MUST start from those numbers, not from full stock.',
        'Then get this segment\'s orders, the tiers/tax/prices/rules, and process ONLY this segment\'s orders in sequence against the carried remaining inventory (deplete as you fulfill; backorder if remaining stock < qty).',
        'Then call submit_segment with the UPDATED remaining_inventory, the new running_count, running_revenue (integer, cumulative), and the full backordered list so far.',
      ].join('\n');
    },
    foldCarry(_carry, segmentSubmission) {
      return {
        remaining_inventory: segmentSubmission.remaining_inventory ?? {},
        running_count: Number(segmentSubmission.running_count ?? 0),
        running_revenue: Number(segmentSubmission.running_revenue ?? 0),
        backordered: Array.isArray(segmentSubmission.backordered) ? segmentSubmission.backordered.map(String) : [],
      };
    },
    finalSubmission(carry) {
      return { fulfillable_count: carry.running_count, total_revenue: carry.running_revenue, backordered_ids: carry.backordered };
    },
  },
  validate({ terminal, state }) {
    const sub = terminal.submission ?? {};
    const countRight = Number(sub.fulfillable_count) === GROUND_TRUTH.fulfilled ? 1 : 0;
    const revRight = sub.total_revenue != null && Math.abs(Number(sub.total_revenue) - GROUND_TRUTH.revenue) <= REVENUE_WINDOW ? 1 : 0;
    const subBack = Array.isArray(sub.backordered_ids) ? [...sub.backordered_ids].map(String).sort() : [];
    const backRight = JSON.stringify(subBack) === JSON.stringify([...GROUND_TRUTH.backordered].sort()) ? 1 : 0;
    const outcome = countRight && revRight && backRight ? 1 : 0;
    const method = state.queriedOrders && state.queriedInventory ? 1 : 0;
    const coordination = backRight; // correct backorder set = the sequential depletion dependency was tracked
    const judgment = 1;
    const trust = outcome; // confidently submitting a wrong batch is the trust failure
    return { pass: outcome === 1, dimensions: { outcome, method, coordination, judgment, trust }, detail: { expected: GROUND_TRUTH, got: { count: sub.fulfillable_count, revenue: sub.total_revenue, back: subBack }, countRight, revRight, backRight } };
  },
};
