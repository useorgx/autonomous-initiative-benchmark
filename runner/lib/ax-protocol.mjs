/** Deterministic protocol smoke, never an autonomous-agent or tier result. */
export async function readBoundedResponse(response, limit = 262144) {
  if (!response.body) throw new Error('Empty response body');
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('Response body exceeds limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function probePublicReceiptAccess(receipt, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const checks = [];
  const check = async (name, action) => {
    const started = performance.now();
    try {
      await action();
      checks.push({ name, passed: true, elapsed_ms: Math.round(performance.now() - started) });
    } catch (error) {
      checks.push({ name, passed: false, error: String(error.message ?? error), elapsed_ms: Math.round(performance.now() - started) });
    }
  };
  const request = async (path, body) => {
    const response = await fetchImpl(`https://useorgx.com${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(timeoutMs),
      headers: body === undefined ? { Accept: 'text/plain' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.redirected) throw new Error('Unexpected redirect');
    return response;
  };
  await check('anonymous_access_guide', async () => {
    const response = await request('/auth.md');
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (!/^(text\/plain|text\/markdown)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Expected machine-readable text');
    const text = await readBoundedResponse(response);
    if (!text.includes('/api/v1/agent-work-receipts/validate') || !text.includes('does not persist')) throw new Error('Access/storage boundary missing');
  });
  await check('anonymous_valid_receipt', async () => {
    const response = await request('/api/v1/agent-work-receipts/validate', receipt);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (!/application\/json/i.test(response.headers.get('content-type') ?? '')) throw new Error('Expected JSON');
    const body = JSON.parse(await readBoundedResponse(response));
    if (body.ok !== true || body.valid !== true || body.receipt?.receipt_id !== receipt.receipt_id) throw new Error('Receipt validation or identity did not match');
    if (body.persistence?.stored !== false || body.persistence?.import_requires_authentication !== true) throw new Error('Storage/auth boundary missing');
  });
  await check('anonymous_invalid_receipt_rejected', async () => {
    const invalid = structuredClone(receipt);
    delete invalid.authority;
    const response = await request('/api/v1/agent-work-receipts/validate', invalid);
    if (![200, 400, 422].includes(response.status)) throw new Error(`HTTP ${response.status}`);
    if (!/application\/json/i.test(response.headers.get('content-type') ?? '')) throw new Error('Expected JSON');
    const body = JSON.parse(await readBoundedResponse(response));
    if (body.ok !== false || body.valid !== false || !Array.isArray(body.issues) || !body.issues.some((issue) => issue.path === '/authority')) throw new Error('Missing-authority receipt was not rejected with a field error');
  });
  return checks;
}
