import assert from 'node:assert/strict';
import test from 'node:test';
import { probePublicReceiptAccess, readBoundedResponse } from './ax-protocol.mjs';

const receipt = { receipt_id: 'awr:synthetic', authority: { mode: 'explicit' } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function responseFor(url, init) {
  if (url.endsWith('/auth.md')) return new Response('/api/v1/agent-work-receipts/validate does not persist', { headers: { 'content-type': 'text/plain' } });
  const valid = Boolean(JSON.parse(init.body).authority);
  return json(valid ? {
    ok: true, valid: true, receipt: { receipt_id: receipt.receipt_id }, persistence: { stored: false, import_requires_authentication: true },
  } : { ok: false, valid: false, issues: [{ path: '/authority' }] }, valid ? 200 : 400);
}

test('checks real field semantics, omits credentials and forbids redirects', async () => {
  const calls = [];
  const checks = await probePublicReceiptAccess(receipt, { fetchImpl: async (url, init) => {
    calls.push([url, init]);
    return responseFor(url, init);
  } });
  assert.equal(checks.length, 3);
  assert.ok(checks.every((c) => c.passed));
  assert.equal(calls.length, 3);
  for (const [, init] of calls) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(new Headers(init.headers).has('authorization'), false);
    assert.equal(new Headers(init.headers).has('cookie'), false);
  }
});

test('HTTP success cannot substitute for a correct validation response', async () => {
  for (const body of [{}, { ok: true, valid: false }, { ok: true, valid: true, receipt: { receipt_id: 'wrong' } }]) {
    const checks = await probePublicReceiptAccess(receipt, { fetchImpl: async (url, init) => url.endsWith('/auth.md') ? responseFor(url, init) : json(body) });
    assert.equal(checks.find((c) => c.name === 'anonymous_valid_receipt').passed, false);
    assert.equal(checks.find((c) => c.name === 'anonymous_invalid_receipt_rejected').passed, false);
  }
});

test('auth barriers, throttling and redirects remain failures', async () => {
  for (const status of [302, 401, 403, 429, 503]) {
    const checks = await probePublicReceiptAccess(receipt, { fetchImpl: async () => json({}, status) });
    assert.ok(checks.every((c) => !c.passed), `HTTP ${status}`);
  }
});

test('HTML login pages and malformed JSON remain failures', async () => {
  for (const response of [
    () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
  ]) {
    assert.ok((await probePublicReceiptAccess(receipt, { fetchImpl: async () => response() })).every((c) => !c.passed));
  }
});

test('a synthetic rejection must name the missing authority field', async () => {
  const checks = await probePublicReceiptAccess(receipt, { fetchImpl: async (url, init) => {
    if (init.body && !JSON.parse(init.body).authority) return json({ ok: false, valid: false, issues: [] }, 400);
    return responseFor(url, init);
  } });
  assert.equal(checks.at(-1).passed, false);
});

test('transport errors are retained for every check instead of producing an empty pass', async () => {
  const checks = await probePublicReceiptAccess(receipt, { fetchImpl: async () => { throw new Error('network unavailable'); } });
  assert.equal(checks.length, 3);
  assert.ok(checks.every((c) => !c.passed && c.error === 'network unavailable'));
});

test('bounded reader cancels oversized responses', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(16)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(readBoundedResponse(response, 20), /exceeds/);
  assert.equal(cancelled, true);
});
