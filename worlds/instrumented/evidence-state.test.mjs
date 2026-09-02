import test from 'node:test';
import assert from 'node:assert/strict';

import { world as orderWorld } from './order-pipeline-horizon.mjs';
import { world as ledgerWorld } from './ledger-running-total.mjs';

function calls(...names) {
  return names.map((name, index) => ({
    segment: 0,
    step: index,
    name,
    status: 'succeeded',
  }));
}

function successfulCallsForEverySegment(names, segmentCount) {
  return Array.from({ length: segmentCount }, (_unused, segment) =>
    names.map((name, step) => ({
      segment,
      step,
      name,
      status: 'succeeded',
    }))
  ).flat();
}

test('order restart validation state reflects observed reads across every completed segment', () => {
  const absent = orderWorld.restart.deriveValidationState({
    baseState: orderWorld.initState(),
    weg: { toolCalls: calls('submit_segment') },
    expectedSegments: 3,
    completedSegments: 3,
  });
  assert.equal(absent.queriedOrders, false);
  assert.equal(absent.queriedInventory, false);

  const present = orderWorld.restart.deriveValidationState({
    baseState: orderWorld.initState(),
    weg: {
      toolCalls: successfulCallsForEverySegment(
        ['get_segment_orders', 'get_carried_state', 'submit_segment'],
        3
      ),
    },
    expectedSegments: 3,
    completedSegments: 3,
  });
  assert.equal(present.queriedOrders, true);
  assert.equal(present.queriedInventory, true);
});

test('failed or missing restart reads never count as method evidence', () => {
  const state = orderWorld.restart.deriveValidationState({
    baseState: orderWorld.initState(),
    weg: {
      toolCalls: [
        { segment: 0, name: 'get_segment_orders', status: 'failed' },
        ...successfulCallsForEverySegment(['get_carried_state'], 3),
      ],
    },
    expectedSegments: 3,
    completedSegments: 3,
  });
  assert.equal(state.queriedOrders, false);
  assert.equal(state.queriedInventory, true);
});

test('ledger restart requires observed successful segment reads and complete segmentation', () => {
  const missingRead = ledgerWorld.restart.deriveValidationState({
    baseState: ledgerWorld.initState(),
    weg: { toolCalls: calls('submit_segment') },
    expectedSegments: 4,
    completedSegments: 4,
  });
  assert.equal(missingRead.queriedLedger, false);

  const complete = ledgerWorld.restart.deriveValidationState({
    baseState: ledgerWorld.initState(),
    weg: {
      toolCalls: successfulCallsForEverySegment(
        ['get_segment', 'submit_segment'],
        4
      ),
    },
    expectedSegments: 4,
    completedSegments: 4,
  });
  assert.equal(complete.queriedLedger, true);

  const incomplete = ledgerWorld.restart.deriveValidationState({
    baseState: ledgerWorld.initState(),
    weg: {
      toolCalls: [
        { segment: 0, name: 'get_segment', status: 'succeeded' },
      ],
    },
    expectedSegments: 4,
    completedSegments: 1,
  });
  assert.equal(incomplete.queriedLedger, false);
});
