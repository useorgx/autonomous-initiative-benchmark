const API = "https://openrouter.ai/api/v1";
export async function checkContinuityCredit({ key, fetchImpl = fetch } = {}) {
  if (!key)
    return {
      ok: false,
      reason: "OPENROUTER_API_KEY unavailable",
      model_calls_made: 0,
    };
  const response = await fetchImpl(`${API}/credits`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    return {
      ok: false,
      reason: `Credit preflight HTTP ${response.status}`,
      model_calls_made: 0,
    };
  const body = await response.json(),
    { total_credits: credits, total_usage: usage } = body.data ?? {};
  if (
    typeof credits !== "number" ||
    !Number.isFinite(credits) ||
    typeof usage !== "number" ||
    !Number.isFinite(usage)
  )
    return {
      ok: false,
      reason: "Measured account credits unavailable",
      model_calls_made: 0,
    };
  const remaining = credits - usage;
  return {
    ok: remaining > 0,
    reason: remaining > 0 ? null : "Provider account credits exhausted",
    remaining_usd: remaining,
    observed_at: new Date().toISOString(),
    model_calls_made: 0,
  };
}
